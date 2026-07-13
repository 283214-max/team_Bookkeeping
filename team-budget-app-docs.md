# Mydata Team Bookkeeping 프로젝트 문서

문서 기준일: 2026-07-13  
서비스명: Mydata Team Bookkeeping  
저장소: `283214-max/team_Bookkeeping`  
운영 배포: Vercel + Supabase Postgres + Supabase Storage

---

## 1. 프로젝트 개요

Mydata Team Bookkeeping은 팀 내부 식당 비용을 식당별 잔액 기준으로 관리하는 웹앱이다. 팀원이 식당에서 사용한 금액과 장부 사진을 등록하면 해당 식당의 잔액에서 자동 차감되고, 관리자는 식당 생성, 삭제, 추가 결재 금액 반영, 잔액 조정, 사용자 승인/권한 관리를 수행한다.

현재 구현은 Next.js 단일 앱 구조이며, Vercel 서버리스 환경에서 API Route를 통해 Supabase Postgres와 Supabase Storage를 사용한다. 로컬 개발 환경에서는 Supabase 환경변수가 없을 때 `.data` 기반 로컬 파일 DB/스토리지를 fallback으로 사용한다.

### 핵심 목표

- 식당별 잔액과 사용 내역을 한 화면에서 빠르게 확인한다.
- 팀원이 금액과 장부 사진만 등록하면 잔액 차감과 이력 저장이 함께 처리된다.
- 관리자는 가입 승인번호, 사용자 권한, 식당, 추가 결재 금액을 직접 관리한다.
- 모든 금액 변경은 `transactions` 이력으로 남기고, 현재 잔액은 `restaurant_balances`에 반영한다.

---

## 2. 사용자 역할

| 역할 | 설명 | 주요 권한 |
|---|---|---|
| 관리자 | 팀 비용과 사용자를 관리하는 사용자 | 대시보드 조회, 식당 추가/삭제, 추가 결재 금액 반영, 잔액 조정, 전체 거래 조회, 사용자 권한 변경, 사용자 삭제, 가입 승인번호 변경 |
| 팀원 | 본인의 식당 사용 내역을 등록하는 사용자 | 대시보드 조회, 식당 조회, 사용 내역 등록, 장부 사진 첨부, 본인이 등록한 사용 내역 취소 |

### 계정 상태

- `ACTIVE`: 로그인 가능
- `INACTIVE`: 로그인 불가

관리자가 사용자를 삭제하면 실제 레코드는 감사 추적을 위해 유지하되 `INACTIVE` 처리한다. 동시에 이메일은 `{userId}@deleted.local` 형태로 tombstone 처리하여 같은 이메일로 다시 회원가입할 수 있게 한다.

---

## 3. 현재 기술 스택

| 영역 | 선택 기술 | 현재 사용 목적 |
|---|---|---|
| 프론트엔드 | Next.js 16 App Router, React 19, TypeScript | 단일 페이지 앱 UI와 API Route 통합 |
| 스타일 | CSS Modules가 아닌 전역 CSS, Apple.com 참고 디자인 톤 | 밝은 배경, 넓은 여백, 선명한 숫자 중심 화면 |
| 백엔드 | Next.js Route Handlers | 로그인, 회원가입, 식당, 거래, 사용자, 설정 API |
| DB | Supabase Postgres | 사용자, 식당, 잔액, 거래, 감사 로그, 앱 설정 저장 |
| ORM/마이그레이션 | Drizzle ORM, drizzle-kit | Postgres 스키마 정의와 마이그레이션 |
| 파일 저장소 | Supabase Storage | 장부 사진, 사용자 프로필 사진 저장 |
| 배포 | Vercel | Next.js 앱 운영 배포 |
| 로컬 fallback | `.data/team-budget-local-db.json`, `.data/storage` | Supabase 미설정 시 로컬 개발용 저장소 |

### 필수 환경변수

```bash
DATABASE_URL="postgres://..."
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_STORAGE_BUCKET="receipts"
```

`DATABASE_URL`이 없으면 Vercel에서 API가 동작하지 않는다. Vercel Supabase 연동을 쓰는 경우 `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`도 fallback으로 읽는다.

---

## 4. 디자인 가이드

Apple.com을 참고하되, 마케팅 랜딩 페이지가 아니라 내부 운영 도구에 맞춘 절제된 인터페이스로 적용한다.

### 적용 원칙

- 첫 화면은 `MYDATA TEAM`과 `Bookkeeping`을 중심에 배치한다.
- 기본 로그인 역할은 팀원으로 선택한다.
- 관리자/팀원 선택은 명확한 세그먼트 컨트롤로 제공한다.
- 대시보드와 식당 화면은 카드 과잉을 피하고 숫자와 목록을 빠르게 스캔할 수 있게 구성한다.
- 식당 선택 상태는 파란 테두리만 쓰지 않고 연한 하늘색 배경을 함께 사용한다.
- 금액 입력은 사람이 읽기 쉽게 콤마를 표시하되 API/DB에는 숫자로 전송한다.
- 알림은 모든 성공/오류 메시지를 5초 후 자동으로 닫는다.
- 페이지나 탭을 이동했다가 돌아오면 입력 중이던 임시 폼 값은 초기화한다.
- 새로고침 시에는 로그인 세션과 현재 화면 위치를 유지한다.

---

## 5. 주요 기능

### 인증/회원가입

- 로그인은 이메일과 이름을 입력해 처리한다.
- 입력한 이메일과 이름이 DB의 활성 사용자 정보와 일치해야 로그인된다.
- 회원가입은 이메일, 이름, 승인번호, 프로필 사진 또는 십이간지 기본 이미지를 입력한다.
- 승인번호는 관리자만 관리 탭에서 변경할 수 있다.
- 신규 가입자는 승인번호가 맞으면 생성되며, 관리자가 활성 사용자로 관리한다.
- 프로필 사진을 직접 선택하면 기본 프로필 선택 버튼은 비활성화된다.

### 대시보드

- 전체 잔액과 전체 사용 금액을 보여준다.
- 식당별 잔액은 높은 순으로 정렬한다.
- 최근 거래를 표시한다.
- 헤더명은 `마이데이터팀 가계부`를 사용한다.

### 식당 탭

- Browse: 식당 목록, 검색, 잔액, 선택 상태 표시
- Action: 선택 식당에 대해 사용 내역 등록 또는 관리자 금액 처리
- Ledger: 선택 식당의 거래 상세 이력

팀원 Action은 항상 사용 금액 등록 화면으로 표시된다. 관리자는 추가 결재 금액 반영과 잔액 조정 기능을 사용할 수 있다.

### 사용 내역 등록

- 팀원은 금액, 사용일, 장부 사진을 등록한다.
- 장부 사진이 없으면 저장하지 않고 `장부 사진을 첨부해주세요.` 알림을 띄운다.
- 사용일은 미래 날짜를 선택할 수 없다.
- 저장 클릭 시 `처리중입니다.` 알림을 띄운다.
- 장부 사진은 브라우저에서 최대 1280px, JPEG 품질 0.72로 압축 후 업로드한다.
- 저장 완료 후 파일 선택 상태와 미리보기는 초기화한다.
- 저장 버튼 아래에 `계좌번호 농협 302-2112-3752-91 양승봉` 문구를 표시하고, 계좌번호 클릭 시 복사한다.

### 관리자 기능

- 식당 추가 시 초기 금액 입력은 콤마를 표시한다.
- 같은 이름의 활성 식당이 있으면 새 식당 추가를 막는다.
- 식당 삭제는 실제 삭제가 아니라 `INACTIVE` 처리한다.
- 식당 상세 Action에서 추가 결재 금액을 반영할 수 있다.
- 관리 탭에서 사용자별 사용 금액 합계를 볼 수 있다.
- 사용자 역할 변경과 사용자 삭제가 가능하다.
- 가입 승인번호를 변경할 수 있고, 변경 후 신규 가입자는 최신 승인번호만 사용할 수 있다.

---

## 6. 화면 흐름

```text
첫 화면
  ├─ 로그인
  │   └─ 대시보드
  │       ├─ 식당 탭
  │       │   ├─ Browse: 식당 선택/검색
  │       │   ├─ Action: 사용 등록 또는 관리자 금액 처리
  │       │   └─ Ledger: 거래 이력/장부 사진/본인 거래 취소
  │       ├─ 거래 내역 탭
  │       └─ 관리 탭(관리자 전용)
  └─ 회원가입
      ├─ 이름/이메일/승인번호
      ├─ 프로필 사진 업로드 또는 십이간지 기본 이미지
      └─ 가입 요청 완료
```

---

## 7. 데이터 흐름

### 사용 금액 등록

```text
1. 팀원이 식당, 금액, 사용일, 장부 사진을 입력한다.
2. 프론트엔드가 장부 이미지를 압축한다.
3. /api/restaurants/{id}/transactions/spend 로 multipart/form-data를 전송한다.
4. 서버가 로그인 사용자, 식당 상태, 금액, 잔액, 이미지 형식을 검증한다.
5. 장부 사진을 Supabase Storage에 업로드한다.
6. DB 트랜잭션 안에서 restaurant_balances를 차감하고 transactions에 SPEND 이력을 남긴다.
7. 프론트엔드는 응답받은 balance/transaction으로 화면 상태를 즉시 갱신한다.
```

### 추가 결재 금액 반영

```text
1. 관리자가 식당과 금액을 입력한다.
2. /api/restaurants/{id}/transactions/top-up 으로 요청한다.
3. 서버가 관리자 권한을 확인한다.
4. DB 트랜잭션 안에서 잔액과 누적 추가 금액을 증가시키고 TOP_UP 거래를 저장한다.
```

### 사용자 삭제

```text
1. 관리자가 관리 탭에서 사용자를 삭제한다.
2. 서버가 관리자 권한과 대상 사용자를 확인한다.
3. users.status를 INACTIVE로 변경한다.
4. users.email을 {userId}@deleted.local로 변경하여 원래 이메일 재가입을 허용한다.
5. 기존 거래 이력은 user_id/user_name 기준으로 보존된다.
```

---

## 8. 프론트엔드 문서

### 화면 목록

| 화면 | 주요 UI | 사용자 액션 | API 연동 |
|---|---|---|---|
| 로그인 | 이메일, 이름, 역할 선택, 로그인 버튼, 회원가입 버튼 | 이메일/이름 입력, 팀원/관리자 선택, 로그인 | `POST /api/auth/login` |
| 회원가입 | 이름, 이메일, 승인번호, 프로필 사진, 십이간지 기본 이미지 | 가입 요청, 기본 사진 선택, 사진 업로드 | `POST /api/auth/signup` |
| 대시보드 | 총 잔액, 총 사용액, 식당별 잔액, 최근 거래 | 요약 확인, 식당 선택 이동 | `GET /api/dashboard/summary` |
| 식당 Browse | 식당 검색, 식당 목록, 잔액 카드, 삭제 버튼(관리자) | 식당 선택, 식당 삭제 | `GET /api/restaurants`, `DELETE /api/restaurants/{id}` |
| 식당 Action - 팀원 | 금액, 사용일, 장부 사진, 계좌 복사 | 사용 내역 등록 | `POST /api/restaurants/{id}/transactions/spend` |
| 식당 Action - 관리자 | 금액, 추가 결재, 잔액 조정 | 금액 추가/조정 | `POST /api/restaurants/{id}/transactions/top-up`, `POST /api/restaurants/{id}/transactions/adjust` |
| 식당 Ledger | 식당별 거래 목록, 장부 사진 보기, 본인 거래 취소 | 장부 사진 열기, 본인 거래 취소 | `GET /api/restaurants/{id}/transactions`, `GET /api/transactions/{id}/receipt`, `POST /api/transactions/{id}/void` |
| 거래 내역 | 전체 거래 목록, 필터 | 전체 이력 조회 | `GET /api/transactions` |
| 관리 | 사용자 목록, 역할 변경, 사용자 삭제, 사용자별 사용 합계, 승인번호 변경 | 권한 수정, 사용자 삭제, 승인번호 저장 | `GET /api/users`, `PATCH /api/users/{id}/role`, `DELETE /api/users/{id}`, `GET/PUT /api/settings/signup-approval-code` |

### 상태 관리

현재는 별도 상태 관리 라이브러리 없이 `app/page.tsx`에서 React state로 관리한다.

- 세션 상태: 로그인 사용자, 현재 탭, 선택 식당
- 서버 데이터 상태: 대시보드 요약, 식당 목록, 거래 목록, 사용자 목록
- 임시 입력 상태: 로그인/회원가입 폼, 식당 생성 폼, 금액 입력, 사용일, 이미지 파일
- 새로고침 유지: 로그인 세션과 현재 화면은 브라우저 저장소 기반으로 유지
- 화면 이동 초기화: 탭/페이지 전환 시 입력 중인 폼 값은 초기화

규모가 커질 경우 TanStack Query를 도입해 서버 상태 캐싱, optimistic update, 재시도 정책을 분리하는 것이 좋다.

### 주요 폴더 구조

```text
app/
  api/                         Next.js Route Handlers
  page.tsx                     클라이언트 UI와 화면 상태
  globals.css                  전역 디자인 스타일
db/
  index.ts                     Supabase Postgres/Storage 연결과 로컬 fallback
  local.ts                     로컬 파일 DB/스토리지 구현
  schema.ts                    Drizzle Postgres 스키마
drizzle-postgres/
  0000_pink_sunspot.sql        Supabase Postgres 마이그레이션
lib/team-budget/
  errors.ts                    API 오류 포맷
  http.ts                      요청 파싱/금액 파싱/공통 핸들러
  store.ts                     비즈니스 로직과 DB 트랜잭션
  types.ts                     공통 타입
public/
  ...                          정적 자산
```

---

## 9. 백엔드 API 문서

공통 응답 오류 형식:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "오류 메시지",
  "details": {}
}
```

### 인증/세션

| Method | URL | Request | Response | 권한 |
|---|---|---|---|---|
| GET | `/api/me` | 없음 | `{ "user": User \| null }` | 전체 |
| POST | `/api/auth/login` | `{ "email": string, "name": string }` | `{ "user": User }` | 전체 |
| POST | `/api/auth/logout` | 없음 | `{ "ok": true }` | 로그인 |
| POST | `/api/auth/signup` | `multipart/form-data` 또는 JSON: `name`, `email`, `approvalCode`, `avatar`, `avatarPreset` | `{ "user": User }` | 전체 |

로그인은 비밀번호가 아니라 이메일과 이름 일치 여부로 처리한다. 운영 보안 수준을 높이려면 Supabase Auth, 사내 SSO, OTP 중 하나를 추가해야 한다.

### 대시보드/식당

| Method | URL | Request | Response | 권한 |
|---|---|---|---|---|
| GET | `/api/dashboard/summary` | 없음 | `DashboardSummary` | 로그인 |
| GET | `/api/restaurants` | query: `q`, `status` | `RestaurantListItem[]` | 로그인 |
| POST | `/api/restaurants` | `{ "name": string, "initialAmount": number, "memo"?: string, "lowBalanceThreshold"?: number }` | `RestaurantListItem` | 관리자 |
| GET | `/api/restaurants/{id}` | 없음 | `RestaurantListItem` | 로그인 |
| PATCH | `/api/restaurants/{id}` | `{ "name"?, "memo"?, "lowBalanceThreshold"? }` | `Restaurant` | 관리자 |
| DELETE | `/api/restaurants/{id}` | 없음 | `{ "restaurant": Restaurant }` | 관리자 |
| GET | `/api/restaurants/{id}/balance` | 없음 | `Balance` | 로그인 |

활성 식당 이름은 중복 등록을 막는다. 식당 삭제는 `INACTIVE` soft delete로 처리한다.

### 거래

| Method | URL | Request | Response | 권한 |
|---|---|---|---|---|
| GET | `/api/transactions` | query: `restaurantId`, `type`, `userId` | `LedgerTransaction[]` | 로그인 |
| GET | `/api/restaurants/{id}/transactions` | 없음 | `LedgerTransaction[]` | 로그인 |
| POST | `/api/restaurants/{id}/transactions/spend` | `multipart/form-data`: `amount`, `usedAt`, `idempotencyKey`, `receipt` | `TransactionMutationResult` | 로그인 |
| POST | `/api/restaurants/{id}/transactions/top-up` | `{ "amount": number, "memo"?, "idempotencyKey": string }` | `TransactionMutationResult` | 관리자 |
| POST | `/api/restaurants/{id}/transactions/adjust` | `{ "amountDelta": number, "memo"?, "idempotencyKey": string }` | `TransactionMutationResult` | 관리자 |
| POST | `/api/transactions/{id}/void` | `{ "idempotencyKey": string }` | `TransactionMutationResult` | 관리자 또는 본인 SPEND |
| GET | `/api/transactions/{id}/receipt` | 없음 | 이미지 파일 응답 | 로그인 |

`SPEND`는 음수 `amountDelta`, `TOP_UP`은 양수 `amountDelta`, `ADJUST`는 양수/음수 모두 가능하다. 취소는 기존 거래를 삭제하지 않고 `REVERSAL` 거래를 추가한다.

### 사용자/설정

| Method | URL | Request | Response | 권한 |
|---|---|---|---|---|
| GET | `/api/users` | 없음 | `User[]`와 사용자별 사용 합계 | 관리자 |
| PATCH | `/api/users/{id}/role` | `{ "role": "ADMIN" \| "MEMBER" }` | `User` | 관리자 |
| DELETE | `/api/users/{id}` | 없음 | `User` | 관리자 |
| GET | `/api/users/{id}/avatar` | 없음 | 이미지 파일 응답 | 로그인 |
| GET | `/api/avatars/{preset}` | 없음 | SVG 이미지 응답 | 전체 |
| GET | `/api/settings/signup-approval-code` | 없음 | `{ "approvalCode": string }` | 관리자 |
| PUT | `/api/settings/signup-approval-code` | `{ "approvalCode": string }` | `{ "approvalCode": string }` | 관리자 |

---

## 10. 인증/인가 구조

현재 인증은 앱 내부 사용자 테이블과 쿠키 기반 세션을 사용한다.

- 로그인 성공 시 서버가 현재 사용자 정보를 세션으로 유지한다.
- API는 `getCurrentUser(request)`로 로그인 여부를 확인한다.
- 관리자 API는 `requireAdmin(request)`를 통해 `role === "ADMIN"`인지 확인한다.
- 팀원은 본인의 `SPEND` 거래만 취소할 수 있고, 관리자 기능은 사용할 수 없다.
- 삭제된 사용자는 `status = "INACTIVE"`이므로 로그인할 수 없다.

운영 보안 강화 권장:

- Supabase Auth 또는 사내 SSO 도입
- 비밀번호/OTP/매직링크 중 하나 추가
- 관리자 작업에 감사 로그 화면 추가
- 세션 만료 시간과 재인증 정책 명확화

---

## 11. 트랜잭션/에러 처리 정책

### 트랜잭션 처리

잔액이 바뀌는 작업은 서버에서 DB 트랜잭션으로 처리한다.

- 현재 잔액 조회
- 잔액 부족 검증
- `transactions` 삽입
- `restaurant_balances` 갱신
- 필요 시 `audit_logs` 삽입

장부 사진 업로드가 포함된 `SPEND`는 파일 업로드 후 DB 트랜잭션을 수행한다. DB 저장 실패 시 업로드된 파일은 삭제를 시도한다.

### 멱등성

거래 API는 `idempotencyKey`를 받는다. 같은 키가 중복 요청되면 중복 거래가 생기지 않도록 `transactions.idempotency_key` unique 제약으로 보호한다.

### 에러 정책

| 코드 | HTTP | 의미 |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | 필수값 누락, 금액 형식 오류, 이미지 형식 오류 |
| `UNAUTHORIZED` | 401 | 로그인 필요 |
| `FORBIDDEN` | 403 | 관리자 권한 필요 또는 본인 거래가 아님 |
| `NOT_FOUND` | 404 | 식당, 사용자, 거래, 장부 사진 없음 |
| `CONFLICT` | 409 | 중복 식당명, 중복 활성 이메일, 멱등성 충돌 |
| `INTERNAL_SERVER_ERROR` | 500 | 예상하지 못한 서버 오류 |

---

## 12. DB 문서

### users

| 컬럼 | 타입 | 설명 | 제약조건 |
|---|---|---|---|
| `id` | text | 사용자 ID | PK |
| `email` | text | 이메일 | NOT NULL, UNIQUE |
| `name` | text | 이름 | NOT NULL |
| `role` | text | `ADMIN`, `MEMBER` | NOT NULL, CHECK |
| `status` | text | `ACTIVE`, `INACTIVE` | NOT NULL, CHECK |
| `auth_provider_user_id` | text | 외부 인증 사용자 ID | UNIQUE, nullable |
| `avatar_object_key` | text | Supabase Storage 프로필 이미지 key | nullable |
| `avatar_file_name` | text | 원본 파일명 | nullable |
| `avatar_content_type` | text | MIME type | nullable |
| `avatar_size` | integer | 파일 크기 | `>= 0`, nullable |
| `avatar_preset` | text | 십이간지 기본 프로필 키 | nullable |
| `created_at` | text | 생성일시 | NOT NULL |
| `updated_at` | text | 수정일시 | NOT NULL |

### restaurants

| 컬럼 | 타입 | 설명 | 제약조건 |
|---|---|---|---|
| `id` | text | 식당 ID | PK |
| `name` | text | 식당명 | NOT NULL |
| `category` | text | 카테고리 | nullable, 현재 UI에서는 숨김 |
| `status` | text | `ACTIVE`, `INACTIVE` | NOT NULL, CHECK |
| `memo` | text | 메모 | nullable |
| `low_balance_threshold` | integer | 부족 잔액 기준 | NOT NULL, `>= 0` |
| `created_by` | text | 생성 관리자 ID | FK users.id |
| `created_at` | text | 생성일시 | NOT NULL |
| `updated_at` | text | 수정일시 | NOT NULL |

### restaurant_balances

| 컬럼 | 타입 | 설명 | 제약조건 |
|---|---|---|---|
| `restaurant_id` | text | 식당 ID | PK, FK restaurants.id |
| `current_amount` | integer | 현재 잔액 | NOT NULL, `>= 0` |
| `total_added_amount` | integer | 누적 추가 금액 | NOT NULL, `>= 0` |
| `total_spent_amount` | integer | 누적 사용 금액 | NOT NULL, `>= 0` |
| `version` | integer | 낙관적 잠금/변경 버전 | NOT NULL |
| `last_transaction_id` | text | 마지막 거래 ID | nullable |
| `updated_at` | text | 수정일시 | NOT NULL |

### transactions

| 컬럼 | 타입 | 설명 | 제약조건 |
|---|---|---|---|
| `id` | text | 거래 ID | PK |
| `restaurant_id` | text | 식당 ID | FK restaurants.id |
| `user_id` | text | 요청 사용자 ID | FK users.id |
| `user_name` | text | 거래 당시 사용자명 | NOT NULL |
| `type` | text | `SPEND`, `TOP_UP`, `ADJUST`, `REVERSAL` | NOT NULL, CHECK |
| `amount_delta` | integer | 잔액 변화량 | NOT NULL, `!= 0` |
| `balance_before` | integer | 거래 전 잔액 | NOT NULL, `>= 0` |
| `balance_after` | integer | 거래 후 잔액 | NOT NULL, `>= 0` |
| `memo` | text | 메모 | nullable |
| `used_at` | text | 사용일 | nullable |
| `idempotency_key` | text | 중복 요청 방지 키 | NOT NULL, UNIQUE |
| `related_transaction_id` | text | 취소/반전 대상 거래 ID | FK transactions.id, nullable |
| `receipt_object_key` | text | 장부 사진 Storage key | nullable |
| `receipt_file_name` | text | 장부 사진 파일명 | nullable |
| `receipt_content_type` | text | 장부 사진 MIME type | nullable |
| `receipt_size` | integer | 장부 사진 크기 | `>= 0`, nullable |
| `created_at` | text | 생성일시 | NOT NULL |

### audit_logs

| 컬럼 | 타입 | 설명 | 제약조건 |
|---|---|---|---|
| `id` | text | 감사 로그 ID | PK |
| `actor_user_id` | text | 작업 사용자 ID | FK users.id, nullable |
| `action` | text | 작업명 | NOT NULL |
| `target_type` | text | 대상 타입 | NOT NULL |
| `target_id` | text | 대상 ID | nullable |
| `metadata` | text | JSON 문자열 메타데이터 | nullable |
| `created_at` | text | 생성일시 | NOT NULL |

### app_settings

| 컬럼 | 타입 | 설명 | 제약조건 |
|---|---|---|---|
| `key` | text | 설정 키 | PK |
| `value` | text | 설정 값 | NOT NULL |
| `updated_by` | text | 수정 관리자 ID | FK users.id, nullable |
| `updated_at` | text | 수정일시 | NOT NULL |

현재 사용하는 설정 키:

| key | 기본값 | 설명 |
|---|---|---|
| `signup_approval_code` | `MYDATA2026` | 회원가입 승인번호 |

### ERD

```text
users 1 ── N restaurants.created_by
users 1 ── N transactions.user_id
users 1 ── N audit_logs.actor_user_id
users 1 ── N app_settings.updated_by

restaurants 1 ── 1 restaurant_balances.restaurant_id
restaurants 1 ── N transactions.restaurant_id

transactions 1 ── N transactions.related_transaction_id
```

---

## 13. Supabase Storage 문서

기본 bucket 이름은 `receipts`이며, 환경변수 `SUPABASE_STORAGE_BUCKET`으로 변경할 수 있다.

### 저장 대상

| 대상 | key 패턴 | 설명 |
|---|---|---|
| 장부 사진 | `receipts/{transactionId}/{safeFileName}.jpg` | 사용 내역 등록 시 첨부 |
| 프로필 사진 | `avatars/{userId}/{safeFileName}` | 회원가입 시 첨부 |

Storage bucket이 없어서 업로드가 실패하는 경우 서버가 bucket 생성을 시도한 뒤 업로드를 재시도한다. 운영에서는 Supabase 콘솔에서 private bucket을 미리 생성하는 것을 권장한다.

### 파일 정책

- 이미지 MIME type만 허용한다.
- 파일명은 안전한 문자로 정리해 Supabase Storage key 오류를 막는다.
- 장부 사진은 프론트에서 JPEG로 압축해 업로드한다.
- 영수증 원본 화질 보존보다 업로드 속도와 저장 비용을 우선한다.

---

## 14. 개발 및 운영 가이드

### 로컬 실행

```bash
npm install
npm run dev
```

기본 개발 서버:

```text
http://127.0.0.1:3000
```

현재 Codex 작업 환경에서는 3001 포트를 사용할 수 있다.

### 검증

```bash
npm run lint
npm run build
```

### DB 마이그레이션

스키마는 `db/schema.ts`, Postgres 마이그레이션은 `drizzle-postgres`에 있다.

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

Supabase SQL Editor에서 직접 확인하거나 수정할 수도 있지만, 운영 구조 변경은 가능한 Drizzle migration으로 관리한다.

### Vercel 배포 체크리스트

- GitHub main 브랜치에 최신 코드 push
- Vercel Project Settings > Environment Variables에 아래 값 등록
  - `DATABASE_URL`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_STORAGE_BUCKET`
- Supabase Storage bucket 확인
- Supabase Postgres migration 적용
- `npm run lint`, `npm run build` 통과 확인

---

## 15. 향후 확장 아이디어

- Supabase Auth 또는 사내 SSO 기반 로그인 전환
- 카카오/PlayMCP 연동으로 금액과 장부 사진 자동 등록
- 장부 사진 OCR로 금액/식당명 자동 추출
- 월별/팀원별/식당별 리포트와 CSV 다운로드
- 승인 워크플로우: 팀원 등록 후 관리자 승인 전까지 대기
- 감사 로그 UI 제공
- 잔액 부족 알림
- 모바일 카메라 촬영 최적화
