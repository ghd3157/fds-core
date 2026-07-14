# Kafka Producer 개선 내역

> 작성일: 2026-07-15

---

## 배경 (Background)

Java Spring Boot 서버 콘솔에 `[Kafka] Message sent | topic=payment-log-topic` 성공 로그가 정상적으로 출력되고 있었음에도 불구하고, Python(FDS) 서버에서 해당 메시지를 전혀 수신하지 못하는 문제가 발생하였다.

---

## 원인 분석 (Root Cause Analysis)

### 1. 비동기 전송으로 인한 허위 성공 로그

`KafkaTemplate.send()`는 **비동기(Non-blocking)** 메서드로, `CompletableFuture`를 반환한다.  
기존 코드는 `send()` 호출 직후 성공 로그를 기록하였기 때문에, **브로커(Broker)에 실제로 메시지가 전달되었는지와 무관하게** 항상 성공 로그가 출력되었다.

```java
// 변경 전 - 브로커 수신 여부와 무관하게 즉시 로그 출력
kafkaTemplate.send(TOPIC, dto.getTransactionId(), payload);
log.info("[Kafka] Message sent | topic={} ...");  // 실제 전달 보장 없음
```

### 2. Flush 누락으로 인한 버퍼 잔류 가능성

`send()` 호출 후 `flush()`를 명시적으로 호출하지 않으면, 내부 네트워크 버퍼에 메시지가 남아 있다가 지연 전송되거나, 애플리케이션 종료 시 유실될 가능성이 존재한다.

### 3. Producer 신뢰성 설정 부재

`application.yml`에 `acks`, `retries`, `linger.ms` 등 핵심 Producer 신뢰성 설정이 명시되지 않아 기본값에 의존하고 있었다.

---

## 개선 내용 (Changes)

### `KafkaProducerService.java`

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 전송 결과 확인 | 없음 (Fire & Forget) | `CompletableFuture.whenComplete()` 콜백으로 브로커 ACK 후 로그 기록 |
| 실패 감지 | 불가 | 전달 실패 시 `log.error()`로 예외 및 원인 기록 |
| 버퍼 강제 전송 | 없음 | `kafkaTemplate.flush()` 호출로 즉시 브로커에 전송 |
| 성공 로그 정보 | topic, transactionId | topic, partition, offset, transactionId (실제 수신 확인 후) |

```java
// 변경 후 - 브로커 실제 수신 확인 시점에 로그 기록
CompletableFuture<SendResult<String, String>> future =
        kafkaTemplate.send(TOPIC, dto.getTransactionId(), payload);

future.whenComplete((result, ex) -> {
    if (ex != null) {
        log.error("[Kafka] Delivery FAILED | topic={} | transactionId={} | reason={}",
                TOPIC, dto.getTransactionId(), ex.getMessage(), ex);
    } else {
        log.info("[Kafka] Delivery confirmed | topic={} | partition={} | offset={} | transactionId={}",
                TOPIC,
                result.getRecordMetadata().partition(),
                result.getRecordMetadata().offset(),
                dto.getTransactionId());
    }
});

// 버퍼에 남아 있는 메시지를 브로커로 즉시 flush
kafkaTemplate.flush();
```

### `application.yml` (Kafka Producer 설정)

```yaml
producer:
  key-serializer: org.apache.kafka.common.serialization.StringSerializer
  value-serializer: org.apache.kafka.common.serialization.StringSerializer
  acks: all          # 모든 ISR 복제본이 수신 확인 후 ack (데이터 유실 방지)
  retries: 3         # 일시적 오류 시 재시도 횟수
  properties:
    linger.ms: 0     # 배치 대기 시간 0 → 즉시 전송
```

| 설정 | 값 | 효과 |
|------|----|------|
| `acks` | `all` | ISR(In-Sync Replica) 전체 수신 확인 후 ack → 데이터 유실 방지 |
| `retries` | `3` | 일시적 네트워크 오류 발생 시 자동 재시도 |
| `linger.ms` | `0` | 배치 대기 없이 즉시 전송 (기본값과 동일하나 명시적으로 선언) |

---

## 기대 효과 (Expected Outcome)

- 브로커가 실제로 메시지를 수신·확인한 시점에 로그가 기록되어 **허위 성공 로그 제거**
- `flush()` 추가로 **버퍼 잔류로 인한 메시지 유실 가능성 차단**
- 전달 실패 시 즉시 에러 로그 출력으로 **장애 원인 추적 용이성 향상**
- `acks=all` 설정으로 **브로커 측 데이터 내구성(Durability) 강화**
