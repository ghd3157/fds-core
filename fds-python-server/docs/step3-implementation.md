# [Step 3] Pandas 전처리 파이프라인 및 더미 AI 추론 로직 구현 기록
> 참고 명세서: `docs/python-requirements.md`  
> 작업 일시: 2026-07-15

## 개요

Step 3 목표: Kafka로 수신된 결제 로그를 Pandas로 전처리하고, 실제 AI 모델 연동 전까지  
규칙 기반 더미 알고리즘으로 사기 위험도를 판별하여 결과를 Kafka로 반환하는 파이프라인 구축.

---

## 아키텍처 — 메시지 처리 파이프라인

```
Kafka (payment-log-topic)
    ↓ raw bytes
_process_message()          [kafka_client.py]
    ↓ PaymentLogInput (Pydantic 검증 완료)
analyze_fraud_risk()        [fraud_detector.py]  ← Step 3 신규 모듈
    ├─ _preprocess()        → Pandas DataFrame + 파생 변수 생성
    └─ _apply_rules()       → (isFraud, fraudScore, reason) 반환
    ↓ FraudResultOutput
produce_fraud_result()      [kafka_client.py]
    ↓
Kafka (fraud-result-topic)
```

---

## 신규 파일: `app/fraud_detector.py`

### 역할

`kafka_client.py` 로부터 분리된 **사기 탐지 전용 모듈**.  
Step 4에서 실제 AI 모델 연동 시 이 파일의 `_apply_rules()` 함수만 교체하면 됨.

### 전처리 파이프라인 (`_preprocess`)

`PaymentLogInput` Pydantic 객체를 Pandas DataFrame으로 변환하고 파생 변수를 생성한다.

| 파생 컬럼 | 타입 | 설명 |
|---|---|---|
| `transaction_hour` | `int` | `transactionDate` 에서 추출한 시각(0~23) |
| `transaction_dow` | `int` | 요일 (0=월요일 ~ 6=일요일) |
| `is_night` | `bool` | 새벽 시간대(0~5시) 여부 |

```python
df["transactionDate"] = pd.to_datetime(df["transactionDate"], utc=True)
df["transaction_hour"] = df["transactionDate"].dt.hour
df["transaction_dow"]  = df["transactionDate"].dt.dayofweek
df["is_night"]         = df["transaction_hour"].isin(NIGHT_HOURS)
```

### 더미 규칙 엔진 (`_apply_rules`)

| 우선순위 | 판별 조건 | `isFraud` | `fraudScore` |
|---|---|---|---|
| 1순위 | `amount ≥ 5,000` | `True` | 0.50 ~ 0.95 (금액에 비례) |
| 2순위 | 새벽(0~5시) + 고위험 업종 | `True` | 0.82 |
| 기본 | 해당 없음 | `False` | 0.05 |

고위험 업종 목록: `gambling`, `crypto`, `adult`, `atm_withdrawal`

금액 기반 스코어 계산식:
```python
score = min(0.5 + (amount - 5000) / 5000 * 0.4, 0.95)
```

### 공개 인터페이스

```python
def analyze_fraud_risk(data: PaymentLogInput) -> FraudResultOutput:
    df = _preprocess(data)
    is_fraud, score, reason = _apply_rules(df)
    return FraudResultOutput(
        transactionId=data.transactionId,
        isFraud=is_fraud,
        fraudScore=score,
        reason=reason,
    )
```

---

## 수정 파일: `app/kafka_client.py`

### 변경 내용

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| `analyze_fraud_risk` 구현 위치 | `kafka_client.py` 내부 인라인 stub | `fraud_detector.py` 분리 모듈 |
| 더미 결과 생성 | `FraudResultOutput(isFraud=False, fraudScore=0.0, ...)` 하드코딩 | `analyze_fraud_risk(input_data)` 호출로 교체 |
| import | — | `from app.fraud_detector import analyze_fraud_risk` 추가 |

### `_process_message` 최종 형태

```python
def _process_message(raw_value: bytes) -> None:
    try:
        payload = json.loads(raw_value.decode("utf-8"))
        input_data = PaymentLogInput(**payload)
        logger.info("Message parsed OK - transactionId: %s", input_data.transactionId)

        result = analyze_fraud_risk(input_data)   # fraud_detector 호출
        produce_fraud_result(result)              # Kafka 발행

    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("Message parse/validation failed: %s", exc)
    except Exception as exc:
        logger.error("Unexpected error while processing message: %s", exc, exc_info=True)
```

---

## 구현 후 파일 구조

```
fds-python-server/
├── app/
│   ├── __init__.py
│   ├── main.py            # FastAPI 앱 + 라이프사이클 훅
│   ├── schemas.py         # Pydantic 입출력 모델
│   ├── kafka_client.py    # Kafka 컨슈머 & 프로듀서 (파이프라인 오케스트레이터)
│   └── fraud_detector.py  # ✨ 신규: 전처리 + 더미 사기 탐지 로직
├── docs/
│   ├── python-requirements.md
│   ├── step1-step2-implementation.md
│   ├── step3-implementation.md  ← 현재 문서
│   └── kafka-consumer-debug.md
└── requirements.txt
```

---

## Step 4 연동 포인트

`fraud_detector.py` 의 `_apply_rules()` 함수를 아래와 같이 교체:

```python
# Step 4: 모델 추론으로 교체할 위치
features = build_feature_matrix(df)
score    = model.predict_proba(features)[0][1]
is_fraud = score >= FRAUD_THRESHOLD
return is_fraud, round(score, 4), "모델 추론 결과"
```

`analyze_fraud_risk()` 의 시그니처와 반환 타입(`FraudResultOutput`)은 변경 없이 유지되므로  
`kafka_client.py` 및 다른 모듈에 영향 없음.
