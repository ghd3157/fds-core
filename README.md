# FDS Core — 실시간 신용카드 이상 거래 탐지 시스템 (v2.0)

실시간 결제 로그를 **Kafka 비동기 스트림 → Redis 사용자 결제빈도 피처 → Rule Engine + LightGBM 하이브리드 AI 탐지 → WebSocket 실시간 알림 & 관리자 대시보드**까지 End-to-End로 처리하는 실시간 FDS(Fraud Detection System) 프로젝트입니다.

> 📘 **통합 상세 설계서 (Single Source of Truth)**: [FDS-DESIGN.md](./FDS-DESIGN.md)

---

## 주요 기능

- **비동기 이벤트 파이프라인**: Spring Boot(`afterCommit` + `userId` 파티션 키) ↔ Apache Kafka(KRaft) ↔ Python AI(`enable.auto.commit=False` 수동 커밋 + `fds-dlq-topic` 격리) ↔ Spring Boot(`COMPLETE` 멱등성 가드 + `UNIQUE` 제약)
- **하이브리드 이상 탐지 (Rule + LightGBM + TreeSHAP)**:
  - Redis `ZSET` 기반 실시간 사용자 결제빈도(`1분` / `10분` / `1시간`) 산출
  - KRW 원화 기준 4대 정책 룰(`R1_BURST_1M`, `R2_BURST_10M`, `R3_HIGH_AMOUNT`, `R4_NIGHT_HIGH_RISK`) + Kaggle Sparkov 스키마 호환 `LightGBM` 모델 결합 및 TreeSHAP 한글 탐지 사유 생성
- **보안 & 권한 제어**: JWT Access/Refresh 로테이션, Redis 로그아웃 블랙리스트, 수집 API `X-API-Key` 인증, STOMP `CONNECT` JWT 검증, `ROLE_ADMIN` / `ROLE_VIEWER` RBAC
- **관리자 실시간 대시보드 (`fds-frontdend`)**:
  - KPI 카드 4종, 최근 24시간 시간대별 트래픽 차트, 카테고리별 이상 결제 도넛 차트
  - WebSocket 실시간 Toast 알림(클릭 시 상세 모달) + 1.5초 디바운스 자동 갱신
  - 이상 탐지 알람 사기 확정/오탐 처리 워크플로우(`/alerts`) 및 전체 거래 검색·필터(`/transactions`)
- **실시간 결제 트래픽 시뮬레이터 (`simulator/traffic_simulator.py`)**: 정상·고액·새벽고위험·단시간 연타(Burst)·Sparkov CSV 재생 모드 지원

---

## 프로젝트 구조

```text
fds-core/
├── FDS-DESIGN.md              # v2.0 통합 상세 설계서
├── Jenkinsfile                # 5단계 Declarative CI/CD 파이프라인 (병렬 테스트·빌드·CD 배포·헬스검증)
├── docker-compose.yml         # MariaDB 10.11, Redis 7.2, Apache Kafka 3.7 (KRaft 이중 리스너)
├── docker-compose.app.yml     # Spring · Python AI · React Nginx 컨테이너 CD 스택
├── docker-compose.jenkins.yml # 로컬 Jenkins CI/CD 서버 (Docker-out-of-Docker + JCasC)
├── jenkins/                   # Jenkins Dockerfile, plugins.txt, casc.yaml
├── .env.example               # 환경변수 템플릿
├── fds-spring-server/         # Spring Boot 3.5 (Java 17) 백엔드 API · Kafka · WebSocket · Dockerfile
├── fds-python-server/         # FastAPI · LightGBM · Isolation Forest · TreeSHAP · Redis · Dockerfile
├── fds-frontdend/             # React 19 · Vite · TypeScript · Tailwind v4 · Nginx · Dockerfile
└── simulator/                 # 실시간 결제 트래픽 시뮬레이터 CLI
```

---

## 로컬 실행 및 데모 시연 가이드

### 1. 인프라 기동 (Docker Desktop 필요)
```bash
docker compose up -d
```

### 2. Spring Boot 백엔드 기동 (포트 `8080`)
```bash
cd fds-spring-server
./gradlew bootRun
```
- 기동 시 기본 데모 계정이 자동 생성됩니다:
  - 관리자 (`ROLE_ADMIN`, 알람 판정 가능): `admin` / `admin1234!`
  - 열람 전용 (`ROLE_VIEWER`, 읽기 전용): `viewer` / `viewer1234!`

### 3. Python AI 서버 기동 (포트 `8000`)
```bash
cd fds-python-server
# (선택) 모델 재학습이 필요할 경우:
# .\.venv\Scripts\python.exe -m training.train_lgbm --synthetic --samples 60000
# 또는 Kaggle Sparkov CSV 사용:
# .\.venv\Scripts\python.exe -m training.train_lgbm --csv data/fraudTrain.csv

.\.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000
```

### 4. React 대시보드 기동 (포트 `5173`)
```bash
cd fds-frontdend
npm run dev
```
- 브라우저에서 `http://localhost:5173` 접속 후 `admin` / `admin1234!` 로 로그인

### 5. 실시간 결제 시뮬레이터 시연 (시나리오 S1 ~ S4)
```bash
# S1/S3. 정상 85% + 고액·새벽고위험·연타 15% 혼합 스트림 (초당 2건, 60초)
python simulator/traffic_simulator.py --mode mixed --tps 2 --duration 60

# S2. 단시간 연타(Burst) 시연 — 1분 내 6회 연속 결제 → Redis 결제빈도 + HYBRID 즉시 탐지
python simulator/traffic_simulator.py --mode burst --user-id user-demo-burst --count 6 --interval 0.5

# S3. 단건 고액 / 새벽 고위험 시연
python simulator/traffic_simulator.py --mode scenario --type high-amount
python simulator/traffic_simulator.py --mode scenario --type night-risk
```

---

## 자동화 테스트 실행

```bash
# Spring Boot (19개 단위·보안·AI 관제 테스트)
cd fds-spring-server && ./gradlew test

# Python AI 서버 (12개 pytest 테스트 — 3계층 앙상블·SHAP·PSI 드리프트·Copilot 포함)
cd fds-python-server && .\.venv\Scripts\pytest.exe -v

# React 프론트엔드 (TypeScript 빌드 & Oxlint)
cd fds-frontdend && npm run build && npm run lint

# 트래픽 시뮬레이터 테스트 (2개 pytest 테스트)
.\fds-python-server\.venv\Scripts\python.exe -m pytest -v simulator/test_simulator.py
```

---

## Jenkins 로컬 CI/CD 파이프라인 (Docker + JCasC)

Docker 환경에서 JCasC(Jenkins Configuration as Code)로 자동 초기화된 로컬 Jenkins 서버를 기동하고, 3개 서비스의 병렬 테스트·이미지 빌드·Docker Compose CD 배포·헬스체크까지 원클릭으로 실행할 수 있습니다.

```bash
# 1. 로컬 Jenkins 서버 기동 (포트 8090, JCasC 자동 초기화)
docker compose -p fds-core -f docker-compose.jenkins.yml up -d --build
```

- **접속 주소**: `http://localhost:8090` (초기 계정: `admin` / `admin1234!`)
- **자동 등록 파이프라인**: `fds-core-cicd` ([Jenkinsfile](./Jenkinsfile))
  1. **Checkout & Environment**: 로컬 Git `main` 체크아웃 및 Docker/Compose 환경 확인
  2. **Parallel CI**: Spring `./gradlew test`(JUnit XML 리포트) · Python 이미지 빌드 & `pytest` · React `lint & build` 병렬 실행
  3. **Spring Boot Image Build**: Multi-stage `bootJar` → `eclipse-temurin:17-jre-alpine` 이미지 패키징
  4. **CD Deploy**: `docker-compose.yml` + `docker-compose.app.yml` 기반 전체 스택 롤링 재기동 (`IMAGE_TAG=build-${BUILD_NUMBER}`)
  5. **Post-Deploy Smoke & Health Verification**: Python `/health`, Spring 로그인 `HTTP 200`, Nginx `HTTP 200` 자동 검증 후 dangling 이미지 정리

```bash
# 전체 컨테이너 종료
docker compose -p fds-core -f docker-compose.yml -f docker-compose.app.yml -f docker-compose.jenkins.yml stop
```
