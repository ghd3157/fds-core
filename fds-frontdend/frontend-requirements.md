> [!NOTE]
> 본 문서는 초기 v1.0 설계 기록입니다. **v2.0 전면 재설계 기준 화면 구조·API/WebSocket 계약·실시간 자동 갱신 명세는 최상위 [FDS-DESIGN.md](../FDS-DESIGN.md)를 참조하세요.**

# FDS (Fraud Detection System) Frontend 요구사항 명세서

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
- **목적**: 백엔드(Spring Boot)와 연동하여 신용카드 이상 결제(Fraud)를 실시간으로 모니터링하는 관리자 대시보드 구축.
- **기술 스택**: React, Vite, Axios, React Router, WebSocket(SockJS/STOMP), Tailwind CSS (또는 Styled-components), Chart.js (또는 Recharts).
- **백엔드 API 주소**: `http://localhost:8080/api/v1`

## 2. 핵심 구현 기능 (단계별)

### [Step 1] 라우팅 및 레이아웃 설정
- `React Router`를 이용해 화면 분리.
- `/login`: 관리자 로그인 페이지.
- `/dashboard`: 메인 대시보드 페이지 (인증된 사용자만 접근 가능).
- 공통 레이아웃(사이드바, 상단 네비게이션바) 구성.

#### ✅ 완료 (2026-07-12)

**설치 패키지**

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `react-router-dom` | latest | 클라이언트 사이드 라우팅 |
| `tailwindcss` | v4 | UI 스타일링 |
| `@tailwindcss/vite` | latest | Tailwind v4 Vite 플러그인 |
| `axios` | latest | Step 2 API 통신 준비 |

**생성/수정 파일**

| 파일 | 내용 |
|------|------|
| `vite.config.ts` | `@tailwindcss/vite` 플러그인 추가 |
| `src/index.css` | `@import "tailwindcss"` 한 줄로 교체 |
| `src/App.tsx` | `BrowserRouter` + `Routes` 라우팅 구조 |
| `src/pages/LoginPage.tsx` | `/login` 페이지 UI (placeholder) |
| `src/pages/DashboardPage.tsx` | `/dashboard` 페이지 + 사이드바/네비바 공통 레이아웃 (`DashboardLayout`) |
| `src/components/ProtectedRoute.tsx` | `localStorage.accessToken` 없으면 `/login` 리다이렉트 |

**라우팅 구조**
```
/           → /login  (리다이렉트)
/login      → LoginPage          (공개)
/dashboard  → DashboardLayout    (Protected — JWT 필요)
              └─ index → DashboardPage
*           → /login  (리다이렉트)
```

### [Step 2] 보안 및 API 통신 (JWT)
- Axios 인스턴스를 생성하여 백엔드와 통신.
- 로그인 성공 시 발급받은 JWT(Access Token)를 `localStorage`에 저장.
- 이후 모든 API 요청 헤더(`Authorization: Bearer {token}`)에 토큰을 자동으로 포함하는 Axios Interceptor 구현.

#### ✅ 완료 (2026-07-12)

**생성 파일**

| 파일 | 내용 |
|------|------|
| `src/api/axiosInstance.ts` | Axios 인스턴스 (`baseURL: http://localhost:8080/api/v1`) + Request/Response 인터셉터 |
| `src/api/authApi.ts` | `POST /auth/login` 호출 함수, `LoginRequest` / `LoginResponse` 타입 정의 |
| `src/pages/LoginPage.tsx` | 실제 로그인 폼 — API 연동, 로딩 상태, 에러 메시지 처리 |

**인터셉터 동작**
```
[Request 인터셉터]
  localStorage.accessToken 존재 시
  → Authorization: Bearer {token} 헤더 자동 주입

[Response 인터셉터]
  401 응답 수신 시
  → localStorage.accessToken 삭제
  → /login 페이지로 강제 이동
```

**로그인 흐름**
```
폼 제출 → POST /api/v1/auth/login
  성공 → accessToken을 localStorage 저장 → /dashboard 이동
  실패 → "아이디 또는 비밀번호가 올바르지 않습니다." 표시
```

> **백엔드 확인 필요**: 응답 JSON의 토큰 필드명이 `accessToken`인지 확인 후,
> 다를 경우 `authApi.ts`의 `LoginResponse` 인터페이스만 수정.

### [Step 3] 실시간 알림 (WebSocket 연동)
- 백엔드의 WebSocket 엔드포인트에 연결.
- AI가 고위험(Fraud) 결제로 판별한 이벤트가 수신되면, 대시보드 우측 상단이나 토스트(Toast) 팝업으로 "🚨 [경고] 이상 결제 탐지!" 실시간 알림 렌더링.

#### ✅ 완료 (2026-07-12)

**설치 패키지**

| 패키지 | 용도 |
|--------|------|
| `sockjs-client` | WebSocket 폴백 지원 트랜스포트 |
| `@stomp/stompjs` | STOMP 프로토콜 클라이언트 |
| `@types/sockjs-client` | TypeScript 타입 정의 |

**생성 파일**

| 파일 | 내용 |
|------|------|
| `src/hooks/useWebSocket.ts` | SockJS + STOMP 커스텀 훅. 마운트 시 연결, 언마운트 시 자동 해제, 3초 재연결 |
| `src/components/ToastContainer.tsx` | 우측 상단 고정 Toast UI. 5초 자동 제거, 닫기 버튼 지원 |
| `src/index.css` | Toast 슬라이드 인 애니메이션 keyframe 추가 |
| `src/pages/DashboardPage.tsx` | `DashboardLayout`에 훅 연결 및 `ToastContainer` 렌더링 통합 |

**동작 흐름**
```
DashboardLayout 마운트
  └─ useWebSocket: SockJS → ws://localhost:8080/ws 연결
  └─ STOMP CONNECT (Authorization: Bearer {token})
  └─ /topic/fraud-alerts 구독

백엔드 Fraud 이벤트 발행
  └─ onAlert(alert) → setToasts 추가
  └─ ToastContainer 우측 상단 슬라이드 인
  └─ 5초 후 자동 제거 or ✕ 클릭으로 수동 제거
```

> **백엔드 확인 사항**: `WS_URL` (`/ws`)과 `TOPIC` (`/topic/fraud-alerts`)이 백엔드 설정과 일치하는지 확인.
> 다를 경우 `useWebSocket.ts` 상단 상수만 수정.


### [Step 4] 대시보드 시각화 (Charts & Table)
- **통계 차트**: Redis에서 가져온 데이터를 바탕으로 카테고리별 사기 발생 통계 파이 차트(Pie Chart) 렌더링.
- **결제 내역 테이블**: MariaDB에서 조회한 결제 로그 및 상태(PENDING, COMPLETE)를 페이징(Pagination) 처리하여 표 형태로 렌더링.

#### ✅ 완료 (2026-07-12)

**설치 패키지**

| 패키지 | 용도 |
|--------|------|
| `recharts` | React용 차트 라이브러리 (Pie Chart) |

**생성 파일**

| 파일 | 내용 |
|------|------|
| `src/api/dashboardApi.ts` | 카테고리 통계, 요약 통계, 페이징 트랜잭션 API 함수 및 타입 정의 |
| `src/components/FraudPieChart.tsx` | Recharts 도넛 파이 차트. 커스텀 툴팁, 로딩/에러/빈 데이터 상태 처리 |
| `src/components/TransactionTable.tsx` | 페이징 결제 내역 테이블. 상태/Fraud 뱃지, 앞뒤 2페이지 번호 버튼 |
| `src/pages/DashboardPage.tsx` | 통계 카드 + 파이 차트(1/3) + 결제 테이블(2/3) 통합 |

**API 엔드포인트**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/v1/stats/fraud-by-category` | 카테고리별 Fraud 건수 (파이 차트) |
| GET | `/api/v1/stats/summary` | 오늘 탐지/PENDING/COMPLETE 요약 카드 |
| GET | `/api/v1/transactions?page={p}&size=10` | 결제 내역 페이지 조회 |

**레이아웃 구조**
```
[통계 카드 3개] — 오늘 탐지 / PENDING / COMPLETE
[파이 차트 1/3] [결제 내역 테이블 2/3]
                  └─ 페이지네이션 (처음/이전/번호/다음/끝)
```