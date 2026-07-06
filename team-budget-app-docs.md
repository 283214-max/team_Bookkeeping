# 팀 가계부 웹앱 프로젝트 문서

문서 기준일: 2026-07-02  
대상 서비스: 소규모 팀 내부에서 식당별 예산, 잔액, 사용 내역을 관리하는 웹앱

---

## 1단계. 요구사항 분석

### 서비스 목적

팀 가계부 웹앱은 팀이 식당별로 배정한 예산과 잔액을 투명하게 관리하기 위한 내부 업무 도구다. 팀원이 식당에서 금액을 사용하면 해당 식당의 잔액이 차감되고, 관리자는 식당별 예산을 추가하거나 잔액을 조정할 수 있다. 모든 잔액 변경은 거래 이력으로 남겨 추후 정산, 감사, 오류 확인이 가능해야 한다.

### 사용자 역할

| 역할 | 설명 | 주요 권한 |
|---|---|---|
| 관리자 | 팀 예산을 관리하는 사용자 | 식당 생성/수정, 금액 추가, 잔액 조정, 전체 이력 조회, 사용자 권한 관리 |
| 팀원 | 식당 사용 금액을 등록하고 조회하는 사용자 | 식당 목록 조회, 잔액 조회, 사용 내역 등록, 본인 사용 내역 조회 |

### 핵심 기능

| 기능 | 설명 | 대상 권한 |
|---|---|---|
| 식당별 잔액 관리 | 식당마다 현재 잔액, 누적 추가 금액, 누적 사용 금액을 관리 | 관리자, 팀원 조회 |
| 사용 내역 기록 | 팀원이 식당, 금액, 사용일, 메모를 입력하면 잔액 차감 | 관리자, 팀원 |
| 금액 추가 | 관리자가 특정 식당에 예산을 추가 | 관리자 |
| 잔액 조정 | 관리자가 오류 정정, 정산 반영 등을 위해 잔액을 증감 | 관리자 |
| 권한 관리 | 사용자 역할을 관리자 또는 팀원으로 지정 | 관리자 |
| 조회 기능 | 식당별 잔액, 거래 이력, 기간별 사용 내역 조회 | 관리자 전체, 팀원 제한 조회 |

### 부가 기능

| 기능 | 설명 | 우선순위 |
|---|---|---|
| 잔액 부족 알림 | 식당 잔액이 기준 이하일 때 관리자에게 표시 | 중 |
| 엑셀/CSV 내보내기 | 월별 사용 내역 다운로드 | 중 |
| 영수증 첨부 | 사용 내역에 이미지 첨부 | 하 |
| 승인 워크플로 | 팀원 등록 후 관리자 승인 시 차감 | 하 |
| 다중 팀 지원 | 여러 팀이 같은 시스템을 분리 사용 | 하 |

### 주요 정책

- 금액 단위는 원화 기준 정수 `KRW`로 저장한다.
- 잔액이 부족하면 사용 내역 등록을 거절한다.
- 잔액 변경은 `transactions` 원장에 반드시 기록한다.
- 현재 잔액은 조회 성능을 위해 `restaurant_balances`에 스냅샷으로 보관한다.
- 거래 이력은 삭제하지 않고 취소 또는 반대 거래로 정정한다.

---

## 2단계. 추천 기술스택 제안

공식 문서 기준으로 Next.js는 React 기반 풀스택 웹앱 개발을 지원하고, Supabase Auth는 인증/인가와 Postgres 연동을 제공한다. 운영형 구조에서는 NestJS Guard 기반 인가와 Prisma 트랜잭션을 활용하면 API 계층과 데이터 무결성을 더 명확히 분리할 수 있다.

### 옵션 A. 간단한 MVP용 스택

| 영역 | 추천 | 이유 |
|---|---|---|
| 프론트엔드 | Next.js App Router, TypeScript, Tailwind CSS | 화면, 라우팅, 서버 연동을 한 프로젝트에서 빠르게 개발 |
| 백엔드 | Next.js Route Handlers 또는 Server Actions | 별도 API 서버 없이 MVP 구현 가능 |
| 데이터베이스 | Supabase PostgreSQL | 관리형 DB, 백업, 콘솔, SQL 편집기 제공 |
| 인증 | Supabase Auth | 이메일 로그인, OAuth, JWT, RLS 연동이 빠름 |
| 배포 | Vercel + Supabase | 내부용 서비스의 초기 배포와 운영 부담이 작음 |
| 상태 관리 | TanStack Query, React Hook Form, Zod | 서버 상태 캐싱, 폼 검증, 타입 안정성 |

추천 상황: 1~2명이 빠르게 만들고, 팀 내부 사용자가 적으며, 기능 범위가 잔액/이력/권한 관리 중심일 때.

### 옵션 B. 확장 가능한 운영용 스택

| 영역 | 추천 | 이유 |
|---|---|---|
| 프론트엔드 | Next.js, TypeScript, Tailwind CSS | MVP와 동일한 UX 자산 재사용 가능 |
| 백엔드 | NestJS REST API | 모듈, Guard, Pipe, Service 구조로 도메인 분리 용이 |
| 데이터베이스 | PostgreSQL | 거래 원장, 트랜잭션, 잠금, 집계에 적합 |
| ORM | Prisma | 타입 안정성, 마이그레이션, 트랜잭션 API 활용 |
| 인증 | Auth.js, Supabase Auth, Auth0, Keycloak 중 택1 | 조직 인증 방식에 따라 선택 가능 |
| 배포 | Docker + Fly.io/Render/Cloud Run/AWS ECS + Managed PostgreSQL | 트래픽 증가, 백엔드 분리, 운영 관측성 확보 |
| 운영 | GitHub Actions, Sentry, OpenTelemetry, DB 백업 | 장애 대응과 변경 추적에 유리 |

추천 상황: 사용자 수 증가, 감사 요구, 승인 프로세스, 다중 팀, 사내 SSO 연동 가능성이 있을 때.

---

## 3단계. Guide 문서

### 프로젝트 개요

팀 가계부 웹앱은 식당별 예산 잔액을 기준으로 팀 지출을 기록하는 내부 웹 서비스다. 핵심 도메인은 `사용자`, `식당`, `잔액`, `거래` 네 가지이며, 잔액 변경은 항상 거래 원장을 통해 발생한다.

### 제품 및 디자인 방향

Apple.com의 디자인을 참고하되, 브랜드 요소나 화면 구성을 그대로 복제하지 않는다. 참고 범위는 얇고 정돈된 내비게이션, 넓은 여백, 명확한 시각 계층, 짧은 문장, 핵심 액션을 바로 찾을 수 있는 화면 구성이다. 이 서비스는 내부 업무앱이므로 마케팅형 랜딩 페이지가 아니라 로그인 후 대시보드가 첫 화면이 되어야 한다.

| 디자인 원칙 | 적용 방향 |
|---|---|
| 콘텐츠 우선 | 첫 화면에서 총 잔액, 잔액 부족 식당, 최근 거래가 즉시 보여야 한다. |
| 절제된 시각 요소 | 과한 장식, 큰 히어로 이미지, 불필요한 설명 문구를 피하고 데이터 밀도를 유지한다. |
| 명확한 액션 | `사용 등록`, `금액 추가`, `거래 내역` 같은 핵심 액션을 화면 상단 또는 식당 상세 상단에 배치한다. |
| 넓은 여백과 정렬 | 주요 섹션은 충분한 여백을 두되, 테이블과 폼은 업무용으로 빠르게 스캔 가능하게 구성한다. |
| 짧은 카피 | 버튼과 안내 문구는 짧고 직접적으로 작성한다. 예: `사용 등록`, `금액 추가`, `잔액 조정`. |
| 신뢰감 있는 피드백 | 잔액 차감, 추가, 오류, 권한 제한을 색상과 메시지로 즉시 알려준다. |
| 접근성 | 색상만으로 상태를 구분하지 않고 라벨, 아이콘, 텍스트를 함께 제공한다. |

### 주요 기능

| 분류 | 기능 | 설명 |
|---|---|---|
| 인증 | 로그인/로그아웃 | 이메일 또는 조직 계정으로 로그인 |
| 대시보드 | 전체 잔액 요약 | 총 잔액, 식당별 잔액, 최근 사용 내역 표시 |
| 식당 관리 | 식당 생성/수정/비활성화 | 관리자가 예산 관리 대상 식당을 관리 |
| 잔액 관리 | 현재 잔액 조회 | 식당별 사용 가능 금액 표시 |
| 사용 등록 | 사용 금액 차감 | 팀원이 금액을 등록하면 잔액에서 차감 |
| 금액 추가 | 예산 충전 | 관리자가 식당별 금액 추가 |
| 조정 | 잔액 증감 조정 | 오류 정정 또는 정산 반영 |
| 이력 조회 | 거래 목록 조회 | 기간, 식당, 유형, 사용자 기준 필터링 |

### 사용자 권한

| 행위 | 관리자 | 팀원 |
|---|---:|---:|
| 로그인 | 가능 | 가능 |
| 식당 목록/상세 조회 | 가능 | 가능 |
| 사용 내역 등록 | 가능 | 가능 |
| 금액 추가/잔액 조정 | 가능 | 불가 |
| 식당 생성/수정 | 가능 | 불가 |
| 전체 사용자 이력 조회 | 가능 | 제한 |
| 사용자 역할 변경 | 가능 | 불가 |

### 화면 흐름

```text
로그인
  -> 대시보드
      -> 식당 목록
          -> 식당 상세
              -> 사용 내역 등록
              -> 거래 이력 조회
              -> 관리자 금액 추가/조정
      -> 전체 사용 내역
      -> 관리자 사용자/식당 관리
```

### 데이터 흐름

```text
1. 사용자가 로그인하고 JWT 또는 세션을 발급받는다.
2. 프론트엔드는 대시보드 진입 시 식당 목록, 잔액, 최근 거래를 조회한다.
3. 팀원이 사용 금액을 등록하면 백엔드는 권한과 잔액을 검증한다.
4. 백엔드는 DB 트랜잭션 안에서 restaurant_balances를 잠그거나 조건부 갱신한다.
5. transactions에 거래 원장을 기록하고 restaurant_balances 스냅샷을 갱신한다.
6. 프론트엔드는 관련 캐시를 무효화하고 최신 잔액과 이력을 다시 표시한다.
```

### 개발 및 운영 가이드

- 개발 환경은 Node.js LTS, TypeScript, PostgreSQL 로컬 또는 Supabase 개발 프로젝트를 사용한다.
- 환경 변수는 `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_API_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`처럼 역할별로 분리한다.
- DB 변경은 마이그레이션으로만 반영한다.
- 금액 변경 API는 반드시 서버에서 권한, 입력값, 현재 잔액을 재검증한다.
- 배포 전 `lint`, `typecheck`, `test`, `migration dry-run`을 통과시킨다.
- 운영에서는 일 단위 DB 백업, 관리자 권한 변경 감사 로그, 거래 실패 로그 모니터링을 적용한다.

### 향후 확장 아이디어

- 월별 예산 리셋 및 자동 이월
- 사용 내역 승인 워크플로
- 영수증 이미지 첨부 및 OCR
- Slack/Teams 잔액 부족 알림
- 다중 팀, 부서, 프로젝트별 예산 분리
- 월별 리포트와 CSV 다운로드

---

## 4단계. Front 문서

### Apple.com 참고 디자인 시스템

Apple.com은 얇은 상단 내비게이션, 큰 주제 중심 섹션, 짧은 보조 문구, 명확한 CTA 링크, 이미지 중심의 시각적 초점을 사용한다. 팀 가계부 웹앱에서는 이를 업무용 UI에 맞게 변환해 `대시보드 중심`, `데이터 우선`, `절제된 액션` 패턴으로 적용한다.

복제하지 않는 것:

- Apple 로고, 제품 이미지, 고유 카피, 브랜드 폰트, 아이콘을 사용하지 않는다.
- 대형 마케팅 히어로를 앱 첫 화면으로 만들지 않는다.
- 업무 화면을 장식용 카드와 이미지로 채우지 않는다.

적용하는 것:

- 상단 내비게이션은 44~52px 높이의 얇은 바 형태로 구성한다.
- 화면 배경은 밝은 중립색을 사용하고, 중요 데이터는 흰색 또는 아주 옅은 회색 표면 위에 배치한다.
- 주요 수치에는 큰 숫자와 짧은 라벨을 사용한다.
- 버튼은 핵심 액션 1개를 우선 강조하고, 보조 액션은 텍스트 버튼 또는 낮은 강조도로 둔다.
- 상태 색상은 의미 중심으로 사용한다. 예: 추가는 녹색, 사용은 붉은색, 경고는 노란색, 일반 액션은 파란색.

### 디자인 토큰 예시

| 항목 | 값 | 용도 |
|---|---|---|
| 기본 배경 | `#F5F5F7` | 전체 앱 배경 |
| 표면 | `#FFFFFF` | 테이블, 폼, 요약 영역 |
| 기본 텍스트 | `#1D1D1F` | 본문과 주요 숫자 |
| 보조 텍스트 | `#6E6E73` | 설명, 메타 정보 |
| 경계선 | `#D2D2D7` | 테이블 라인, 입력 필드 |
| 기본 액션 | `#0071E3` | 주요 버튼, 링크 |
| 성공 | `#248A3D` | 금액 추가, 정상 상태 |
| 위험 | `#D70015` | 사용 차감, 오류 상태 |
| 경고 | `#B25000` | 잔액 부족 주의 |
| 카드 반경 | `8px` | 반복 카드와 패널 |
| 기본 간격 | `8px` 기반 스케일 | `8`, `16`, `24`, `32`, `48` |
| 글꼴 | system-ui 계열 | OS 기본 폰트 기반 가독성 |

### 레이아웃 규칙

- 데스크톱은 최대 콘텐츠 폭 `1200px` 안에서 12컬럼 그리드를 사용한다.
- 모바일은 하단 고정 액션보다 상단 주요 액션과 스티키 필터를 우선한다.
- 대시보드는 한 화면에서 주요 잔액을 파악할 수 있게 `요약 -> 위험 항목 -> 최근 거래` 순서로 배치한다.
- 테이블은 행 높이 48~56px, 숫자 컬럼 우측 정렬, 금액 변화는 부호와 색상을 함께 표시한다.
- 모달은 금액 변경처럼 되돌리기 어려운 작업에만 사용하고, 일반 조회/필터는 인라인 패널로 처리한다.
- 카드 안에 또 다른 카드를 중첩하지 않는다.

### 화면 목록 및 API 연동

| 화면 | UI 구성 요소 | 사용자 액션 | API |
|---|---|---|---|
| 로그인 | 이메일/비밀번호, OAuth 버튼, 오류 메시지 | 로그인, 로그아웃 | `POST /auth/login`, `POST /auth/logout` |
| 대시보드 | 총 잔액 카드, 잔액 부족 식당, 최근 거래 테이블 | 식당 상세 이동, 기간 필터 | `GET /dashboard/summary`, `GET /transactions?limit=10` |
| 식당 목록 | 검색, 상태 필터, 잔액 테이블, 식당 추가 버튼 | 검색, 상세 이동, 관리자 식당 추가 | `GET /restaurants`, `POST /restaurants` |
| 식당 상세 | 식당 정보, 현재 잔액, 거래 이력, 액션 버튼 | 사용 등록, 금액 추가, 조정, 이력 필터 | `GET /restaurants/{id}`, `GET /restaurants/{id}/transactions` |
| 사용 내역 등록 | 식당 선택, 금액 입력, 사용일, 메모 | 사용 금액 저장 | `POST /restaurants/{id}/transactions/spend` |
| 관리자 금액 추가 | 식당 선택, 추가 금액, 사유 입력 | 예산 추가 저장 | `POST /restaurants/{id}/transactions/top-up` |
| 관리자 잔액 조정 | 조정 금액, 조정 사유, 확인 모달 | 잔액 증감 조정 | `POST /restaurants/{id}/transactions/adjust` |
| 이력 조회 | 기간 필터, 식당 필터, 유형 필터, 페이지네이션 | 검색, CSV 다운로드 | `GET /transactions`, `GET /transactions/export` |
| 사용자 관리 | 사용자 목록, 역할 선택, 상태 변경 | 권한 변경, 비활성화 | `GET /users`, `PATCH /users/{id}/role` |

### 화면별 디자인 적용

| 화면 | Apple식 해석 | 적용 상세 |
|---|---|---|
| 로그인 | 단일 초점 | 중앙 정렬 폼, 짧은 서비스명, 보조 설명 최소화 |
| 대시보드 | 주제 중심 섹션 | 첫 섹션에 `총 잔액`을 큰 숫자로 표시하고, 바로 아래 잔액 부족 식당을 노출 |
| 식당 목록 | 정돈된 탐색 | 얇은 상단 필터, 검색, 정렬 가능한 테이블, 상태 배지 |
| 식당 상세 | 핵심 대상 강조 | 식당명, 현재 잔액, 주요 액션을 상단에 고정하고 이력은 아래 배치 |
| 사용 내역 등록 | 빠른 작업 | 금액 입력을 가장 크게 배치하고 식당/날짜/메모는 보조 필드로 구성 |
| 관리자 금액 추가 | 신뢰와 확인 | 변경 전 잔액, 추가 금액, 변경 후 예상 잔액을 한 줄 흐름으로 표시 |
| 거래 이력 | 스캔 가능성 | 거래 유형, 금액 변화, 사용자, 일시를 고정 컬럼 순서로 유지 |

### 상태 관리 방식

| 상태 유형 | 추천 방식 | 예시 |
|---|---|---|
| 서버 상태 | TanStack Query 또는 Next.js 서버 데이터 패칭 | 식당 목록, 잔액, 거래 이력 |
| 폼 상태 | React Hook Form + Zod | 사용 등록, 금액 추가, 로그인 |
| 전역 UI 상태 | Zustand 또는 React Context | 사이드바 열림, 필터 기본값 |
| 인증 상태 | Auth Provider 세션 | 현재 사용자, 역할, 토큰 |
| 캐시 정책 | mutation 성공 후 관련 query invalidate | 사용 등록 후 식당 상세/대시보드 갱신 |

### 폴더 구조 예시

```text
src/
  app/
    (auth)/login/page.tsx
    (app)/dashboard/page.tsx
    (app)/restaurants/page.tsx
    (app)/restaurants/[id]/page.tsx
    (app)/transactions/page.tsx
    (admin)/admin/users/page.tsx
  features/
    auth/
    restaurants/
    balances/
    transactions/
    users/
  components/
    ui/
    layout/
  lib/
    api-client.ts
    auth.ts
    validators.ts
  types/
    api.ts
```

### 프론트엔드 구현 원칙

- 금액 입력은 숫자만 허용하고 천 단위 구분 표시를 적용한다.
- 잔액 부족 오류는 폼 상단과 금액 필드에 동시에 표시한다.
- 관리자 전용 버튼은 권한이 없으면 렌더링하지 않는다.
- 거래 저장 버튼은 중복 클릭 방지를 위해 요청 중 비활성화한다.
- 모바일에서도 식당 목록과 사용 등록이 빠르게 가능하도록 주요 액션을 상단에 배치한다.
- 화면 제목은 짧게 유지하고, 설명 문구보다 실제 잔액과 거래 데이터를 먼저 보여준다.
- 상단 내비게이션은 얇고 일관되게 유지하며, 현재 위치와 사용자 역할만 명확히 표시한다.
- 주요 액션 버튼은 화면당 1개를 원칙으로 하고, 나머지는 보조 버튼 또는 메뉴로 낮춘다.
- 금액 변화는 `+50,000원`, `-12,000원`처럼 부호를 붙이고 색상과 라벨을 함께 제공한다.
- 애니메이션은 페이지 전환보다 저장 완료, 오류, 필터 적용 같은 상태 피드백에만 짧게 사용한다.

---

## 5단계. Backend 문서

### 인증/인가 구조

- 인증은 JWT 또는 서버 세션 기반으로 처리한다.
- 모든 API는 인증 미들웨어를 통과해야 하며, 공개 API는 로그인/헬스체크 정도로 제한한다.
- 사용자 역할은 `users.role`의 `ADMIN`, `MEMBER`로 관리한다.
- 백엔드에서는 라우트별 권한을 Guard 또는 Middleware로 검증한다.
- 프론트엔드의 버튼 숨김은 UX일 뿐이며, 실제 권한 검증은 반드시 백엔드에서 수행한다.

### API 설계

| Method | URL | Request | Response | 권한 |
|---|---|---|---|---|
| `POST` | `/auth/login` | `{ email, password }` | `{ accessToken, user }` | 공개 |
| `POST` | `/auth/logout` | 없음 | `{ success }` | 로그인 |
| `GET` | `/me` | 없음 | `{ id, email, name, role }` | 로그인 |
| `GET` | `/dashboard/summary` | `from?, to?` | `{ totalBalance, restaurants, recentTransactions }` | 로그인 |
| `GET` | `/restaurants` | `q?, status?, page?` | `{ items, total }` | 로그인 |
| `POST` | `/restaurants` | `{ name, category?, initialAmount? }` | `{ restaurant }` | 관리자 |
| `GET` | `/restaurants/{id}` | 없음 | `{ restaurant, balance }` | 로그인 |
| `PATCH` | `/restaurants/{id}` | `{ name?, category?, status? }` | `{ restaurant }` | 관리자 |
| `GET` | `/restaurants/{id}/balance` | 없음 | `{ restaurantId, currentAmount, updatedAt }` | 로그인 |
| `GET` | `/restaurants/{id}/transactions` | `type?, from?, to?, page?` | `{ items, total }` | 로그인 |
| `POST` | `/restaurants/{id}/transactions/spend` | `{ amount, usedAt, memo?, idempotencyKey }` | `{ transaction, balance }` | 로그인 |
| `POST` | `/restaurants/{id}/transactions/top-up` | `{ amount, memo, idempotencyKey }` | `{ transaction, balance }` | 관리자 |
| `POST` | `/restaurants/{id}/transactions/adjust` | `{ amountDelta, memo, idempotencyKey }` | `{ transaction, balance }` | 관리자 |
| `GET` | `/transactions` | `restaurantId?, userId?, type?, from?, to?, page?` | `{ items, total }` | 관리자 전체, 팀원 제한 |
| `POST` | `/transactions/{id}/void` | `{ reason, idempotencyKey }` | `{ reversalTransaction, balance }` | 관리자 |
| `GET` | `/users` | `q?, role?, status?` | `{ items, total }` | 관리자 |
| `PATCH` | `/users/{id}/role` | `{ role }` | `{ user }` | 관리자 |

### 주요 Request/Response 예시

```json
{
  "amount": 25000,
  "usedAt": "2026-07-02",
  "memo": "점심 식대",
  "idempotencyKey": "client-generated-uuid"
}
```

```json
{
  "transaction": {
    "id": "uuid",
    "type": "SPEND",
    "amountDelta": -25000,
    "balanceBefore": 100000,
    "balanceAfter": 75000
  },
  "balance": {
    "restaurantId": "uuid",
    "currentAmount": 75000
  }
}
```

### 에러 처리 정책

| HTTP Status | 코드 | 상황 |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | 금액이 0 이하, 필수값 누락, 날짜 형식 오류 |
| 401 | `UNAUTHORIZED` | 로그인하지 않음 또는 토큰 만료 |
| 403 | `FORBIDDEN` | 관리자 권한 필요 |
| 404 | `NOT_FOUND` | 식당, 사용자, 거래 없음 |
| 409 | `INSUFFICIENT_BALANCE` | 잔액 부족 |
| 409 | `IDEMPOTENCY_CONFLICT` | 같은 키로 다른 요청 재시도 |
| 423 | `BALANCE_LOCKED` | 잔액 갱신 충돌 재시도 초과 |
| 500 | `INTERNAL_ERROR` | 서버 내부 오류 |

공통 에러 응답:

```json
{
  "code": "INSUFFICIENT_BALANCE",
  "message": "잔액이 부족합니다.",
  "details": {
    "currentAmount": 10000,
    "requestedAmount": 25000
  }
}
```

### 트랜잭션 처리 방식

- 사용 등록, 금액 추가, 잔액 조정, 거래 취소는 반드시 DB 트랜잭션으로 처리한다.
- 처리 순서는 `잔액 행 잠금 또는 조건부 갱신 -> 거래 원장 insert -> 잔액 스냅샷 update -> commit`이다.
- PostgreSQL 사용 시 `SELECT ... FOR UPDATE` 또는 `UPDATE ... WHERE current_amount >= amount` 방식으로 동시 차감을 방지한다.
- ORM 사용 시 격리 수준은 중요 금액 변경 API에 한해 `Serializable` 또는 재시도 가능한 전략을 적용한다.
- `idempotencyKey`를 저장해 사용자가 저장 버튼을 여러 번 눌러도 중복 차감되지 않게 한다.

---

## 6단계. DB 문서

### 설계 원칙

- `transactions`는 잔액 변경의 원장이다.
- `restaurant_balances`는 빠른 조회를 위한 현재 잔액 스냅샷이다.
- 거래는 삭제하지 않는다. 정정은 반대 방향의 거래를 새로 만든다.
- 금액 컬럼은 원화 정수 기준 `BIGINT`를 사용한다.

### users

| 컬럼 | 타입 | 설명 | 제약조건 |
|---|---|---|---|
| `id` | UUID | 사용자 ID | PK |
| `email` | VARCHAR(255) | 로그인 이메일 | UNIQUE, NOT NULL |
| `name` | VARCHAR(100) | 사용자명 | NOT NULL |
| `role` | VARCHAR(20) | `ADMIN`, `MEMBER` | NOT NULL |
| `status` | VARCHAR(20) | `ACTIVE`, `INACTIVE` | NOT NULL |
| `auth_provider_user_id` | VARCHAR(255) | 외부 인증 사용자 ID | UNIQUE, NULL |
| `created_at` | TIMESTAMPTZ | 생성일 | NOT NULL |
| `updated_at` | TIMESTAMPTZ | 수정일 | NOT NULL |

### restaurants

| 컬럼 | 타입 | 설명 | 제약조건 |
|---|---|---|---|
| `id` | UUID | 식당 ID | PK |
| `name` | VARCHAR(120) | 식당명 | NOT NULL |
| `category` | VARCHAR(50) | 한식, 중식 등 | NULL |
| `status` | VARCHAR(20) | `ACTIVE`, `INACTIVE` | NOT NULL |
| `memo` | TEXT | 관리자 메모 | NULL |
| `created_by` | UUID | 생성 관리자 | FK users.id |
| `created_at` | TIMESTAMPTZ | 생성일 | NOT NULL |
| `updated_at` | TIMESTAMPTZ | 수정일 | NOT NULL |

### restaurant_balances

| 컬럼 | 타입 | 설명 | 제약조건 |
|---|---|---|---|
| `restaurant_id` | UUID | 식당 ID | PK, FK restaurants.id |
| `current_amount` | BIGINT | 현재 잔액 | NOT NULL, CHECK >= 0 |
| `total_added_amount` | BIGINT | 누적 추가 금액 | NOT NULL, DEFAULT 0 |
| `total_spent_amount` | BIGINT | 누적 사용 금액 | NOT NULL, DEFAULT 0 |
| `version` | INTEGER | 낙관적 잠금 버전 | NOT NULL, DEFAULT 1 |
| `last_transaction_id` | UUID | 마지막 거래 ID | FK transactions.id, NULL |
| `updated_at` | TIMESTAMPTZ | 갱신일 | NOT NULL |

### transactions

| 컬럼 | 타입 | 설명 | 제약조건 |
|---|---|---|---|
| `id` | UUID | 거래 ID | PK |
| `restaurant_id` | UUID | 식당 ID | FK restaurants.id, NOT NULL |
| `user_id` | UUID | 거래 생성 사용자 | FK users.id, NOT NULL |
| `type` | VARCHAR(20) | `SPEND`, `TOP_UP`, `ADJUST`, `REVERSAL` | NOT NULL |
| `amount_delta` | BIGINT | 잔액 변화량, 사용은 음수 | NOT NULL, CHECK != 0 |
| `balance_before` | BIGINT | 변경 전 잔액 | NOT NULL, CHECK >= 0 |
| `balance_after` | BIGINT | 변경 후 잔액 | NOT NULL, CHECK >= 0 |
| `memo` | TEXT | 사용/추가/조정 사유 | NULL |
| `used_at` | DATE | 실제 사용일 | NULL |
| `idempotency_key` | VARCHAR(100) | 중복 요청 방지 키 | UNIQUE, NOT NULL |
| `related_transaction_id` | UUID | 취소 대상 또는 관련 거래 | FK transactions.id, NULL |
| `created_at` | TIMESTAMPTZ | 기록 생성일 | NOT NULL |

### audit_logs

| 컬럼 | 타입 | 설명 | 제약조건 |
|---|---|---|---|
| `id` | UUID | 감사 로그 ID | PK |
| `actor_user_id` | UUID | 행위자 | FK users.id |
| `action` | VARCHAR(80) | 행위명 | NOT NULL |
| `target_type` | VARCHAR(50) | 대상 유형 | NOT NULL |
| `target_id` | UUID | 대상 ID | NULL |
| `metadata` | JSONB | 변경 전후 정보 | NULL |
| `created_at` | TIMESTAMPTZ | 생성일 | NOT NULL |

### 인덱스

| 테이블 | 인덱스 | 목적 |
|---|---|---|
| `users` | `idx_users_email` | 로그인/사용자 검색 |
| `restaurants` | `idx_restaurants_status_name` | 식당 목록 조회 |
| `transactions` | `idx_transactions_restaurant_created` | 식당 상세 이력 조회 |
| `transactions` | `idx_transactions_user_created` | 사용자별 사용 내역 조회 |
| `transactions` | `idx_transactions_type_created` | 유형별/기간별 필터 |
| `transactions` | `uq_transactions_idempotency_key` | 중복 차감 방지 |

### ERD

```text
users 1 ─── N restaurants.created_by
users 1 ─── N transactions.user_id
restaurants 1 ─── 1 restaurant_balances
restaurants 1 ─── N transactions
transactions 1 ─── N transactions.related_transaction_id
users 1 ─── N audit_logs.actor_user_id
```

### 잔액 차감 SQL 흐름 예시

```sql
BEGIN;

SELECT current_amount
FROM restaurant_balances
WHERE restaurant_id = :restaurant_id
FOR UPDATE;

-- current_amount >= :amount 검증

UPDATE restaurant_balances
SET current_amount = current_amount - :amount,
    total_spent_amount = total_spent_amount + :amount,
    version = version + 1,
    updated_at = NOW()
WHERE restaurant_id = :restaurant_id;

INSERT INTO transactions (
  id, restaurant_id, user_id, type, amount_delta,
  balance_before, balance_after, memo, used_at, idempotency_key, created_at
) VALUES (
  :id, :restaurant_id, :user_id, 'SPEND', -:amount,
  :before, :after, :memo, :used_at, :idempotency_key, NOW()
);

COMMIT;
```

---

## 7단계. 최종 통합 구현 기준

### 용어 통일

| 용어 | 의미 |
|---|---|
| 식당 | 예산과 잔액을 관리하는 사용처 |
| 잔액 | 식당에서 현재 사용할 수 있는 금액 |
| 거래 | 잔액을 변경하는 모든 이벤트 |
| 사용 | 팀원이 금액을 소비해 잔액을 차감하는 거래 |
| 금액 추가 | 관리자가 식당 예산을 충전하는 거래 |
| 조정 | 관리자가 정산/오류 수정을 위해 잔액을 증감하는 거래 |

### MVP 구현 순서

1. 인증과 사용자 역할 모델을 구현한다.
2. 식당 CRUD와 식당별 잔액 스냅샷을 구현한다.
3. `transactions` 원장 기반 사용 등록과 금액 추가 API를 구현한다.
4. 대시보드, 식당 목록, 식당 상세, 사용 등록 화면을 구현한다.
5. 관리자 금액 추가/조정 화면과 사용자 관리 화면을 구현한다.
6. 거래 이력 필터, 페이지네이션, CSV 다운로드를 추가한다.
7. 테스트, 배포, 백업, 모니터링을 정리한다.

### 우선 구현 API

초기 릴리스에서는 `POST /auth/login`, `GET /me`, `GET /restaurants`, `GET /restaurants/{id}`, `POST /restaurants/{id}/transactions/spend`, `POST /restaurants/{id}/transactions/top-up`, `GET /transactions`를 먼저 구현한다.

### 테스트 전략

- 단위 테스트: 금액 검증, 권한 검증, 잔액 계산 로직
- 통합 테스트: 사용 등록 시 잔액 차감과 거래 기록 원자성
- 동시성 테스트: 같은 식당에 동시에 여러 사용 등록 요청
- E2E 테스트: 로그인, 식당 조회, 사용 등록, 관리자 금액 추가
- 회귀 테스트: 거래 취소 또는 조정 후 잔액 일관성

### 참고한 공식 문서 및 디자인 레퍼런스

- [Next.js Docs](https://nextjs.org/docs): React 기반 풀스택 웹앱, App Router, 데이터 패칭, Route Handlers 참고
- [Supabase Auth Docs](https://supabase.com/docs/guides/auth): 인증/인가, JWT, RLS 연동 구조 참고
- [NestJS Guards Docs](https://docs.nestjs.com/guards): 라우트 단위 인증/인가 Guard 구조 참고
- [Prisma Transactions Docs](https://www.prisma.io/docs/orm/prisma-client/queries/transactions): 원자적 잔액 갱신, 격리 수준, 재시도 전략 참고
- [Apple.com](https://www.apple.com/): 얇은 글로벌 내비게이션, 큰 주제 중심 섹션, 짧은 카피, 명확한 액션 배치 등 시각 방향 참고
