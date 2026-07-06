# 팀 가계부 프론트엔드

식당별 예산과 잔액, 사용 내역, 관리자 금액 추가 흐름을 확인할 수 있는 팀 가계부 웹앱 프로토타입입니다. 현재 구현은 vinext/Next Route Handler 기반 backend와 클라이언트 UI가 함께 동작합니다.

## 구현 범위

- 로그인 화면, 회원가입, 관리자/팀원 역할 선택
- 대시보드 총 잔액, 잔액 부족 식당, 최근 거래
- 식당 목록 검색과 식당 상세 잔액 조회
- 사용 내역 등록, 영수증 사진 첨부, 잔액 차감
- 관리자 금액 추가, 잔액 조정, 식당 추가
- 거래 내역 필터와 사용자 권한 관리 화면
- Apple.com을 참고한 얇은 내비게이션, 넓은 여백, 절제된 색상과 명확한 액션 배치

## Backend 구현 범위

현재 backend는 `app/api` 아래 Route Handler로 구현되어 있으며, 데이터는 Cloudflare D1 바인딩 `DB`에 저장됩니다. 첫 API 요청 시 필요한 테이블을 확인하고 seed 데이터가 없으면 초기 데이터를 넣습니다.

- `POST /api/auth/login`
- `POST /api/auth/signup`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/dashboard/summary`
- `GET /api/restaurants`
- `POST /api/restaurants`
- `GET /api/restaurants/{id}`
- `PATCH /api/restaurants/{id}`
- `DELETE /api/restaurants/{id}`
- `GET /api/restaurants/{id}/balance`
- `GET /api/restaurants/{id}/transactions`
- `POST /api/restaurants/{id}/transactions/spend`
- `POST /api/restaurants/{id}/transactions/top-up`
- `POST /api/restaurants/{id}/transactions/adjust`
- `GET /api/transactions`
- `POST /api/transactions/{id}/void`
- `GET /api/users`
- `PATCH /api/users/{id}/role`

구현된 서버 정책:

- 데모 토큰 기반 인증: `Authorization: Bearer demo:{userId}`
- 관리자 API 권한 검사
- 잔액 부족 검증
- 거래별 `idempotencyKey` 중복 요청 방지
- 사용, 금액 추가, 잔액 조정, 거래 취소 원장 기록
- 영수증 이미지 업로드: JPG, PNG, WebP, 최대 5MB
- 공통 에러 응답 `{ code, message, details }`

## DB 구현 범위

DB 설계는 `team-budget-app-docs.md`의 6단계 DB 문서를 기준으로 구현했습니다. 별도 `db.md` 파일은 현재 워크스페이스에 없어서 통합 문서의 DB 섹션을 기준으로 삼았습니다.

- `.openai/hosting.json`: D1 바인딩 `DB`, R2 바인딩 `RECEIPTS` 활성화
- `db/schema.ts`: Drizzle SQLite/D1 schema
- `drizzle/0000_giant_tigra.sql`: 초기 DB migration SQL
- `drizzle/0001_outstanding_human_torch.sql`: 거래 영수증 메타데이터 migration SQL
- `lib/team-budget/store.ts`: D1 prepared statement 기반 저장소
- 테이블: `users`, `restaurants`, `restaurant_balances`, `transactions`, `audit_logs`
- 제약조건: 역할/상태 enum CHECK, 잔액 음수 방지, 거래 금액 0 방지, idempotency key unique
- 인덱스: 사용자 이메일, 식당 상태/이름, 거래 식당/사용자/유형별 조회
- 영수증 파일 원본은 R2 `RECEIPTS`에 저장하고, 거래 원장에는 object key, 파일명, MIME type, 크기만 저장합니다.

## 실행

```bash
npm install
npm run dev
```

빌드 검증:

```bash
npm run lint
npm run build
```

## 주요 파일

- `app/page.tsx`: 프론트 화면과 API 연동 로직
- `app/globals.css`: 디자인 토큰, 레이아웃, 반응형 스타일
- `app/layout.tsx`: 한국어 메타데이터와 앱 레이아웃
- `app/api/`: backend API Route Handler
- `lib/team-budget/`: backend 타입, 에러, HTTP 유틸, D1 store
- `db/schema.ts`: Drizzle DB schema
- `drizzle/`: DB migration SQL과 snapshot
- `team-budget-app-docs.md`: 요구사항, 기술 설계, 프론트/백엔드/DB 문서

## 다음 연결 지점

운영형으로 확장할 때는 현재 D1 store를 유지하거나, 같은 테이블 구조를 PostgreSQL/Supabase로 옮기면 됩니다. 그 경우 `lib/team-budget/store.ts`의 prepared statement 계층만 교체하고 API와 프론트 계약은 유지할 수 있습니다.
