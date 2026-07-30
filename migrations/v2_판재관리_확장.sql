-- ============================================================
-- MES-Lite v2 마이그레이션: 자강에스앤씨 판재·원자재 관리 확장
-- 적용: Supabase SQL Editor 전체 붙여넣기 후 Run
-- 작성일: 2026-07-31
-- ============================================================

-- ============================================================
-- 1. 테스트 데이터 초기화 (FK 역순)
-- ============================================================
-- work_orders가 purchase_orders를 참조하지만 이미 0건이므로 안전
DELETE FROM purchase_orders;
ALTER SEQUENCE purchase_orders_id_seq RESTART WITH 1;
DELETE FROM vendors;
ALTER SEQUENCE vendors_id_seq RESTART WITH 1;
DELETE FROM sites;
ALTER SEQUENCE sites_id_seq RESTART WITH 1;

-- ============================================================
-- 2. purchase_orders 스키마 확장
-- ============================================================

-- 기존 상태 CHECK 제거 (5개 → 7개로 교체)
ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

-- 신규 컬럼 추가
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS po_purpose     TEXT,           -- 발주목적 (신규/추가/교체)
  ADD COLUMN IF NOT EXISTS delivery_place TEXT,           -- 납품장소
  ADD COLUMN IF NOT EXISTS manager_name   TEXT,           -- 담당자명
  ADD COLUMN IF NOT EXISTS manager_phone  TEXT,           -- 담당자연락처
  ADD COLUMN IF NOT EXISTS payment_terms  TEXT DEFAULT '익월말';  -- 결제조건

-- 상태 기본값 변경
ALTER TABLE purchase_orders
  ALTER COLUMN status SET DEFAULT '발주완료';

-- 신규 CHECK (7개 상태)
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status = ANY (ARRAY[
    '임시저장','발주완료','입고예정','일부입고','입고완료','납기지연','취소'
  ]));

-- ============================================================
-- 3. 신규 테이블 생성
-- ============================================================

-- ① 발주품목 (1 발주 : N 품목)
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id             BIGSERIAL PRIMARY KEY,
  po_id          BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_seq       INT NOT NULL DEFAULT 1,        -- 품목 순번
  item_name      TEXT,                          -- 품목명
  material       VARCHAR(50),                   -- 재질 (SGHC, GI 등)
  thickness      NUMERIC(6,2),                  -- 두께 (mm)
  width          NUMERIC(8,2),                  -- 폭 (mm)
  length_mm      NUMERIC(10,2),                 -- 길이 (mm)
  est_qty        INT,                           -- 예상수량
  est_area       NUMERIC(12,4),                 -- 예상면적 (㎡) 자동계산
  est_weight     NUMERIC(12,3),                 -- 예상중량 (kg) 자동계산
  unit_price_est NUMERIC(12,2),                 -- 예상단가 (원/kg)
  est_amount     NUMERIC(15,2),                 -- 예상매입금액 자동계산
  site_id        BIGINT REFERENCES sites(id),   -- 적용현장
  memo           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(po_id, item_seq)
);

-- ② 분할입고 계획
CREATE TABLE IF NOT EXISTS purchase_delivery_plans (
  id             BIGSERIAL PRIMARY KEY,
  po_id          BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  po_item_id     BIGINT REFERENCES purchase_order_items(id),
  plan_seq       INT NOT NULL DEFAULT 1,        -- 입고 차수
  planned_date   DATE,                          -- 입고예정일
  expected_month CHAR(7),                       -- 예상 매입월 (YYYY-MM)
  plan_qty       INT,
  plan_weight    NUMERIC(12,3),
  unit_price_est NUMERIC(12,2),
  est_amount     NUMERIC(15,2),
  actual_date    DATE,                          -- 실제 입고일
  actual_weight  NUMERIC(12,3),
  actual_amount  NUMERIC(15,2),
  status         VARCHAR(20) DEFAULT '입고예정',  -- 입고예정/입고완료/취소
  memo           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ③ 실제 입고·매입 연결
CREATE TABLE IF NOT EXISTS purchase_receipts (
  id                BIGSERIAL PRIMARY KEY,
  po_id             BIGINT REFERENCES purchase_orders(id),
  po_item_id        BIGINT REFERENCES purchase_order_items(id),
  plan_id           BIGINT REFERENCES purchase_delivery_plans(id),
  import_row_id     BIGINT,                     -- monthly_import_rows.id
  coil_no           VARCHAR(100),
  actual_date       DATE,
  actual_weight     NUMERIC(12,3),
  actual_unit_price NUMERIC(12,2),
  actual_amount     NUMERIC(15,2),
  link_type         VARCHAR(20) DEFAULT '자동',  -- 자동/수동
  link_reason       TEXT,
  linked_by         TEXT,
  linked_at         TIMESTAMPTZ DEFAULT NOW(),
  source_file       TEXT,
  source_sheet      TEXT,
  source_row        INT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ④ 월 마감 (monthly_import_batches.closing_id 참조 대상이므로 먼저 생성)
CREATE TABLE IF NOT EXISTS monthly_closings (
  id               BIGSERIAL PRIMARY KEY,
  base_month       CHAR(7) NOT NULL UNIQUE,     -- 기준연월 YYYY-MM
  status           VARCHAR(20) DEFAULT '검토중', -- 업로드중/검토중/마감확정/수정중/재마감확정
  total_rows       INT DEFAULT 0,
  ok_rows          INT DEFAULT 0,
  error_rows       INT DEFAULT 0,
  skip_rows        INT DEFAULT 0,
  unlinked_rows    INT DEFAULT 0,
  est_amount       NUMERIC(15,2),
  actual_amount    NUMERIC(15,2),
  payment_amount   NUMERIC(15,2),
  inventory_amount NUMERIC(15,2),
  confirmed_at     TIMESTAMPTZ,
  confirmed_by     TEXT,
  version          INT DEFAULT 1,
  memo             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ⑤ 월별 파일 업로드 묶음
CREATE TABLE IF NOT EXISTS monthly_import_batches (
  id            BIGSERIAL PRIMARY KEY,
  base_month    CHAR(7) NOT NULL,              -- 기준연월 YYYY-MM
  file_type     VARCHAR(30) NOT NULL,          -- work/delivery/purchase/payment/inventory/sales
  file_name     TEXT NOT NULL,
  sheet_name    TEXT,
  total_rows    INT DEFAULT 0,
  ok_rows       INT DEFAULT 0,
  error_rows    INT DEFAULT 0,
  skip_rows     INT DEFAULT 0,
  unlinked_rows INT DEFAULT 0,
  status        VARCHAR(20) DEFAULT '업로드중', -- 업로드중/검토중/마감확정
  uploaded_by   TEXT,
  uploaded_at   TIMESTAMPTZ DEFAULT NOW(),
  closing_id    BIGINT REFERENCES monthly_closings(id),  -- 확정 후 연결
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ⑥ ROW DATA (원본 행 1:1 보존)
CREATE TABLE IF NOT EXISTS monthly_import_rows (
  id               BIGSERIAL PRIMARY KEY,
  batch_id         BIGINT NOT NULL REFERENCES monthly_import_batches(id) ON DELETE CASCADE,
  base_month       CHAR(7) NOT NULL,
  file_type        VARCHAR(30) NOT NULL,
  source_file      TEXT,
  source_sheet     TEXT,
  source_row       INT,
  raw_data         JSONB,                      -- 원본 행 전체 보존
  std_date         DATE,
  std_vendor_name  TEXT,
  std_vendor_id    BIGINT REFERENCES vendors(id),
  std_site_name    TEXT,
  std_site_id      BIGINT REFERENCES sites(id),
  std_po_number    TEXT,
  std_po_id        BIGINT REFERENCES purchase_orders(id),
  std_coil_no      TEXT,
  std_material     VARCHAR(50),
  std_thickness    NUMERIC(6,2),
  std_width        NUMERIC(8,2),
  std_qty          INT,
  std_area         NUMERIC(12,4),
  std_weight       NUMERIC(12,3),
  std_unit_price   NUMERIC(12,2),
  std_amount       NUMERIC(15,2),
  std_tax_amount   NUMERIC(15,2),
  std_total_amount NUMERIC(15,2),
  std_extra        JSONB,
  link_status      VARCHAR(20) DEFAULT '미확인', -- 정상/확인필요/오류/미연결
  link_vendor_ok   BOOLEAN DEFAULT FALSE,
  link_site_ok     BOOLEAN DEFAULT FALSE,
  link_po_ok       BOOLEAN DEFAULT FALSE,
  link_coil_ok     BOOLEAN DEFAULT FALSE,
  error_detail     TEXT,
  is_confirmed     BOOLEAN DEFAULT FALSE,
  confirmed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ⑦ 마감 수정이력
CREATE TABLE IF NOT EXISTS monthly_closing_revisions (
  id              BIGSERIAL PRIMARY KEY,
  closing_id      BIGINT NOT NULL REFERENCES monthly_closings(id),
  base_month      CHAR(7) NOT NULL,
  version_from    INT,
  version_to      INT,
  revision_reason TEXT NOT NULL,
  target_desc     TEXT,
  changed_by      TEXT NOT NULL,
  changed_at      TIMESTAMPTZ DEFAULT NOW(),
  changes         JSONB
);

-- ⑧ 업체명·현장명 별칭 (엑셀 표기 통일)
CREATE TABLE IF NOT EXISTS entity_aliases (
  id             BIGSERIAL PRIMARY KEY,
  entity_type    VARCHAR(20) NOT NULL,          -- vendor / site
  alias_name     TEXT NOT NULL,                 -- 엑셀 표기
  canonical_id   BIGINT NOT NULL,               -- vendors.id 또는 sites.id
  canonical_name TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_type, alias_name)
);

-- ============================================================
-- 4. 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_poi_po_id    ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_pdp_po_id    ON purchase_delivery_plans(po_id);
CREATE INDEX IF NOT EXISTS idx_pdp_month    ON purchase_delivery_plans(expected_month);
CREATE INDEX IF NOT EXISTS idx_pr_po_id     ON purchase_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_mib_month    ON monthly_import_batches(base_month);
CREATE INDEX IF NOT EXISTS idx_mir_batch_id ON monthly_import_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_mir_month    ON monthly_import_rows(base_month);
CREATE INDEX IF NOT EXISTS idx_mir_link     ON monthly_import_rows(link_status);
CREATE INDEX IF NOT EXISTS idx_mc_month     ON monthly_closings(base_month);
CREATE INDEX IF NOT EXISTS idx_ea_type      ON entity_aliases(entity_type, alias_name);

-- ============================================================
-- 5. RLS 활성화
-- ============================================================
ALTER TABLE purchase_order_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_delivery_plans   ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_receipts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_import_batches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_import_rows       ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_closings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_closing_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_aliases            ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. RLS 정책 (CREATE POLICY IF NOT EXISTS 사용 금지 → DO 블록)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='purchase_order_items' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON purchase_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='purchase_delivery_plans' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON purchase_delivery_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='purchase_receipts' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON purchase_receipts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='monthly_import_batches' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON monthly_import_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='monthly_import_rows' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON monthly_import_rows FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='monthly_closings' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON monthly_closings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='monthly_closing_revisions' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON monthly_closing_revisions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='entity_aliases' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON entity_aliases FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 7. updated_at 트리거 (update_updated_at 함수 사용)
-- ============================================================
CREATE OR REPLACE TRIGGER trg_poi_updated_at
  BEFORE UPDATE ON purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_pdp_updated_at
  BEFORE UPDATE ON purchase_delivery_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_mc_updated_at
  BEFORE UPDATE ON monthly_closings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 8. 초기 거래처·현장 시드 데이터
-- ============================================================
INSERT INTO vendors (vendor_code, vendor_name, contact_name, contact_phone, payment_terms, is_active)
VALUES
  ('V001', '동국제강(주)',    '영업팀',  '02-3450-0000', '익월말', true),
  ('V002', '포스코스틸리온', '영업팀',  '054-220-0000', '익월말', true),
  ('V003', '자강에스앤씨',   '구매팀',  '010-0000-0000', '현금',  true);

INSERT INTO sites (site_code, site_name, client_name, is_active)
VALUES
  ('S001', '광주 본현장',  '자강에스앤씨', true),
  ('S002', '전남 2현장',   '자강에스앤씨', true),
  ('S003', '경기 3현장',   '자강에스앤씨', true);

-- ============================================================
-- 9. 검증 쿼리
-- ============================================================
SELECT table_name,
       (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS col_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'purchase_orders','purchase_order_items','purchase_delivery_plans',
    'purchase_receipts','monthly_import_batches','monthly_import_rows',
    'monthly_closings','monthly_closing_revisions','entity_aliases',
    'vendors','sites'
  )
ORDER BY table_name;
