# DESCO 교육 운영 보조 시스템 — 상세 명세서

본 문서는 시스템 구현에 필요한 모든 세부 사항을 담는다. 프로젝트 컨텍스트와 작업 컨벤션은 루트의 `CLAUDE.md` 참조.

## 목차

1. 시스템 아키텍처
2. 데이터 모델
3. API 엔드포인트
4. 화면별 기능 명세
5. ADM-03 라이브 운영 상세
6. TM-03 측정 화면 상세
7. 핵심 시나리오
8. 엣지 케이스
9. 보안 및 운영 고려사항
10. 개발 로드맵

---

## 1. 시스템 아키텍처

### 1.1 전체 구성

```
[팀 모바일]  [FT 모바일/태블릿]  [관리자 PC]  [리더보드 모니터]
              ↕ HTTPS
        [Cloudflare Pages]    ← 정적 SPA 호스팅
        [Cloudflare Workers]  ← Hono API
              ↕
        [Cloudflare D1]       ← 영구 데이터
```

같은 도메인(예: `event.desco.example`)에 Pages와 Workers를 묶어 CORS 회피.
SPA 라우터가 `/team/*`, `/ft/*`, `/admin/*`, `/leaderboard/*`를 분기.

### 1.2 통신 패턴

- HTTP REST (JSON)
- 인증: JWT (Authorization 헤더), 만료 후 자동 재로그인
- 실시간 갱신은 폴링
  - 카운트다운: 0.5초 (클라이언트 setInterval, 서버 호출 없음)
  - 팀 카드 상태: 1.5초
  - 리더보드: 1초
  - FT 팀 목록: 2초
- 폴링은 직전 응답의 `ETag` 또는 `last_updated_at` 비교로 변화 없을 시 304 반환 가능 (선택 최적화)

### 1.3 오프라인 동기화

- 모든 쓰기는 IndexedDB에 먼저 적재 (Dexie.js)
- `lib/sync.ts`가 백그라운드 큐 처리, FIFO, 실패 시 지수 백오프 재시도
- 모든 attempt는 `client_uuid` 보유 (`crypto.randomUUID()`로 발급)
- 서버는 동일 client_uuid 재수신 시 멱등 처리 (UPSERT)

---

## 2. 데이터 모델

### 2.1 ERD 개요

```
users (관리자/FT)
  └─ rounds (차수, FK: created_by → users)
       └─ teams (FK: round_id → rounds)
            ├─ attempts (FK: team_id → teams)
            └─ ft_notes (FK: team_id → teams, author_id → users)
```

### 2.2 SQL DDL

```sql
-- 관리자 + FT 계정
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'ft')),
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 차수
CREATE TABLE rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  time_limit_seconds INTEGER NOT NULL DEFAULT 900,
  status TEXT NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing', 'active', 'ended')),
  share_token TEXT NOT NULL UNIQUE,
  started_at_ms INTEGER,
  ended_at_ms INTEGER,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_rounds_status ON rounds(status);

-- 팀 (= 모바일 로그인 단위)
CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL REFERENCES rounds(id),
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  last_heartbeat_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (round_id, username)
);

CREATE INDEX idx_teams_round ON teams(round_id);

-- 시도 (스타트~스탑 1회 = 1행)
CREATE TABLE attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  attempt_no INTEGER NOT NULL,
  client_uuid TEXT NOT NULL UNIQUE,
  started_at_ms INTEGER NOT NULL,
  stopped_at_ms INTEGER,
  duration_ms INTEGER,
  assembly_order_1 TEXT,
  assembly_order_2 TEXT,
  assembly_order_3 TEXT,
  assembly_order_4 TEXT,
  assembly_order_5 TEXT,
  turn_t INTEGER,
  turn_extra INTEGER,
  is_success INTEGER NOT NULL DEFAULT 0,
  success_marked_by INTEGER REFERENCES users(id),
  success_marked_at_ms INTEGER,
  user_notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_attempts_team_success_duration
  ON attempts(team_id, is_success, duration_ms);
CREATE INDEX idx_attempts_team_no
  ON attempts(team_id, attempt_no);

-- FT 메모 (랩업용)
CREATE TABLE ft_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_ft_notes_team ON ft_notes(team_id);

-- (선택) 관리자 행위 감사 로그
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target_table TEXT,
  target_id INTEGER,
  payload TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### 2.3 시간 필드 정책

| 용도 | 컬럼 예시 | 단위 |
|---|---|---|
| 스톱워치 정밀도 필요 | started_at_ms, stopped_at_ms, duration_ms, success_marked_at_ms | 밀리초 |
| 메타데이터 | created_at, updated_at | 초 |

저장은 모두 UTC 기준 Unix epoch. UI 표시 시 KST 변환.

### 2.4 조립 순서 필드 설계

5개 컬럼(`assembly_order_1` ~ `assembly_order_5`)으로 분리.
- 각 컬럼은 한 글자 색상 코드 또는 텍스트 (예: 'R', 'Y', 'G', 'B', 'W' 또는 '빨', '노', '초', '파', '흰')
- 클라이언트는 색상 칩 UI로 입력 받고 코드 문자로 저장
- 분리 컬럼인 이유: 엑셀 내보내기 시 컬럼별 정렬/필터 용이, 추후 분석 시 색상별 통계 추출 용이

### 2.5 시드 데이터 (개발용)

```sql
-- 초기 관리자 1명 (개발 환경, 비밀번호는 별도 해시 후 삽입)
INSERT INTO users (username, password_hash, role, display_name)
VALUES ('admin', '<PBKDF2 해시>', 'admin', '관리자');

-- 테스트용 FT 1명
INSERT INTO users (username, password_hash, role, display_name)
VALUES ('ft01', '<PBKDF2 해시>', 'ft', 'FT 김철수');
```

---

## 3. API 엔드포인트

### 3.1 인증

```
POST   /api/auth/login        Body: { username, password }
                              → 200 { token, user: {id, role, display_name} }
                              → 401 { error: { code: 'AUTH_INVALID' } }
POST   /api/auth/logout       클라이언트 토큰 폐기로 갈음 가능
GET    /api/auth/me           → 200 { user }
```

### 3.2 사용자 관리 (관리자 전용)

```
GET    /api/users                          → 200 [user, ...]
POST   /api/users                          Body: { username, password, role, display_name }
PUT    /api/users/:id                      Body: { display_name?, password?, is_active? }
DELETE /api/users/:id                      → soft delete (is_active=0)
```

### 3.3 차수 (관리자 쓰기, FT 읽기)

```
GET    /api/rounds                         쿼리: ?status=active
POST   /api/rounds                         Body: { name, time_limit_seconds? }
GET    /api/rounds/:id                     → round + 팀 수, 성공 합계 등 요약
PUT    /api/rounds/:id                     Body: { name?, time_limit_seconds? }
                                           단, status=preparing일 때만
DELETE /api/rounds/:id                     단, preparing이거나 시도 없는 ended만
POST   /api/rounds/:id/start               → 동기화 시작 (트랜잭션, 5절 참조)
                                           → 200 { started_at_ms, attempts_created: N }
                                           → 409 { error: { code: 'ROUND_NOT_PREPARING' } }
POST   /api/rounds/:id/end                 수동 종료
GET    /api/rounds/:id/live                실시간 운영 데이터 (5.5절 참조)
GET    /api/rounds/:id/export.xlsx         엑셀 파일 응답
GET    /api/rounds/:id/report              비교 리포트 JSON
```

### 3.4 팀 (관리자 쓰기, FT/관리자 읽기, 팀 본인 읽기)

```
GET    /api/rounds/:round_id/teams         → 팀 목록 + 각 팀 요약
POST   /api/rounds/:round_id/teams         Body: { name, username, password }
POST   /api/rounds/:round_id/teams/bulk    Body: { count, name_prefix?, password_pattern? }
                                           일괄 생성 (예: 1팀~5팀, password 자동 4자리)
PUT    /api/teams/:id                      Body: { name?, password? }
DELETE /api/teams/:id                      단, 시도 없는 팀만
GET    /api/teams/:id                      → team + 시도 요약
GET    /api/teams/:id/attempts             → attempt 목록
POST   /api/teams/:id/heartbeat            팀 단말이 5초마다 호출, 미접속 판단용
                                           → 200 { round_status, time_remaining_ms }
```

### 3.5 시도 (팀 쓰기, FT/관리자 성공 처리)

```
POST   /api/attempts                       Body: {
                                             client_uuid,
                                             team_id,
                                             attempt_no,
                                             started_at_ms
                                           }
                                           멱등: 동일 client_uuid 재수신 시 200 + 기존 레코드 반환

PUT    /api/attempts/by-uuid/:uuid         Body: {
                                             stopped_at_ms?,
                                             duration_ms?,
                                             assembly_order_1?..5?,
                                             turn_t?,
                                             turn_extra?,
                                             user_notes?
                                           }
                                           정지 + 입력 데이터 채우기

POST   /api/attempts/:id/success           FT/관리자 권한
                                           → is_success=1, success_marked_by, success_marked_at_ms
DELETE /api/attempts/:id/success           관리자만, 성공 취소
```

### 3.6 FT 메모

```
GET    /api/teams/:id/notes                → 본 팀의 FT 메모 목록
POST   /api/teams/:id/notes                Body: { content }
PUT    /api/notes/:id                      본인 작성분만
DELETE /api/notes/:id                      본인 작성분만
```

### 3.7 공개 리더보드 (인증 불필요, share_token으로 접근)

```
GET    /api/leaderboard/:round_id?token=xxx
       → 200 {
           round_name,
           round_status,
           time_remaining_ms,
           teams: [
             {
               team_id,
               team_name,
               best_duration_ms,         // 성공한 시도 중 최단, 없으면 null
               success_count,
               attempt_count,
               last_success_at_ms
             },
             ...
           ]
         }
       → 401 { error: { code: 'INVALID_TOKEN' } }
```

리더보드는 `teams` 배열을 `best_duration_ms ASC NULLS LAST`로 정렬해서 응답.

### 3.8 응답 형식

성공: HTTP 2xx + JSON 본문
실패: HTTP 4xx/5xx + `{ error: { code, message, details? } }`

에러 코드:

| 코드 | HTTP | 의미 |
|---|---|---|
| `AUTH_REQUIRED` | 401 | 토큰 없음 |
| `AUTH_INVALID` | 401 | 토큰 무효 또는 비밀번호 틀림 |
| `AUTH_EXPIRED` | 401 | 토큰 만료 |
| `PERMISSION_DENIED` | 403 | 권한 부족 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `VALIDATION_FAILED` | 400 | 입력값 검증 실패 |
| `DUPLICATE_RESOURCE` | 409 | UNIQUE 위반 등 |
| `ROUND_NOT_PREPARING` | 409 | preparing이 아닌 차수에 시작 시도 |
| `ROUND_NOT_ACTIVE` | 409 | active가 아닌 차수에 시도 저장 |
| `ROUND_TIME_EXPIRED` | 410 | 시간 만료된 차수에 쓰기 |
| `RATE_LIMITED` | 429 | 호출 빈도 초과 |

---

## 4. 화면별 기능 명세

### 4.1 팀 사용자 (모바일)

#### TM-01 로그인
- 입력: username, password
- 차수가 `preparing`이어도 로그인 가능 → TM-02로 이동
- 차수가 `active`이면 → TM-03 상태 A로 직진 (재로그인 케이스)
- 차수가 `ended`이면 → TM-06으로 이동
- 잘못된 로그인 5회 시 60초 잠금 (선택)

#### TM-02 대기 화면
- 표시: 차수명, 팀명, "관리자가 시작하기를 기다리는 중" 안내
- 백그라운드: `/api/teams/:id/heartbeat` 5초마다 호출
- 응답의 `round_status`가 `active`로 바뀌면 → TM-03 상태 A로 자동 전환

#### TM-03 측정 화면 (메인) — 6절 상세

#### TM-04 시퀀스 입력
- 표시: 조립 순서 5칸(색상 칩 또는 텍스트), 턴수(T값 + 추가값), 메모(선택), 저장 버튼
- 색상 칩: 빨/노/초/파/흰 5개 사전 정의, 탭으로 선택
- 동작: 저장 시 IndexedDB의 해당 attempt 업데이트 → 백그라운드 동기화 큐 추가 → TM-03 상태 B 전환
- 모든 필드 선택 입력 가능 (저장 가능), 비어있으면 "FT가 성공 처리하기 어렵습니다" 안내 표시
- 강제 모달 모드(15분 만료 시): 취소/뒤로가기 비활성, 저장만 가능

#### TM-05 시도 이력
- 표시: 본 팀 attempts 목록 (시도번호 / 시간 / 조립순서 / 턴수 / 성공 표시)
- 정렬: 시도번호 내림차순 기본
- 읽기 전용
- 진입: TM-03 상태 B에서 "이력 보기" 버튼

#### TM-06 세션 종료
- 표시: 차수명, 총 시도수, 성공 수, 최단 기록, 성공한 시도들의 요약 리스트
- "수고하셨습니다" 메시지
- 로그아웃 버튼

### 4.2 FT (모바일/태블릿)

#### FT-01 로그인 — username, password

#### FT-02 차수 선택
- 진행 중 또는 종료된 차수 목록
- 선택 시 FT-03

#### FT-03 팀 목록
- 표시: 차수명, 모든 팀 카드 (팀명/상태배지/시도수/성공수/최단기록/마지막활동)
- 정렬: 최단기록 / 시도수 / 성공수 / 팀명
- 필터: 측정 중 / 시퀀스 대기 / 미접속 / 종료
- 검색: 팀명
- 갱신: 2초 폴링
- 클릭 시 FT-04

#### FT-04 팀 상세
- 상단: 팀 정보 요약 (팀명, 상태, 시도수, 성공수, 최단기록)
- 시도 목록: 모든 attempts (시도번호 / 시작-정지 시각 / 측정시간 / 조립순서 / 턴수 / 메모 / 성공 처리 버튼)
- 성공 처리: 클릭 → 확인 모달 → 즉시 `is_success=1` 갱신
- 이미 성공된 시도: "성공 처리됨" 배지, 관리자만 취소 가능
- FT 메모 섹션: 텍스트 영역, 추가/수정/삭제 (본인 작성분만 수정/삭제)

#### FT-05 그리드 뷰 (옵션, MVP 이후)
- 여러 팀을 한 화면에 동시 표시 (현장 전체 빠르게 둘러보기)
- 각 팀 카드 축소판

### 4.3 관리자 (PC 브라우저)

#### ADM-01 로그인

#### ADM-02 차수 관리
- 차수 목록 (상태 필터)
- 생성: 이름 + 시간(초, 기본 900) 입력
- 수정/삭제: preparing 상태에서만
- 차수 클릭 시 ADM-03(active) 또는 결과 조회(ended)로 분기

#### ADM-03 라이브 운영 — 5절 상세

#### ADM-04 팀 관리
- 차수 내 팀 목록
- 개별 생성: 이름 / username / password
- 일괄 생성: "팀 개수 5, 이름 패턴 '{i}팀', password 자동 생성" 같은 폼
- 팀 정보 수정/삭제 (시도 없는 팀만 삭제 가능)
- 비밀번호 재설정 기능

#### ADM-05 계정 관리
- 관리자/FT 계정 CRUD
- 비밀번호 재설정 (관리자가 직접 변경)
- 비활성화 (soft delete)

#### ADM-06 기록 조회 / 엑셀 내보내기
- 차수별 모든 attempts 표
- 필터: 성공만 / 전체, 팀별
- 컬럼: 팀명, 시도번호, 시작시각(KST), 정지시각(KST), 측정시간(mm:ss.SSS), 조립순서 1~5, T값, 추가값, 성공여부, FT 메모, 사용자 메모
- 엑셀 다운로드: 한국어 헤더, 시트 1개. 차수명/일자/총팀수 등은 시트 상단 메타 영역

#### ADM-07 비교 리포트
- 팀별 최단 기록 막대그래프
- 팀별 시도수 / 성공수 비교
- 시도 시간 분포 (산점도 또는 박스플롯)
- 시간 경과에 따른 성공 누적 그래프
- FT 메모 묶음 보기 (랩업용)

### 4.4 공개 리더보드 (큰 모니터)

#### LB-02 리더보드 메인
- 진입: ADM-03 "리더보드 열기" 버튼 → `window.open()`
- URL: `/leaderboard/:round_id?token=xxx`
- 인증: 없음 (share_token만 검증)
- 표시:
  - 상단: 차수명 (대형), 남은 시간 카운트다운
  - 본문: 팀별 순위표 (순위 / 팀명 / 최단 기록 / 성공수)
  - 큰 폰트 (모니터 멀리서도 보이도록 48~72px)
- 갱신: 1초 폴링
- 디자인: 시상식 분위기, 다크 테마, 전체화면(F11) 안내

---

## 5. ADM-03 라이브 운영 상세 명세

(시스템에서 가장 중요한 화면, 별도 절로 분리)

### 5.1 레이아웃 (위에서 아래로)

1. **헤더**: 차수명, 상태 배지(진행 중/준비/종료), 시작 시각, 팀 수, 우측에 남은 시간 카운트다운(대형)
2. **액션 바**: 전체 시작 / 리더보드 열기 / 차수 종료 / 엑셀 내보내기
3. **요약 카드 4개**: 총 팀 / 측정 중 / 시도 합계 / 성공 합계
4. **정렬 바**: 최단기록 / 시도수 / 성공수 / 팀명 (선택된 항목 강조)
5. **팀 그리드**: 2열, 각 카드는 팀명/상태배지/시도수/성공수/최단기록

### 5.2 액션 버튼 활성 조건

| 버튼 | preparing | active | ended |
|---|---|---|---|
| 전체 시작 | 활성 | 비활성 | 비활성 |
| 리더보드 열기 | 비활성 | 활성 | 활성 |
| 차수 종료 | 비활성 | 활성 | 비활성 |
| 엑셀 내보내기 | 비활성 | 활성 | 활성 |

### 5.3 전체 시작 흐름

1. 클릭 → 확인 모달
2. 서버에서 마지막 heartbeat 30초 초과 팀이 있으면 경고: "6팀 중 1팀이 미접속 상태입니다. 진행하시겠습니까?"
3. 미접속 팀 없으면 단순 확인: "차수를 시작하시겠습니까?"
4. 확인 → `POST /api/rounds/:id/start`
5. 서버에서 단일 트랜잭션:
   ```sql
   BEGIN;
   UPDATE rounds SET status='active', started_at_ms=:T0 WHERE id=:id AND status='preparing';
   -- 영향받은 행 0개면 ROLLBACK + 409 ROUND_NOT_PREPARING
   INSERT INTO attempts (team_id, attempt_no, started_at_ms, client_uuid)
   SELECT id, 1, :T0, lower(hex(randomblob(16))) FROM teams WHERE round_id=:id;
   COMMIT;
   ```
6. 응답: `{ started_at_ms: T0, attempts_created: N }`
7. 클라이언트 화면이 active 모드로 갱신
8. 각 팀 단말은 다음 heartbeat 응답(최대 5초)에 `round_status=active` 감지 → TM-03 상태 A 진입

### 5.4 차수 종료

**수동 종료**

- 차수 종료 버튼 → 확인 모달 → `POST /api/rounds/:id/end`
- 서버: `status='ended'`, `ended_at_ms=now()`
- 진행 중인 attempt(`stopped_at_ms IS NULL`)의 `stopped_at_ms`를 `ended_at_ms`로 보정, `duration_ms` 계산
- 보정된 시도들은 자동 종료 마킹 (`user_notes`에 "[자동 종료]" 추가 등)

**자동 종료 (lazy)**

- 별도 cron 없음
- 클라이언트가 카운트다운 0 도달 시 `POST /api/rounds/:id/end` 호출 (idempotent, 이미 ended면 200)
- 백업: 서버는 어떤 API 호출(`heartbeat`, `live`, `attempts` 저장 등)에서든 `now() >= started_at_ms + time_limit_seconds*1000`이면 active 차수를 자동 종료 처리

### 5.5 라이브 데이터 응답 (`GET /api/rounds/:id/live`)

```json
{
  "round": {
    "id": 12,
    "name": "2026 상반기 신입교육 1차",
    "status": "active",
    "started_at_ms": 1715760000000,
    "time_limit_seconds": 900,
    "time_remaining_ms": 462000
  },
  "summary": {
    "total_teams": 6,
    "measuring_teams": 4,
    "total_attempts": 18,
    "total_successes": 3
  },
  "teams": [
    {
      "id": 101,
      "name": "1팀",
      "status": "measuring",
      "attempt_count": 5,
      "success_count": 1,
      "best_duration_ms": 74000,
      "current_attempt_no": 5,
      "last_activity_at_ms": 1715760300000
    }
  ]
}
```

팀 status: `measuring` (active attempt 있음) / `waiting` (직전 attempt 정지됨, 다음 미시작) / `offline` (heartbeat 30초 초과) / `not_started` (아직 attempt 없음 — 이론상 발생 안 함, attempt #1 자동 생성됨)

### 5.6 폴링 간격 정리

| 화면/기능 | 간격 | 엔드포인트 |
|---|---|---|
| ADM-03 카운트다운 | 0.5초 (클라이언트 내부) | (없음) |
| ADM-03 팀 카드 | 1.5초 | `/api/rounds/:id/live` |
| TM-02 대기 | 5초 (heartbeat 겸용) | `/api/teams/:id/heartbeat` |
| TM-03 측정 중 카운트다운 | 0.5초 | (없음) |
| TM-03 동기화 상태 | (이벤트 기반) | (없음) |
| FT-03 팀 목록 | 2초 | `/api/rounds/:id/live` |
| LB-02 리더보드 | 1초 | `/api/leaderboard/:id?token=xxx` |

### 5.7 미접속 판단

- 팀 단말이 5초마다 `POST /api/teams/:id/heartbeat`
- 서버에서 `teams.last_heartbeat_at` 갱신
- `live` 응답 시 `now() - last_heartbeat_at > 30초`이면 status=offline 표시

### 5.8 팀 카드 클릭

팀 상세 슬라이드 패널 또는 모달:
- 시도 목록 전체 (FT-04와 동일 구성)
- 관리자도 성공 처리 가능
- 관리자만 성공 취소 가능

---

## 6. TM-03 측정 화면 상세 명세

### 6.1 상태 전이

```
TM-02 ─[관리자 전체 시작]─▶ TM-03/A (attempt #1)
TM-03/A ─[정지 버튼]─▶ TM-04 ─[저장]─▶ TM-03/B
TM-03/B ─[시작 버튼]─▶ TM-03/A (attempt #N+1)
TM-03/* ─[15분 만료]─▶ (강제 정지 + TM-04 강제 모달) ─▶ TM-06
```

### 6.2 상태 A — 측정 중

표시:
- 상단: 팀명, 동기화 상태 아이콘
- 남은 세션 시간 (작게)
- 현재 시도 번호 ("시도 #N 측정 중")
- 큰 스톱워치 (mm:ss.SS, 밀리초 2자리)
- 정지 버튼 (큰 빨간 버튼)
- 직전 시도 한 줄 요약 (시도번호 · 시간 · 조립순서 · 턴수)

### 6.3 상태 B — 다음 시도 대기

표시:
- 상단: 팀명, 동기화 상태 아이콘
- 남은 세션 시간
- 직전 시도 카드 (시도번호 · 측정시간 · 조립순서 · 턴수 · 성공 여부)
- 카운터 3개: 총 시도수 / 성공수 / 최단기록
- 시작 버튼 (큰 초록 버튼)
- (옵션) "이력 보기" 링크 → TM-05

### 6.4 정지 버튼 동작 (상태 A → TM-04)

```ts
async function onStop() {
  const stoppedAtMs = Date.now();
  await db.attempts.update(currentAttemptUuid, {
    stopped_at_ms: stoppedAtMs,
    duration_ms: stoppedAtMs - currentAttempt.started_at_ms
  });
  syncQueue.enqueue({ type: 'update', uuid: currentAttemptUuid });
  navigate(`/team/input/${currentAttemptUuid}`);
}
```

핵심: 클릭 즉시 `Date.now()` 캡처, 어떤 await도 끼우지 않음. IndexedDB write는 빠르지만 그것조차 시각 캡처 뒤에 실행.

### 6.5 시작 버튼 동작 (상태 B → 상태 A)

```ts
async function onStart() {
  const startedAtMs = Date.now();
  const uuid = crypto.randomUUID();
  const nextAttemptNo = (await db.attempts
    .where({ team_id }).count()) + 1;
  const newAttempt = {
    client_uuid: uuid,
    team_id,
    attempt_no: nextAttemptNo,
    started_at_ms: startedAtMs,
    is_success: 0
  };
  await db.attempts.put(newAttempt);
  syncQueue.enqueue({ type: 'create', attempt: newAttempt });
  setCurrentAttemptUuid(uuid);
  setState('A');
}
```

### 6.6 카운트다운 계산

```ts
const intervalId = setInterval(() => {
  const remainingMs = round.started_at_ms
    + round.time_limit_seconds * 1000
    - Date.now();
  setRemainingMs(remainingMs);
  if (remainingMs <= 0 && state === 'A') {
    onStop();  // 자동 정지
    showForceModal();  // TM-04 강제 모달
  }
}, 500);
```

### 6.7 네트워크 상태 표시

| 상태 | 아이콘 | 색상 | 의미 |
|---|---|---|---|
| 온라인 + 큐 비어있음 | wifi | 초록 | 모든 데이터 서버 도달 완료 |
| 동기화 중 | cloud-upload | 회색 (애니메이션) | 큐에 N건, 전송 중 |
| 오프라인 | cloud-off | 주황 | 네트워크 끊김, 큐 N건 적재 |

큐 건수는 아이콘 옆에 작게 표시 (예: "큐 3건").

### 6.8 15분 만료 처리

- 카운트다운 0 도달 시 자동 `onStop()` 호출
- TM-04 강제 모달 (취소/뒤로가기 비활성, 저장만 가능)
- 저장 후 TM-06으로 강제 이동
- 상태 B에서 만료되면 즉시 TM-06으로 이동

---

## 7. 핵심 시나리오

### 7.1 시나리오 1 — 동기화 시작

전제: 관리자, 6팀(5팀 접속, 1팀 미접속), preparing 상태.

1. 관리자가 ADM-03에서 "전체 시작" 클릭
2. 모달: "6팀 중 1팀이 미접속 상태입니다. 진행하시겠습니까?"
3. 관리자 확인
4. `POST /api/rounds/12/start`
5. 서버 트랜잭션으로 status=active, started_at_ms=1715760000000 설정 + 6팀 각각에 attempt #1 INSERT
6. 200 응답, ADM-03이 active 모드로 전환
7. 접속 중인 5팀 단말은 5초 내 heartbeat 응답에서 round_status=active 확인 → TM-03 상태 A 진입
8. 미접속 1팀: 나중에 로그인 시 status=active 확인 → TM-03 상태 A 진입(이미 attempt #1 존재) + 안내 "이미 시작된 차수에 입장, 남은 시간 X분"

### 7.2 시나리오 2 — 시도 1회 사이클

3팀, attempt #1 진행 중, 1분 32초 경과.

1. 팀원이 컨베이어 벨트로 완성품 10개 조립 완료
2. 팀이 정지 버튼 클릭 → stopped_at_ms 캡처 (T0 + 92345ms) → IndexedDB 업데이트
3. TM-04로 자동 이동
4. 입력: 조립순서=빨/초/노/흰/파, T=2, 추가=3, 메모="첫 시도, 노란색에서 정체"
5. 저장 → IndexedDB 업데이트 → 백그라운드 `PUT /api/attempts/by-uuid/uuid-1`
6. TM-03 상태 B 진입, "직전 시도 #1" 카드 표시
7. (FT가 FT-04에서 성공 처리할 때까지 비공식 기록)

### 7.3 시나리오 3 — FT 성공 처리

3팀이 attempt #2를 51초에 완료, FT가 육안 확인.

1. FT가 FT-03에서 3팀 카드 클릭 → FT-04 진입
2. attempt #2의 "성공 처리" 버튼 클릭
3. 확인 모달
4. 확인 → `POST /api/attempts/45/success`
5. 서버: `UPDATE attempts SET is_success=1, success_marked_by=FT_id, success_marked_at_ms=now()`
6. ADM-03 다음 폴링(1.5초 이내) → 3팀 카드 갱신 (성공 1→2, 최단기록 갱신)
7. 리더보드 다음 폴링(1초 이내) → 3팀 순위 갱신

### 7.4 시나리오 4 — 네트워크 단절 복구

5팀 단말의 와이파이가 attempt #3 진행 중 끊김.

1. 화면 우상단: wifi(초록) → cloud-off(주황, "큐 0건")
2. 팀이 정지 → 정상 작동 (IndexedDB 적재) → "큐 1건"
3. TM-04 저장 → IndexedDB 업데이트 ("큐 1건" 유지, 같은 attempt)
4. TM-03 상태 B에서 시작 버튼 클릭 → IndexedDB에 attempt #4 생성, "큐 2건"
5. 와이파이 복구
6. 백그라운드 동기화: `PUT attempt #3` → 성공 → 큐 1건. `POST attempt #4` → 성공 → 큐 0건. cloud-upload→wifi 전환
7. 서버는 client_uuid 중복 시 멱등 처리

### 7.5 시나리오 5 — 15분 만료

5팀이 attempt #7 진행 중, 14분 58초 경과.

1. 클라이언트 카운트다운 00:02 → 00:01 → 00:00
2. 0 도달 시 자동 `onStop()` 호출 (stopped_at_ms = T0 + 900000ms)
3. TM-04 강제 모달 (취소/뒤로가기 비활성)
4. 사용자 저장 → TM-06으로 이동
5. 관리자 측: 클라이언트도 종료 API 호출 + 서버도 다음 호출 시 lazy 종료 처리 → status=ended
6. ADM-03이 ended 모드로 전환, 리더보드 결과 고정

---

## 8. 엣지 케이스

### 8.1 동시성 / 중복

- 같은 팀이 두 단말로 동시 로그인 — MVP에선 막지 않음 (마지막 로그인의 IndexedDB가 별도, 큐 중복 가능)
- FT가 같은 시도를 두 번 성공 처리 시도 — 두 번째는 멱등 (이미 success면 no-op)
- 관리자가 active 상태에서 시간 변경 시도 — 409 (preparing만 변경 가능)
- 두 팀이 동일 username으로 다른 차수에 존재 — 허용 (`UNIQUE(round_id, username)`)

### 8.2 시간 관련

- 시도가 1초 미만으로 끝남 (오타 클릭) — 정상 저장, FT/관리자가 무시 가능
- 클라이언트 시계가 서버보다 크게 어긋남 (몇 초 이상) — duration_ms는 클라이언트 차이값이므로 영향 없음. 단 카운트다운 표시는 약간 어긋날 수 있음 (사용자 경험만 영향)
- 차수 종료 직후 클라이언트가 진행 중인 attempt 저장 시도 — 서버 410 응답, 클라이언트는 큐에서 제거 + 안내

### 8.3 데이터 정합성

- 같은 client_uuid로 POST/PUT 중복 — POST는 200(기존 반환), PUT은 일반적 업데이트
- attempt_no가 비연속(예: 3 다음에 5) — 허용. 클라이언트 동기화 실패로 빈 번호 발생 가능, 분석에 영향 없음
- 성공 처리된 시도의 데이터를 사용자가 추후 수정 — MVP에선 시도 수정 API 미제공. 필요 시 추가

### 8.4 UI

- 사용자가 TM-03 상태 A에서 새로고침 — 진행 중 attempt를 IndexedDB에서 복원, 스톱워치 계속
- 사용자가 TM-04에서 새로고침 — 입력 중 데이터 손실 (MVP에선 폼 자동저장 미구현)
- 관리자 PC와 단말 간 시간 차이 — 서버 T0 기준이라 무관

---

## 9. 보안 및 운영 고려사항

### 9.1 비밀번호 정책

- 해싱: PBKDF2-SHA256, iterations 100000+, salt 16바이트, base64 인코딩 저장 형식 `pbkdf2$<iter>$<salt>$<hash>`
- 평문 비밀번호는 로그/응답에 절대 포함 금지
- 팀 비밀번호는 차수 운영 1회용이라 단순해도 됨 (예: 4자리 숫자, 일괄 생성 시 자동 부여)

### 9.2 JWT

- HS256, 비밀키는 Cloudflare Worker 환경 변수 (`JWT_SECRET`)
- 만료: 관리자 8시간, FT 8시간, 팀 4시간 (1회 세션 길이 고려)
- payload: `{ sub: user_id, role, round_id?, exp, iat }`
- 팀 토큰에는 `round_id` 포함 → 다른 차수 데이터 접근 차단

### 9.3 share_token

- 차수 생성 시 자동 발급, `crypto.randomBytes(32)` URL-safe base64
- 추측 불가, 재발급 API 제공 (필요 시 외부 공유 후 회수 가능)

### 9.4 Rate Limiting

- Cloudflare Worker Rate Limiting 사용
- 로그인 엔드포인트: IP별 5회/분
- 일반 API: 사용자별 100회/10초 (충분히 여유)
- attempt 저장: 팀별 제한 없음 (정상 동작)

### 9.5 CORS

- Pages + Workers를 같은 도메인에 묶음 → CORS 불필요
- 다른 도메인 사용 시 명시적 출처만 허용

### 9.6 로깅 / 감사

- 관리자 행위(차수 시작/종료, 계정 변경, 성공 취소)는 `audit_logs`에 기록 권장
- 에러 로그는 Cloudflare Workers 기본 로깅 사용 (Logpush 활용 가능)
- PII 거의 없음 (이름, username 정도) → 별도 처리 불필요

### 9.7 데이터 보존

- 1년 보관 정책
- 1년 경과 시 차수 단위로 일괄 삭제 또는 archive 테이블로 이동 (운영 정책에 따라)
- 삭제 시 외래키 cascade 또는 명시적 순서 (attempts → ft_notes → teams → rounds)

---

## 10. 개발 로드맵 (예상)

| Phase | 작업 | 예상 기간 |
|---|---|---|
| 1 | 인프라 셋업 (Cloudflare Pages/Workers/D1) + 레포 구조 + 인증 골격 | 2-3일 |
| 2 | ADM 차수/팀/계정 CRUD (ADM-02, 04, 05) | 2일 |
| 3 | ADM-03 + TM-03 핵심 동작 (동기화 시작 트랜잭션 포함) | 3-4일 |
| 4 | TM-01/02/04/05/06 완성, IndexedDB 오프라인 큐 | 2-3일 |
| 5 | FT-01~04 완성 (성공 처리, FT 메모) | 2일 |
| 6 | LB-02 리더보드 | 1일 |
| 7 | ADM-06 엑셀 내보내기, ADM-07 비교 리포트 | 2일 |
| 8 | 모바일 UX 다듬기, 테스트, 버그 수정 | 2-3일 |

총: **약 16-21일** (단일 풀스택 개발자 기준).

병렬 진행 시 프론트/백 분담으로 약 12-15일까지 단축 가능.

### 마일스톤별 검증 항목

- Phase 1 종료: 관리자 로그인 후 빈 차수 목록 조회 가능
- Phase 2 종료: 관리자가 차수 생성 + 팀 5개 생성 + FT 계정 생성 가능
- Phase 3 종료: 관리자 "전체 시작" 클릭 시 모든 팀이 동기화되어 스톱워치 작동, 정지 후 기본 데이터 저장
- Phase 4 종료: 와이파이 끊고 시도 3회 진행 후 복구 시 모두 동기화됨
- Phase 5 종료: FT가 성공 처리하면 ADM-03 카드와 리더보드 모두 갱신
- Phase 6 종료: 별도 브라우저에 리더보드 띄워서 시상식 시뮬레이션 가능
- Phase 7 종료: 차수 종료 후 엑셀 다운로드해서 모든 시도 데이터 확인 가능
- Phase 8 종료: 실제 5팀이 모바일로 한 차수 완주, 문제 없이 운영 가능
