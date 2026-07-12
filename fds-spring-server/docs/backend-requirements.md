# Spring Boot FDS (Fraud Detection System) 백엔드 구현 명세서

## 행동 지침 (Behavioral Guidelines)

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

---

## 🎯 Domain: 금융/신용카드 실시간 결제 로그 이상 탐지

## 1. Domain & DB 설계 (JPA)
- [x] **Admin (관리자 엔티티):** FDS 대시보드 접근 권한을 가진 관리자 (아이디, 해싱된 비밀번호, Role)
  - `domain/Admin.java` — Role: ROLE_ADMIN, ROLE_VIEWER
- [x] **Transaction_Log (결제 로그 엔티티):** 공공 신용카드 결제 데이터 (transactionId, userId, amount, merchantCategory, latitude, longitude, transactionDate, status)
  - `domain/TransactionLog.java` — ProcessStatus: PENDING, COMPLETE / `complete()` 도메인 메서드 포함
- [x] **Fraud_Alert (이상 탐지 알람 엔티티):** AI가 위험하다고 판단한 내역 (알람ID, 로그ID, 위험스코어, 탐지사유, 확인여부)
  - `domain/FraudAlert.java` — @ManyToOne(FetchType.LAZY) → TransactionLog

## 2. 보안 및 인증 (Spring Security + JWT)
- [x] Security FilterChain 설정 (대시보드 API 접근 권한 제어)
  - `security/SecurityConfig.java` — CSRF 비활성화, Stateless, 경로별 권한 설정
- [x] JWT 발급(Access/Refresh Token) 및 검증을 위한 `JwtProvider` 유틸리티 구현
  - `security/JwtProvider.java` — jjwt 0.12.6, @Value 주입, generateAccessToken/RefreshToken/validate/getRole
  - `security/JwtAuthenticationFilter.java` — OncePerRequestFilter, Bearer 토큰 추출 및 SecurityContext 설정
  - `security/AdminDetailsService.java` — UserDetailsService 구현, DB에서 Admin 조회
- [x] 관리자 로그인/로그아웃 처리를 위한 `AuthController` 구현
  - `controller/AuthController.java` — POST /api/auth/login → TokenResponse (accessToken, refreshToken)
  - `dto/LoginRequest.java`, `dto/TokenResponse.java`
  - `repository/AdminRepository.java`
- [x] 서버 기동 시 기본 관리자 계정(admin) 자동 생성
  - `DataInitializer.java` — CommandLineRunner, BCrypt 암호화 사용

## 3. 데이터 수집 및 비동기 파이프라인 (Kafka Producer)
- [x] 결제 로그 트래픽을 지속적으로 수신받는 `LogIngestionController` 구현
  - `controller/LogIngestionController.java` — POST /api/v1/logs → 202 Accepted
- [x] 수신한 데이터를 MariaDB에 저장 (Status: `PENDING`)
  - `service/LogIngestionService.java` — DTO → TransactionLog(PENDING) 변환 후 저장
  - `repository/TransactionLogRepository.java`
- [x] 수신한 데이터를 JSON 직렬화하여 Kafka Topic(`payment-log-topic`)으로 비동기 전송
  - `service/KafkaProducerService.java` — ObjectMapper 직렬화, transactionId를 파티션 키로 사용
  - `dto/PaymentLogRequestDto.java`

## 4. AI 분석 결과 수신 및 후처리 (Kafka Consumer)
- [x] Python 서버가 분석을 마친 결과를 Kafka Topic(`fraud-result-topic`)에서 수신하는 `KafkaResultListener` 구현
  - `kafka/KafkaResultListener.java` — @KafkaListener, String 수신 후 ObjectMapper 역직렬화
  - `dto/FraudResultDto.java`
- [x] 수신된 위험 스코어(Risk Score)를 기준으로 MariaDB의 로그 엔티티 상태(`COMPLETE`) 및 `Fraud_Alert` 엔티티 업데이트
  - `service/FraudProcessService.java` — 임계치 80점 기준 분기 처리
  - `repository/FraudAlertRepository.java`
- [x] Redis를 활용해 최근 24시간 탐지 통계 데이터 캐싱 업데이트
  - `fds:stats:{date}:fraud`, `fds:stats:{date}:normal` 키로 일별 카운터 관리

## 5. 실시간 알림 기능 (WebSocket)
- [x] Spring WebSocket (`STOMP`) 설정
  - `websocket/WebSocketConfig.java` — 엔드포인트: /ws-fds, 브로커: /topic, SockJS 폴백, CORS 허용
- [x] 위험 스코어가 임계치(예: 80점 이상) 초과 시, 해당 정보를 즉시 WebSocket 채널(`/topic/alerts`)로 브로드캐스트
  - `websocket/AlertNotificationService.java` — SimpMessagingTemplate 사용
  - `dto/AlertPayload.java`
  - `FraudProcessService` 연동 완료

## 6. 프론트엔드 연동 REST API
- [x] **대시보드 통계 API:** Redis에서 최근 24시간 정상/이상 결제 비율, 시간대별 트래픽 반환
  - `controller/DashboardController.java` — GET /api/v1/dashboard/stats
  - `service/DashboardService.java` — Redis에서 오늘 날짜 키 조회 후 건수/비율 계산
  - `dto/DashboardStatsResponseDto.java`
- [x] **이상 탐지 내역 API:** 위험 스코어 순 또는 최신순으로 탐지 내역 페이징(Pagination) 조회
  - `controller/DashboardController.java` — GET /api/v1/dashboard/history?sort=riskScore,desc
  - `service/DashboardService.java` — Pageable 위임, Page<FraudHistoryResponseDto> 반환
  - `dto/FraudHistoryResponseDto.java` — 정적 팩토리 메서드 from(FraudAlert)
  - `repository/FraudAlertRepository.java` — Page<FraudAlert> findAll(Pageable) 추가