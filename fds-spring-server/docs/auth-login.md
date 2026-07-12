# 🔐 인증 (Auth / Login) 구현 문서

> Spring Security + JWT 기반 Stateless 인증 시스템

---

## 📁 관련 파일 구조

```
src/main/java/com/example/demo/
├── DataInitializer.java                  ← 서버 시작 시 기본 관리자 계정 자동 생성
├── domain/
│   └── Admin.java                        ← 관리자 엔티티 (username, password, role)
├── dto/
│   ├── LoginRequest.java                 ← 로그인 요청 바디 (username, password)
│   └── TokenResponse.java               ← 로그인 응답 바디 (accessToken, refreshToken)
├── repository/
│   └── AdminRepository.java             ← JPA Repository (findByUsername 포함)
├── security/
│   ├── SecurityConfig.java              ← Spring Security 필터 체인 설정
│   ├── JwtProvider.java                 ← JWT 발급 / 검증 / 파싱
│   ├── JwtAuthenticationFilter.java     ← 요청마다 JWT를 검증하는 OncePerRequestFilter
│   └── AdminDetailsService.java         ← UserDetailsService 구현체
└── controller/
    └── AuthController.java              ← POST /api/auth/login 엔드포인트
```

---

## 🔄 인증 흐름

### 1. 로그인 요청 흐름

```
Client
  │
  │  POST /api/auth/login  { username, password }
  ▼
AuthController
  │  AuthenticationManager.authenticate(...)
  ▼
DaoAuthenticationProvider
  │  AdminDetailsService.loadUserByUsername(username)
  │    → AdminRepository.findByUsername(username)
  │  BCryptPasswordEncoder.matches(rawPw, encodedPw)
  ▼
JwtProvider
  │  generateAccessToken(username, role)
  │  generateRefreshToken(username)
  ▼
Client  ← { accessToken, refreshToken }
```

### 2. 인증된 API 요청 흐름

```
Client
  │
  │  GET /api/... (Authorization: Bearer <accessToken>)
  ▼
JwtAuthenticationFilter (OncePerRequestFilter)
  │  resolveToken(request)  →  "Bearer " 헤더에서 토큰 추출
  │  jwtProvider.validate(token)  →  서명 & 만료 검증
  │  jwtProvider.getUsername(token), getRole(token)
  │  SecurityContextHolder에 Authentication 저장
  ▼
Controller  →  비즈니스 로직 처리
```

---

## 🧩 클래스별 역할

### `SecurityConfig`

| 설정 항목 | 값 |
|---|---|
| CSRF | 비활성화 (`disable`) |
| 세션 | `STATELESS` (세션 미사용) |
| PasswordEncoder | `BCryptPasswordEncoder` |
| 커스텀 필터 위치 | `UsernamePasswordAuthenticationFilter` **이전** |

**현재 접근 제어 규칙:**
| 경로 | 권한 |
|---|---|
| `POST /api/auth/**` | 누구나 허용 (로그인) |
| `POST /api/v1/logs` | 누구나 허용 (외부 결제 로그 수집) |
| `GET /api/v1/dashboard/**` | ⚠️ 임시 허용 (개발 편의) |
| 그 외 모든 요청 | 인증 필요 (`authenticated()`) |

> [!WARNING]
> `/api/v1/dashboard/**` 경로는 개발 편의를 위해 임시로 `permitAll()`로 열어 둔 상태입니다.
> 운영 배포 전에 `.hasRole("ADMIN")` 으로 변경해야 합니다.

---

### `JwtProvider`

JWT 토큰 발급 및 검증을 전담합니다.

| 메서드 | 설명 |
|---|---|
| `generateAccessToken(username, role)` | role 클레임 포함 Access Token 발급 |
| `generateRefreshToken(username)` | role 없이 Refresh Token 발급 |
| `getUsername(token)` | subject(username) 추출 |
| `getRole(token)` | role 클레임 추출 |
| `validate(token)` | 서명 검증 + 만료 여부 확인 |

**application.yml 필수 설정값:**
```yaml
jwt:
  secret: <Base64-encoded-256bit-secret>
  access-token-expiration-ms: 3600000      # 1시간
  refresh-token-expiration-ms: 604800000   # 7일
```

---

### `JwtAuthenticationFilter`

- `OncePerRequestFilter`를 상속하여 요청당 1회만 실행
- `Authorization: Bearer <token>` 헤더에서 토큰 추출
- 토큰이 유효하면 `SecurityContextHolder`에 인증 정보 저장
- 토큰이 없거나 유효하지 않으면 인증 없이 다음 필터로 통과 (공개 경로는 정상 처리됨)

---

### `AdminDetailsService`

- Spring Security의 `UserDetailsService` 구현체
- `DaoAuthenticationProvider`가 로그인 시 호출
- `AdminRepository.findByUsername()`으로 DB에서 관리자 조회
- 없으면 `UsernameNotFoundException` 던짐

---

### `DataInitializer`

- `CommandLineRunner` 구현체 → **서버 구동 시 자동 실행**
- `adminRepository.findByUsername("admin")`으로 계정 존재 여부 확인
- 계정이 없을 경우에만 기본 관리자 계정 생성

| 항목 | 기본값 |
|---|---|
| username | `admin` |
| password | `1234` (BCrypt 암호화 저장) |
| role | `ROLE_ADMIN` |

> [!IMPORTANT]
> 기본 비밀번호 `1234`는 최초 개발 편의용입니다.
> 운영 환경에서는 서버 기동 후 반드시 비밀번호를 변경하거나, 환경변수로 주입하도록 개선해야 합니다.

---

## 📡 API 명세

### `POST /api/auth/login`

**Request**

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "1234"
}
```

**Response (200 OK)**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

**인증이 필요한 API 요청 방법**

```http
GET /api/v1/dashboard/stats
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

---

## 🗂️ 관련 도메인 모델

### `Admin` 엔티티

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | `Long` | PK, AUTO_INCREMENT |
| `username` | `String` | 로그인 아이디 (unique, max 50) |
| `password` | `String` | BCrypt 암호화된 비밀번호 |
| `role` | `Enum` | `ROLE_ADMIN` \| `ROLE_VIEWER` |
