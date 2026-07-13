# Mydata Team Bookkeeping

팀 내부 식당별 잔액, 사용 내역, 장부 사진, 관리자 추가 결재 금액을 관리하는 Next.js 웹앱입니다.

현재 운영 기준 스택은 `Next.js + Supabase Postgres + Drizzle + Supabase Storage + Vercel`입니다.

## 실행

```bash
npm install
npm run dev
```

검증:

```bash
npm run lint
npm run build
```

## 환경변수

`.env.example`을 참고해 로컬 `.env` 또는 Vercel Environment Variables에 아래 값을 등록합니다.

```bash
DATABASE_URL="postgres://..."
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_STORAGE_BUCKET="receipts"
```

Vercel에서는 `DATABASE_URL` 또는 Vercel/Supabase 연동이 제공하는 `POSTGRES_URL` 계열 변수가 필요합니다. `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 값이므로 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.

Supabase 환경변수가 없는 로컬 개발 환경에서는 `.data/team-budget-local-db.json`과 `.data/storage`를 사용하는 fallback이 동작합니다. `.data`는 Git에 커밋하지 않습니다.

## Supabase 준비

1. Supabase 프로젝트를 생성합니다.
2. Project Settings > Database에서 pooled connection string을 복사해 `DATABASE_URL`에 등록합니다.
3. Storage에서 `receipts` bucket을 생성합니다. 서버가 bucket not found 상황에서 자동 생성을 시도하지만, 운영에서는 미리 생성하는 편이 안전합니다.
4. Drizzle migration을 Supabase Postgres에 적용합니다.

```bash
npm run db:migrate
```

DB 확인:

```bash
npm run db:studio
```

## 주요 기능

- 이메일과 이름 기반 로그인
- 승인번호 기반 회원가입
- 프로필 사진 업로드 또는 십이간지 기본 이미지 선택
- 대시보드 잔액 요약
- 식당별 잔액 높은 순 조회
- 팀원 사용 금액 등록과 장부 사진 첨부
- 장부 사진 클라이언트 압축 후 Supabase Storage 업로드
- 팀원의 본인 사용 내역 취소
- 관리자 식당 추가/삭제, 추가 결재 금액 반영, 잔액 조정
- 관리자 사용자 권한 변경/삭제
- 관리자 회원가입 승인번호 변경

## 주요 파일

- `app/page.tsx`: 클라이언트 UI와 화면 상태
- `app/api`: Next.js API Route Handlers
- `lib/team-budget/store.ts`: 비즈니스 로직, 권한, DB 트랜잭션
- `lib/team-budget/http.ts`: 요청 파싱과 공통 API 처리
- `db/schema.ts`: Drizzle Postgres schema
- `db/index.ts`: Supabase Postgres/Storage 연결과 로컬 fallback
- `db/local.ts`: 로컬 파일 DB/스토리지
- `drizzle-postgres`: Supabase Postgres migration
- `team-budget-app-docs.md`: 통합 요구사항, 프론트, 백엔드, DB 문서

## 배포

Vercel Project Settings > Environment Variables에 필수 환경변수를 등록한 뒤 main 브랜치를 배포합니다.

권장 배포 전 확인:

```bash
npm run lint
npm run build
```

