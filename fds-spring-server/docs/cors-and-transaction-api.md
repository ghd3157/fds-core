# CORS 설정 및 결제 내역 API 엔드포인트 추가

## 작업 날짜
2026-08-04

---

## 1. CORS 설정 추가 (`SecurityConfig.java`)

### 배경
React 프론트엔드(`http://localhost:5173`)에서 Spring Boot API(`http://localhost:8080`) 호출 시
브라우저의 Same-Origin Policy에 의해 요청이 차단되는 문제 발생.

### 변경 내용

`SecurityFilterChain`에 `.cors()` 설정 추가 및 `CorsConfigurationSource` Bean 등록.

```java
@Bean
public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration configuration = new CorsConfiguration();
    configuration.setAllowedOriginPatterns(Arrays.asList("*"));
    configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(Arrays.asList("*"));
    configuration.setAllowCredentials(true);

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
}
```

> `setAllowedOrigins("*")` 대신 `setAllowedOriginPatterns("*")` 사용.
> `setAllowCredentials(true)`와 와일드카드 origin을 함께 쓰려면 OriginPatterns를 사용해야 함.

---

## 2. 결제 내역 페이징 API 추가

### 프론트엔드 요구 스펙

| 항목 | 내용 |
|------|------|
| 경로 | `GET /api/v1/transactions?page={p}&size={s}` |
| 응답 | Spring `Page<TransactionResponseDto>` |
| 정렬 | `transactionDate` 내림차순 |
| isFraud | 해당 transactionId에 FraudAlert 존재 시 `true` |

### 추가 파일

#### `TransactionResponseDto.java`

```java
private Long id;
private String transactionId;
private BigDecimal amount;
private String category;       // ← TransactionLog.merchantCategory
private String status;         // ← ProcessStatus.name()
@JsonProperty("isFraud")
private boolean isFraud;       // ← FraudAlert 존재 여부
private LocalDateTime createdAt; // ← transactionDate
```

> **주의**: Lombok `@Getter` + primitive `boolean isFraud`는 Jackson이 `fraud` 키로 직렬화함.
> `@JsonProperty("isFraud")`로 키 이름 명시 필수.

#### `TransactionController.java`

```
GET /api/v1/transactions?page=0&size=10
→ TransactionService.getTransactions(page, size)
→ Page<TransactionResponseDto> 반환
```

#### `TransactionService.java` — N+1 방지

초기 구현의 `existsByTransactionLog()` 루프(페이지 10건 → 10번 쿼리) 를 배치 조회로 개선:

```java
// 페이지 내 전체 ID를 한 번의 IN 쿼리로 조회
List<Long> ids = logPage.getContent().stream()
        .map(TransactionLog::getId)
        .collect(Collectors.toList());
Set<Long> fraudIds = fraudAlertRepository.findFraudTransactionLogIds(ids);

return logPage.map(log -> TransactionResponseDto.of(log, fraudIds.contains(log.getId())));
```

#### `FraudAlertRepository.java` — 배치 쿼리 메서드 추가

```java
@Query("SELECT f.transactionLog.id FROM FraudAlert f WHERE f.transactionLog.id IN :ids")
Set<Long> findFraudTransactionLogIds(@Param("ids") List<Long> ids);
```

#### `TransactionLogRepository.java` — 정렬 쿼리 메서드 추가

```java
Page<TransactionLog> findAllByOrderByTransactionDateDesc(Pageable pageable);
```

---

## 3. Docker Compose Kafka 설정 보완 (`docker-compose.yml`)

단일 노드 Kafka 환경에서 내부 토픽 복제 인수 관련 경고 제거를 위해 환경변수 추가:

```yaml
KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
```
