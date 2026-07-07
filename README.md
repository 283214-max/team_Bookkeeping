# Mydata Team Bookkeeping

식당별 예산과 잔액, 팀원 사용 내역, 영수증 첨부, 관리자 금액 추가/조정을 관리하는 팀 가계부 웹앱입니다.

## 전환 상태

Vercel 배포를 목표로 `Supabase Postgres + Drizzle + Supabase Storage` 조합으로 전환했습니다.

- 1단계 완료: 빌드 체인을 `vinext`에서 Next.js로 전환
- 2단계 완료: Cloudflare D1 저장소를 Supabase Postgres로 교체
- 3단계 완료: Cloudflare R2 영수증 저장소를 Supabase Storage로 교체
- 4단계 완료: 환경변수, 마이그레이션, 배포 가이드를 정리

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

로컬에서는 `.env.example`을 복사해 `.env`를 만들고 값을 채웁니다. 실제 키는 Git에 커밋하지 않습니다.

```bash
DATABASE_URL="postgres://..."
SUPABASE_URL="https://...supabase.co"
SUPABASE_SERVICE_ROLE_KEY="..."
SUPABASE_STORAGE_BUCKET="receipts"
```

Vercel에는 Project Settings > Environment Variables에 같은 값을 등록합니다. `DATABASE_URL`은 Supabase의 pooled connection string 사용을 권장합니다. `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 키이므로 브라우저에서 접근하는 `NEXT_PUBLIC_` 변수로 만들지 않습니다.

로컬 개발에서 Supabase 환경변수가 아직 없으면 앱은 자동으로 `.data/team-budget-local-db.json` 파일 DB와 `.data/storage` 파일 저장소를 사용합니다. 이 폴더는 Git에 커밋하지 않습니다. Vercel 환경에서는 이 폴백을 사용하지 않으므로 실제 Supabase 환경변수가 반드시 필요합니다.

## Supabase 준비

1. Supabase 프로젝트를 생성합니다.
2. Project Settings > Database에서 pooled connection string을 복사해 `DATABASE_URL`에 넣습니다.
3. Storage에서 `receipts` 버킷을 생성합니다.
4. 영수증 파일은 서버 API를 통해 업로드하므로 버킷은 private 설정을 권장합니다.
5. SQL Editor 또는 Drizzle migrate로 Postgres 테이블을 생성합니다.

## Drizzle 마이그레이션

스키마는 [db/schema.ts](./db/schema.ts)에 있고, Postgres 마이그레이션 파일은 [drizzle-postgres](./drizzle-postgres)에 있습니다.

새 마이그레이션 생성:

```bash
npm run db:generate
```

Supabase Postgres에 적용:

```bash
npm run db:migrate
```

DB 확인:

```bash
npm run db:studio
```

참고: [drizzle](./drizzle)은 이전 Cloudflare D1/SQLite용 마이그레이션 보관 폴더입니다. 현재 Vercel/Supabase 운영 경로에서는 [drizzle-postgres](./drizzle-postgres)를 사용합니다.

## Vercel 배포 설정

- Framework Preset: Next.js
- Build Command: `npm run build`
- Install Command: `npm install`
- Output Directory: Next.js 기본값 사용
- Node.js: `package.json`의 `engines.node` 기준으로 22.x 이상 권장

배포 전에 Vercel 환경변수에 `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`을 모두 등록해야 합니다.

## 주요 기능

- 로그인, 회원가입, 관리자 승인 대기
- 대시보드 잔액 요약
- 식당 목록 및 식당별 상세 잔액
- 팀원 사용 내역 등록
- 영수증 사진 첨부 및 조회
- 관리자 식당 추가, 삭제, 금액 추가, 잔액 조정
- 관리자 콘솔의 팀원별 사용금액 합계
- 팀원의 본인 사용 내역 삭제 요청 처리

## 주요 파일

- [app/page.tsx](./app/page.tsx): 클라이언트 UI와 화면 상태
- [app/api](./app/api): Next.js Route Handler API
- [lib/team-budget](./lib/team-budget): 비즈니스 로직, 에러, HTTP 응답, 저장소 로직
- [db/schema.ts](./db/schema.ts): Drizzle schema
- [db/index.ts](./db/index.ts): Supabase Postgres와 Supabase Storage 연결
- [drizzle-postgres](./drizzle-postgres): Supabase Postgres용 Drizzle migration
- [team-budget-app-docs.md](./team-budget-app-docs.md): 요구사항, 화면, API, DB 설계 문서
