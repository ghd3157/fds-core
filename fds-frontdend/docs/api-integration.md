# 프론트엔드 백엔드 API 연동 (Step 4)

## 작업 날짜
2026-08-04

## 개요

`src/api/dashboardApi.ts`에 axiosInstance를 활용한 API 함수 3개와 TypeScript 인터페이스를 정의하고,
각 컴포넌트의 하드코딩된 더미 데이터를 실제 백엔드 API 응답으로 교체하였다.

---

## API 함수 및 타입 정의 (`src/api/dashboardApi.ts`)

### 타입 인터페이스

| 인터페이스 | 설명 |
|------------|------|
| `CategoryStat` | 파이 차트용 카테고리별 Fraud 건수 `{ category, count }` |
| `TransactionStatus` | `'PENDING' \| 'COMPLETE'` 유니온 타입 |
| `Transaction` | 결제 내역 단건 `{ id, transactionId, amount, category, status, isFraud, createdAt }` |
| `PageResponse<T>` | Spring Page 응답 래퍼 `{ content, totalPages, totalElements, number }` |
| `DashboardStats` | 상단 요약 카드 `{ todayFraudCount, pendingCount, completeCount }` |

### API 함수

| 함수 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| `getFraudByCategory()` | GET | `/stats/fraud-by-category` | 파이 차트용 카테고리별 Fraud 건수 |
| `getDashboardStats()` | GET | `/stats/summary` | 상단 요약 카드 3종 (오늘 탐지, PENDING, COMPLETE) |
| `getTransactions(page, size)` | GET | `/transactions?page={p}&size={s}` | 결제 내역 페이징 |

---

## 대시보드 통계 카드 연동 (`src/pages/DashboardPage.tsx`)

### 변경 내용

- `DUMMY_STATS` 상수 제거
- `useState<DashboardStats | null>(null)` + `useEffect` 로 `getDashboardStats()` 호출
- 로딩 중: 카드 숫자 영역에 `animate-pulse` 스켈레톤 표시
- API 실패 시: `—` 표시 (앱 크래시 없이 graceful 처리)

### 상태 흐름

```
마운트 → getDashboardStats() 호출
  성공 → setStats(data) → 카드에 실제 수치 렌더링
  실패 → stats = null → '—' 표시
  로딩중 → statsLoading = true → pulse 스켈레톤
```

---

## 파이 차트 실데이터 연동 (`src/components/FraudPieChart.tsx`)

### 변경 내용

- `DUMMY_DATA` 6개 항목 제거
- `useState<CategoryStat[]>([])` + `useEffect` 로 `getFraudByCategory()` 호출
- `renderBody()` 함수로 상태별 4분기 렌더링

### 렌더링 분기

| 상태 | 렌더링 |
|------|--------|
| `loading: true` | 인디고 Spinner (`animate-spin`) |
| `error: true` | "데이터를 불러오지 못했습니다." |
| `data.length === 0` | "집계된 데이터가 없습니다." |
| 정상 | Recharts PieChart |

---

## 결제 내역 테이블 실데이터 연동 + 페이징 (`src/components/TransactionTable.tsx`)

### 변경 내용

- `DUMMY_TRANSACTIONS` (10행), `DUMMY_PAGE` 상수 제거
- `useCallback` + `useEffect` 조합으로 `fetchPage(p)` 구현
- 페이지네이션 버튼 클릭 → `fetchPage(p)` 직접 호출 (API 재요청)
- 로딩 중 페이지네이션 버튼 전체 `disabled` 처리 (중복 요청 방지)
- `STATUS_STYLE`에 `FRAUD` (빨강) 케이스 추가

### 렌더링 분기 (tbody)

| 상태 | 렌더링 |
|------|--------|
| `loading: true` | 10행 × 6열 pulse 스켈레톤 그리드 |
| `error: true` | "데이터를 불러오지 못했습니다." (6열 병합) |
| `rows.length === 0` | "결제 내역이 없습니다." (6열 병합) |
| 정상 | 실제 데이터 행 |

### fetchPage 흐름

```
fetchPage(p) 호출
  → setLoading(true), setError(false)
  → getTransactions(p, 10)
  → 성공: setData(res), setPage(p)
  → 실패: setError(true)
  → finally: setLoading(false)

useEffect → fetchPage(0)  // 초기 마운트 시 0페이지 자동 로드
```

---

## 버그 수정

### `data.totalElements` NullPointerError

- **증상**: 로그인 후 대시보드 진입 시 흰 화면 + `Cannot read properties of null (reading 'totalElements')`
- **원인**: `data` 초기값 `null` 상태에서 헤더 JSX가 `data.totalElements` 직접 접근
- **수정**: `data?.totalElements.toLocaleString() ?? '—'` (optional chaining 적용)
