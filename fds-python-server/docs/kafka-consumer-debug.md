# Kafka Consumer Debug & Improvements

## Problem

The Kafka consumer background loop was running and printing heartbeat logs every 5 seconds, but **no messages were being consumed** from `payment-log-topic` despite the Java server actively producing to it.

---

## Diagnostic Analysis

### Check 1 — `auto.offset.reset` / Consumer Group

**Verdict: Not the root cause, but a contributing factor.**

`CONSUMER_GROUP = "fds-test-group-999"` had no committed offset history in the broker, so `auto.offset.reset = "earliest"` should have caused the consumer to read from the beginning. However, two issues were hiding the problem:

1. Without an `on_assign` callback, there was **no way to confirm** whether the broker actually completed partition assignment (JoinGroup → SyncGroup) before messages were polled.
2. Without an explicit seek in `on_assign`, the consumer silently relied on `auto.offset.reset`, which only applies when **no committed offset exists AND the partition assignment has completed successfully**.

### Check 2 — Network Listener (Docker / Windows)

**Verdict: Potential secondary cause — confirmed `FIND_COORDINATOR` timeout.**

Running `kafka-consumer-groups.sh` from inside the container returned:

```
TimeoutException: Call(callName=describeGroups(api=FIND_COORDINATOR), ...) timed out
Caused by: DisconnectException: node 1 being disconnected
```

This indicates the KRaft controller is not cleanly routing `FindCoordinator` requests back to the broker. librdkafka (used by `confluent-kafka`) goes through the same handshake:

```
1. Bootstrap connect to 127.0.0.1:9092 → OK (metadata received → heartbeat logs appear)
2. FindCoordinator request for group → TIMEOUT / disconnect
3. JoinGroup / SyncGroup never completes → partitions never assigned → no messages consumed
```

`advertised.listeners=PLAINTEXT://localhost:9092` was correctly set, so this is a KRaft internal routing issue, not a Docker port-mapping issue.

### Check 3 — `poll()` Logic Bug

**Verdict: Confirmed — partition assignment was invisible and offset seek was implicit.**

```python
# Before (problematic)
consumer.subscribe([CONSUMER_TOPIC])
# No on_assign callback → no confirmation that partitions were ever assigned
# auto.offset.reset relied upon implicitly
```

`consumer.subscribe()` is asynchronous. The actual partition assignment happens **inside the first `poll()` call** after the group coordinator completes JoinGroup/SyncGroup. Without an `on_assign` callback, the loop appeared healthy (heartbeats firing) but was silently stuck waiting for coordinator confirmation that never came.

---

## Changes Made

### 1. Added `on_assign` / `on_revoke` Callbacks

```python
def _on_assign(consumer, partitions):
    print(f"[PARTITION ASSIGNED] Partitions assigned: {[str(p) for p in partitions]}")
    for p in partitions:
        p.offset = -2  # OFFSET_BEGINNING — explicit seek, not relying on auto.offset.reset
    consumer.assign(partitions)

def _on_revoke(consumer, partitions):
    print(f"[PARTITION REVOKED] Partitions revoked: {[str(p) for p in partitions]}")
```

- **`[PARTITION ASSIGNED]`** log firing = group coordinator handshake succeeded → messages will flow.
- **`[PARTITION ASSIGNED]` NOT firing** = coordinator is the culprit (confirms Check 2).
- Explicit `offset = -2` (OFFSET_BEGINNING) replaces the implicit `auto.offset.reset` dependency.

### 2. Consumer Group ID Restored

```python
# Before
CONSUMER_GROUP = "fds-test-group-999"  # debug group left behind

# After
CONSUMER_GROUP = "fds-python-group"    # canonical group ID
```

### 3. Consumer Config Hardened

```python
consumer = Consumer({
    "bootstrap.servers": KAFKA_BROKER,
    "group.id": CONSUMER_GROUP,
    "auto.offset.reset": "earliest",
    "enable.auto.commit": "true",        # added: explicit commit enabled
    "auto.commit.interval.ms": "1000",   # added: commit every 1 second
    "session.timeout.ms": "30000",       # added: broker considers consumer dead after 30s
    "heartbeat.interval.ms": "3000",     # added: heartbeat every 3s (< session_timeout / 3)
    "max.poll.interval.ms": "300000",    # added: max processing time per poll batch
})
```

### 4. All Korean Print Statements Replaced with English

All `print()` and `logger.*()` calls converted to plain English for consistency.

---

## How to Confirm the Fix

After restarting the server, the log sequence should be:

```
[BOOT] Kafka consumer task starting...
[BOOT] Subscribed to topic: payment-log-topic | group: fds-python-group
[BOOT] Waiting for partition assignment from group coordinator...
[PARTITION ASSIGNED] Partitions assigned: ['payment-log-topic [0] @ -2']   ← must appear
[HEARTBEAT] Consumer alive - polls: 5
[DEBUG] Message caught from Kafka: b'{"transactionId": ...}'
[SUCCESS] Pydantic parse OK - transactionId: TXN-XXXXX
```

If `[PARTITION ASSIGNED]` does **not** appear, restart the Kafka container:

```bash
docker restart fds-kafka
```

---

## Files Modified

| File | Change |
|---|---|
| `app/kafka_client.py` | Added `_on_assign`, `_on_revoke`; hardened consumer config; restored group ID; translated all Korean strings to English |
