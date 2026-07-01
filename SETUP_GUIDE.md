# coil-tracker 설치 및 배포 가이드

외주 판재(HGI Coil) 추적관리 시스템

---

## 1단계 — Supabase 프로젝트 생성

1. https://supabase.com 접속 → 로그인
2. **New Project** 클릭 → 프로젝트명 입력 (예: `coil-tracker`) → 비밀번호 설정 → 지역 선택 (Northeast Asia)
3. 프로젝트 생성 완료까지 약 1~2분 대기

### SQL 스키마 실행

4. 좌측 메뉴 → **SQL Editor** 클릭
5. `supabase_schema.sql` 파일 내용 전체 복사 → SQL Editor에 붙여넣기
6. **Run** (Ctrl+Enter) 클릭
7. 오류 없이 완료되면 좌측 **Table Editor**에서 8개 테이블 확인

### Supabase 키 복사

8. 좌측 메뉴 → **Project Settings** → **API**
9. 다음 두 값을 복사해 둠:
   - `Project URL` (예: `https://xxxxxx.supabase.co`)
   - `anon public` key

---

## 2단계 — 로컬 개발 환경 설정

### 필수 설치

- Node.js 18 이상: https://nodejs.org

### 환경변수 설정

프로젝트 폴더(`coil-tracker/`) 안에 `.env.local` 파일을 만들고 입력:

```
VITE_SUPABASE_URL=https://여기에프로젝트URL
VITE_SUPABASE_ANON_KEY=여기에anon키
```

### 패키지 설치 및 실행

```bash
cd coil-tracker
npm install
npm run dev
```

브라우저에서 http://localhost:5173 접속

---

## 3단계 — GitHub 저장소 생성 및 배포

### 저장소 생성

1. https://github.com 접속 → **New repository**
2. 저장소명: `coil-tracker` (vite.config.js의 base와 동일해야 함)
3. Public 선택 → **Create repository**

### 코드 업로드

```bash
cd coil-tracker
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/[내GitHub아이디]/coil-tracker.git
git push -u origin main
```

### GitHub Secrets 설정 (보안 키 등록)

4. GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions**
5. **New repository secret** 클릭 후 다음 두 개 등록:
   - Name: `VITE_SUPABASE_URL` / Secret: Supabase Project URL
   - Name: `VITE_SUPABASE_ANON_KEY` / Secret: Supabase anon key

### GitHub Pages 활성화

6. 저장소 → **Settings** → **Pages**
7. **Source**: `GitHub Actions` 선택 → 저장

### 배포 실행

8. 저장소 → **Actions** 탭 → `Deploy to GitHub Pages` 워크플로우 확인
9. push 할 때마다 자동 빌드/배포됨
10. 배포 완료 후 접속 URL: `https://[내GitHub아이디].github.io/coil-tracker/`

---

## 4단계 — 초기 데이터 입력 순서

시스템 사용 전 마스터 데이터를 먼저 입력합니다.

1. **업체관리** → 외주 가공 업체 등록 (예: (주)한국강판)
2. **현장관리** → 납품 현장 등록 (예: 서울 강남 현장)
3. **발주관리** → 발주 등록 (PO-YYYYMM-NNN 자동 채번)
4. **작업내역** → 코일별 작업 내역 등록 (소재번호 필수, 재고 자동 생성)
5. **출고관리** → 현장 출고 등록 (재고 자동 차감)
6. **매입관리** → 세금계산서 기준 매입 등록 (지급예정월 자동 설정)
7. **지급관리** → 월별 지급 처리

---

## 화면 구성

| 메뉴 | 경로 | 설명 |
|------|------|------|
| 대표 Dashboard | `/dashboard/ceo` | 전체 KPI 요약 |
| 재무 Dashboard | `/dashboard/finance` | 매입·지급 분석 |
| 관리자 Dashboard | `/dashboard/manager` | 재고·출고·발주 운영 |
| 발주관리 | `/po` | 발주 CRUD, PO-YYYYMM-NNN |
| 작업내역 | `/workorder` | 코일별 작업 등록, 재고 자동 생성 |
| 출고관리 | `/delivery` | 현장 출고, PK-YYYYMM-NNN |
| 재고현황 | `/inventory` | 소재번호별 잔량 (자동 계산) |
| 매입관리 | `/purchase` | 세금계산서, 지급예정월 자동 |
| 지급관리 | `/payment` | 월별 지급 완료 처리 |
| 소재 추적 | `/trace` | 소재번호 → 전체 이력 조회 |
| 업체관리 | `/vendors` | 외주업체 마스터 |
| 현장관리 | `/sites` | 납품현장 마스터 |
| 감사 로그 | `/audit` | 데이터 변경 이력 |

---

## 주의사항

- `.env.local`은 절대 GitHub에 커밋하지 마세요 (`.gitignore`에 포함됨)
- Supabase anon key는 공개되어도 무방하나 RLS 정책이 올바르게 설정되어야 합니다
- `vite.config.js`의 `base: '/coil-tracker/'`는 GitHub 저장소명과 일치해야 합니다
