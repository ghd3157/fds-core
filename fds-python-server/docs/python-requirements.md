# Python FastAPI FDS (이상 탐지) 서버 요구사항 명세서

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

## 1. 프로젝트 개요
- **목적**: Spring Boot 서버로부터 전송된 결제 로그 데이터를 Kafka로 수신하여, Pandas로 전처리하고 AI 모델을 통해 이상(Fraud) 여부를 판별한 뒤 다시 Kafka로 반환한다.
- **Framework**: FastAPI (비동기 처리 최적화)

## 2. Kafka 통신 스펙 (매우 중요)
- **Broker 주소**: `localhost:9092`
- **수신 (Consumer) Topic**: `payment-log-topic`
- **송신 (Producer) Topic**: `fraud-result-topic`

## 3. 데이터 송수신 규격 (JSON)
### [Input] 수신 데이터 (자바 -> 파이썬)
- `transactionId` (String)
- `userId` (String)
- `amount` (Double)
- `merchantCategory` (String)
- `transactionDate` (String, ISO-8601)
- `latitude` (Double)
- `longitude` (Double)

### [Output] 송신 데이터 (파이썬 -> 자바)
- `transactionId` (String): 원본 결제 번호
- `isFraud` (Boolean): AI 판별 결과 (사기 여부)
- `fraudScore` (Double): 0.0 ~ 1.0 사이의 위험도 스코어
- `reason` (String): 판별 근거 (예: "Abnormal location", "High amount" 등)

## 4. 단계별 구현 목표
- [Step 1] Kafka 비동기 Producer / Consumer 뼈대 구축 (Background Task 연동)
- [Step 2] Pydantic을 활용한 데이터 검증 모델(Schema) 작성
- [Step 3] Pandas 전처리 파이프라인 및 더미(Dummy) AI 추론 로직 구현
- [Step 4] (추후) 실제 머신러닝/딥러닝 모델 연동