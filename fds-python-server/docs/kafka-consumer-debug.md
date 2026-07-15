# Kafka 컨슈머 디버깅 및 개선 기록

## 문제 상황

Kafka 컨슈머 백그라운드 루프가 5초마다 하트비트 로그를 출력하며 정상 동작하는 것처럼 보였지만,  
Java 서버가 `payment-log-topic`에 메시지를 지속 발행하는 상황에서도 **메시지가 전혀 수신되지 않음**.

---

## 원인 분석

### 점검 1 — `auto.offset.reset` / 컨슈머 그룹 설정

**결론: 직접적인 원인은 아니지만, 복합 요인으로 작용.**

`CONSUMER_GROUP = "fds-test-group-999"` 는 브로커에 오프셋 커밋 이력이 없었으므로  
`auto.offset.reset = "earliest"` 에 의해 처음부터 메시지를 읽어야 정상이었다. 그러나 두 가지 문제가 있었다:

1. `on_assign` 콜백이 없어 브로커가 파티션 할당(JoinGroup → SyncGroup)을 실제로 완료했는지 **확인 수단이 없었음**.
2. `on_assign` 내 명시적 seek 없이 `auto.offset.reset` 에만 의존 — 이 설정은 **커밋된 오프셋이 없고 파티션 할당이 완료된 경우에만** 적용됨.

### 점검 2 — 네트워크 리스너 (Docker / Windows 환경)

**결론: 2차 원인 — `FIND_COORDINATOR` 타임아웃 확인됨.**

컨테이너 내부에서 `kafka-consumer-groups.sh` 실행 시 아래 오류 발생:

```
TimeoutException: Call(callName=describeGroups(api=FIND_COORDINATOR), ...) timed out
Caused by: DisconnectException: node 1 being disconnected
```

KRaft 컨트롤러가 `FindCoordinator` 요청을 브로커로 올바르게 라우팅하지 못하는 상태.  
`confluent-kafka`(librdkafka)도 동일한 핸드셰이크를 거치므로 영향을 받음:

```
1. Bootstrap 연결 (127.0.0.1:9092) → 성공 (메타데이터 수신 → 하트비트 출력)
2. 그룹 코디네이터 FindCoordinator 요청 → 타임아웃 / 연결 끊김
3. JoinGroup / SyncGroup 미완료 → 파티션 미할당 → 메시지 수신 불가
```

`advertised.listeners=PLAINTEXT://localhost:9092` 는 올바르게 설정되어 있었으므로  
Docker 포트 매핑 문제가 아닌 KRaft 내부 라우팅 문제로 확인됨.

### 점검 3 — `poll()` 로직 버그

**결론: 확인됨 — 파티션 할당 여부가 보이지 않고 오프셋 seek가 암묵적으로 처리됨.**

```python
# 수정 전 (문제 있는 코드)
consumer.subscribe([CONSUMER_TOPIC])
# on_assign 콜백 없음 → 파티션이 실제로 할당됐는지 확인 불가
# auto.offset.reset 에 암묵적으로 의존
```

`consumer.subscribe()` 는 비동기 호출이며, 실제 파티션 할당은  
그룹 코디네이터 JoinGroup/SyncGroup 완료 후 **첫 번째 `poll()` 내부**에서 이루어짐.  
`on_assign` 콜백이 없으면 루프가 정상처럼 보이지만(하트비트 출력) 코디네이터 응답을 기다리며 조용히 대기 중인 상태.

---

## 적용된 수정 사항

### 1. `on_assign` / `on_revoke` 콜백 추가

```python
def _on_assign(consumer, partitions):
    # ⭐ Python 3.14 SystemError 방지: str(p) 대신 속성 직접 추출
    safe_partitions = [f"{p.topic}:{p.partition}" for p in partitions]
    logger.info("Partitions assigned: %s", safe_partitions)
    for p in partitions:
        p.offset = -2  # OFFSET_BEGINNING — auto.offset.reset 암묵적 의존 제거
    consumer.assign(partitions)

def _on_revoke(consumer, partitions):
    safe_partitions = [f"{p.topic}:{p.partition}" for p in partitions]
    logger.info("Partitions revoked: %s", safe_partitions)
```

- `PARTITION ASSIGNED` 로그 출력 → 그룹 코디네이터 핸드셰이크 성공, 메시지 수신 가능
- `PARTITION ASSIGNED` 미출력 → 코디네이터가 원인 (점검 2 확인)
- `offset = -2` (OFFSET_BEGINNING) 으로 명시적 seek, `auto.offset.reset` 의존 제거

### 2. 컨슈머 그룹 ID 복구

```python
# 수정 전
CONSUMER_GROUP = "fds-test-group-999"  # 디버깅용 임시 그룹

# 수정 후
CONSUMER_GROUP = "fds-python-group"    # 정식 그룹 ID
```

### 3. 컨슈머 설정 강화

```python
consumer = Consumer({
    "bootstrap.servers": KAFKA_BROKER,
    "group.id": CONSUMER_GROUP,
    "auto.offset.reset": "earliest",
    "enable.auto.commit": "true",        # 추가: 자동 커밋 명시적 활성화
    "auto.commit.interval.ms": "1000",   # 추가: 1초마다 오프셋 커밋
    "session.timeout.ms": "30000",       # 추가: 30초 후 브로커가 컨슈머 사망 판단
    "heartbeat.interval.ms": "3000",     # 추가: 3초마다 하트비트 (session_timeout / 3 미만)
    "max.poll.interval.ms": "300000",    # 추가: poll 배치당 최대 처리 시간
})
```

---

## 정상 동작 확인 방법

서버 재시작 후 아래 순서로 로그가 출력되어야 함:

```
INFO  Kafka consumer starting - topic=payment-log-topic group=fds-python-group
INFO  Waiting for partition assignment from group coordinator...
INFO  Partitions assigned: ['payment-log-topic:0']   ← 반드시 출력되어야 함
INFO  Message parsed OK - transactionId: TXN-XXXXX
INFO  Kafka produce success -> topic=fraud-result-topic partition=0 offset=N
```

`Partitions assigned` 로그가 출력되지 않으면 Kafka 컨테이너 재시작:

```bash
docker restart fds-kafka
```

---

## 수정된 파일

| 파일 | 변경 내용 |
|---|---|
| `app/kafka_client.py` | `_on_assign`, `_on_revoke` 추가, 컨슈머 설정 강화, 그룹 ID 복구, 전체 print문 logging으로 교체 |
