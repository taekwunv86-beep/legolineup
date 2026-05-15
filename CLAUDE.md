# DESCO 교육 운영 보조 시스템

레고 컨베이어 벨트 조립 게임을 활용한 팀 빌딩 교육 콘텐츠의 운영 보조 웹앱.
교육 현장은 오프라인, 본 시스템은 모바일 웹 기반으로 기록 측정과 운영만 담당.

## 무엇을 만드는가

3-레이어 웹앱:

- **팀(사용자)** — 모바일 1대로 5명 1팀이 로그인, 스톱워치 + 시도 기록 입력
- **FT(현장 운영자)** — 모바일/태블릿에서 팀별 시도 확인 + 미션 성공 처리 + 관찰 메모
- **관리자** — PC 브라우저에서 차수/팀/계정 관리, 실시간 모니터링, 시상용 리더보드 송출

## 핵심 게임 규칙

- 1팀 5명, 각자 빨/노/초/파/흰 색 중 한 가지 담당
- 30개의 레고 블럭(5색 × 3~4종)으로 컨베이어 벨트 방식 조립
- 15분 안에 완성품 10개를 가장 빨리 만든 팀이 우승
- 조립 순서와 회전 수(턴)는 팀이 자유롭게 기획 (해법 1만 가지 이상)
- 턴수는 nT+n 표기 (예: 3T+2 = 5색 사이클 3바퀴 + 추가 2색에서 완성)

## 기술 스택

**프론트엔드**
- React + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query (서버 상태)
- Dexie.js (IndexedDB, 오프라인 큐)
- React Router

**백엔드**
- Hono on Cloudflare Workers
- Cloudflare D1 (SQLite 호환)
- Drizzle ORM
- JWT 인증
- Web Crypto API (PBKDF2 비밀번호 해싱)

**호스팅**
- Cloudflare Pages (정적 SPA) + Workers (API) + D1 (DB)
- 한 도메인에 묶어 CORS 회피

**기타**
- ExcelJS (엑셀 내보내기)
- 실시간: HTTP 폴링 (카운트다운 0.5초/내부, 팀카드 1.5초, 리더보드 1초, FT 2초)

## 5가지 핵심 설계 원칙

1. **클라이언트 측정 시각이 공식 기록** — 스마트폰 화면 숫자 = 진실. 정지 버튼 클릭 즉시 `Date.now()` 캡처, 어떤 비동기 작업도 끼우지 않음
2. **차수 시작은 서버 T0 기준** — 모든 팀이 동일 출발선. 관리자 "전체 시작" 시 서버에서 트랜잭션으로 status=active, started_at_ms 박고 모든 팀에 attempt #1 일괄 INSERT
3. **오프라인 우선** — IndexedDB 큐에 먼저 적재, 백그라운드 동기화. client_uuid로 서버 멱등 처리
4. **lazy 종료** — Cloudflare Workers에 별도 cron 없이, API 호출 시점에 시간 만료 체크 (클라이언트 카운트다운 0 도달 시에도 종료 API 호출)
5. **모바일 우선** — 팀/FT 화면은 모바일 사이즈, 관리자만 PC 위주

## 역할 권한

| 작업 | 관리자 | FT | 팀 |
|---|---|---|---|
| 차수 생성/시간 설정 | ✓ | - | - |
| 팀 생성/계정 발급 | ✓ | - | - |
| 전체 시작/종료 | ✓ | - | - |
| 모든 팀 모니터링 | ✓ | ✓ | - |
| 성공 처리 | ✓ | ✓ | - |
| 성공 취소 | ✓ | - | - |
| FT 메모 작성 | ✓ | ✓ | - |
| 시도 기록 | - | - | ✓ |
| 엑셀 내보내기 | ✓ | - | - |
| 계정 관리 | ✓ | - | - |

FT는 모든 팀을 볼 수 있되 UI 정렬/필터로 특정 팀만 디스플레이.

## 화면 ID 체계

| ID | 화면 | 디바이스 |
|---|---|---|
| TM-01 | 팀 로그인 | 모바일 |
| TM-02 | 팀 대기 화면 | 모바일 |
| TM-03 | 팀 측정 화면 (상태 A/B) | 모바일 |
| TM-04 | 팀 시퀀스 입력 | 모바일 |
| TM-05 | 팀 시도 이력 | 모바일 |
| TM-06 | 팀 세션 종료 | 모바일 |
| FT-01 | FT 로그인 | 모바일/태블릿 |
| FT-02 | FT 차수 선택 | 모바일/태블릿 |
| FT-03 | FT 팀 목록 | 모바일/태블릿 |
| FT-04 | FT 팀 상세 + 성공 처리 + 메모 | 모바일/태블릿 |
| FT-05 | FT 그리드 뷰 (옵션) | 태블릿 |
| ADM-01 | 관리자 로그인 | PC |
| ADM-02 | 차수 관리 | PC |
| ADM-03 | 라이브 운영 (핵심) | PC |
| ADM-04 | 팀 관리 | PC |
| ADM-05 | 계정 관리 | PC |
| ADM-06 | 기록 조회 / 엑셀 | PC |
| ADM-07 | 비교 리포트 | PC |
| LB-02 | 공개 리더보드 | 큰 모니터 |

전체 화면 명세는 `docs/SPEC.md`의 4절 참조.

## 차수 라이프사이클

`preparing` → `active` → `ended` (단방향, 되돌릴 수 없음)

- `preparing`: 팀 생성, 계정 발급, 시간 설정 자유
- `active`: 시도 누적, FT 성공 처리, 실시간 모니터링. 시간 변경/팀 추가 차단
- `ended`: 모든 쓰기 차단. 읽기와 엑셀 내보내기만 허용

차수 종료 후 팀 데이터 영구 보존. `username` UNIQUE는 `(round_id, username)` 복합.

## 폴더 구조 (제안)

```
.
├── CLAUDE.md
├── docs/
│   └── SPEC.md
├── client/                  # React + Vite
│   ├── src/
│   │   ├── pages/
│   │   │   ├── team/        # TM-01 ~ TM-06
│   │   │   ├── ft/          # FT-01 ~ FT-05
│   │   │   ├── admin/       # ADM-01 ~ ADM-07
│   │   │   └── leaderboard/ # LB-02
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── db.ts        # Dexie (IndexedDB)
│   │   │   ├── api.ts       # API 클라이언트
│   │   │   ├── auth.ts      # JWT
│   │   │   └── sync.ts      # 오프라인 동기화 큐
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── worker/                  # Cloudflare Worker
│   ├── src/
│   │   ├── routes/          # Hono 라우트 (auth, rounds, teams, attempts, ...)
│   │   ├── db/              # Drizzle schema + migrations
│   │   ├── middleware/      # JWT, error handling
│   │   └── index.ts
│   ├── wrangler.toml
│   └── package.json
└── README.md
```

## 작업 컨벤션

- 모든 문서/UI 라벨은 한국어
- DB 컬럼명은 영문 snake_case
- API 경로는 영문 kebab-case (예: `/api/rounds/:id/start`)
- TypeScript 식별자는 camelCase, 컴포넌트는 PascalCase
- 시간 저장은 Unix epoch
  - 정밀도 필요 필드(stopwatch 관련)는 **밀리초** (started_at_ms, stopped_at_ms, duration_ms)
  - 메타데이터(created_at 등)는 **초**
  - 모두 UTC 저장, UI 표시 시 KST 변환
- 커밋 메시지: `[feat|fix|refactor|docs|test] 한국어 설명` 형식
- PR 단위: 화면 단위 또는 기능 단위

## 첫 작업 추천 순서

1. **인프라 셋업** — Cloudflare 계정에 Pages + Workers + D1 프로비저닝, wrangler CLI 설치
2. **레포 구조 생성** — 위 폴더 구조대로 client/worker 셋업, 의존성 설치
3. **DB 스키마 적용** — `docs/SPEC.md`의 2.2절 CREATE TABLE 문 D1에 적용 (`wrangler d1 execute`)
4. **인증 골격** — JWT 발급/검증 미들웨어, 로그인 API (관리자/FT/팀 3종), 시드 관리자 계정 생성
5. **관리자 CRUD** — ADM-02 차수 관리, ADM-04 팀 관리, ADM-05 계정 관리
6. **핵심 동작 구현** — ADM-03 라이브 운영 + TM-03 측정 화면 (동기화 시작이 가장 까다로움, 트랜잭션 보장과 폴링 갱신을 함께 다룸)
7. **FT 흐름** — FT-03 팀 목록, FT-04 팀 상세 + 성공 처리
8. **나머지 팀 화면** — TM-01/02/04/05/06, IndexedDB 오프라인 큐 동기화 안정화
9. **리더보드** — LB-02 (시상식 디자인 별도 다듬기)
10. **마무리** — ADM-06 엑셀 내보내기, ADM-07 비교 리포트, 모바일 UX 최종 점검

각 단계는 동작 검증 후 다음으로 진행. 특히 6번 단계 전에 인증과 CRUD가 완전히 동작해야 함.

## 알려진 결정 미정 사항

- 비교 리포트(ADM-07) 그래프 종류는 구현 시점에 결정
- 한 차수에 동시 진행 가능한 차수 수 제한 — 일단 무제한
- 팀의 두 단말 동시 로그인 처리 — MVP에선 막지 않음, 마지막 로그인 우선

상세 명세는 항상 `docs/SPEC.md`를 우선 참조할 것.

## 참고: Claude Code 작업 시

- 모르는 화면 명세가 나오면 `docs/SPEC.md`의 4절(화면별 기능 명세) 검색
- SQL 변경이 필요하면 `docs/SPEC.md`의 2.2절 DDL부터 수정 후 마이그레이션 파일 생성
- API 응답 형식이 모호하면 `docs/SPEC.md`의 3.8절 응답 형식 / 에러 코드 참조
- 시간 처리 헷갈리면 위 "작업 컨벤션"의 시간 저장 정책 재확인
- 새로운 기능 추가 시 화면 ID 체계 확장 (TM-07, ADM-08 식)
