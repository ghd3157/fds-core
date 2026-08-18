# 트러블슈팅 및 버그 픽스 내용 정리 (2026-08-18)

오늘 Spring Boot 백엔드와 프론트엔드 연동 과정에서 발생한 파이프라인 문제들을 해결한 내용입니다.

## 1. API 테스트 케이스 고도화 (AI 이상탐지 규칙 반영)
- `api-test.http` 파일을 Python AI 이상탐지 서버의 로직에 맞게 통합 테스트용으로 개편.
- **TC-01 ~ TC-05** 도입:
  - 정상/고액/새벽고위험/경계값 등 다양한 시나리오 구성
  - `amount`를 규칙 범위 내에서 동적 랜덤값(`$random.integer`)으로 생성하도록 수정하여 테스트의 신뢰성을 높임
  - `transactionId`를 고유 식별자(`$uuid`)로 매번 생성하여 DB 제약조건 회피

## 2. 시간 파싱 및 타임존(Timezone) 문제 해결
- **문제점:** Kafka로 전송하기 위해 외부에서 들어온 ISO-8601 형식의 날짜(`2026-08-18T02:30:00+09:00`)를 파싱하는 과정에서 `LocalDateTime`이 타임존(Offset) 정보를 처리하지 못해 역직렬화 실패 및 500 에러 발생.
- **해결 방안:** 
  - `PaymentLogRequestDto`의 `transactionDate` 필드 타입을 `LocalDateTime`에서 **`OffsetDateTime`**으로 변경하여 정상적으로 파싱.
  - `LogIngestionService`에서 DB 저장 시 `atZoneSameInstant(ZoneId.of("Asia/Seoul")).toLocalDateTime()`을 사용해 KST 기준으로 변환하여 MariaDB `transaction_log` 테이블에 저장. Python AI 서버로는 타임존 정보가 보존된 채 Kafka로 전달됨.

## 3. WebSocket 핸드쉐이크 인증 (JWT) 차단 문제 해결
- **문제점:** 브라우저(SockJS)가 `/ws-fds` 엔드포인트로 핸드쉐이크 요청을 보낼 때 토큰이 없어 Spring Security JWT 필터에서 401(또는 403) 예외가 발생하여 연결 차단.
- **해결 방안:** 
  - `SecurityConfig`의 `authorizeHttpRequests` 설정에 `.requestMatchers("/ws-fds/**").permitAll()`을 추가하여 웹소켓 연결 시 JWT 검증을 우회하도록 처리.

## 4. WebSocket Topic 불일치 및 디버그 로깅 강화
- **문제점:** Spring 백엔드의 메시지 브로커는 `/topic/alerts`로 메시지를 발행하나 프론트엔드는 `/topic/fraud-alerts`를 구독 중이었으며, 연결 URL도 불일치(`/ws` vs `/ws-fds`).
- **해결 방안:**
  - `useWebSocket.ts` (프론트엔드)에서 `WS_URL`을 `http://localhost:8080/ws-fds`로, `TOPIC`을 `/topic/alerts`로 백엔드와 일치하도록 수정.
  - `AlertNotificationService`와 `FraudProcessService`에 ObjectMapper를 활용하여 직렬화된 JSON Payload와 목적지(Topic)를 명확히 출력하는 디버그 로그 추가, 메시지 누락 지점을 쉽게 파악할 수 있도록 고도화.
