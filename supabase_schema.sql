-- ============================================================
-- coil-tracker Supabase Schema v2
-- 외주 판재(HGI Coil) 추적관리 시스템
-- Supabase SQL Editor에 전체를 붙여넣고 실행하세요.
-- ============================================================

-- 기존 테이블 정리 (vendors/sites는 유지)
DROP TABLE IF EXISTS audit_logs    CASCADE;
DROP TABLE IF EXISTS purchases     CASCADE;
DROP TABLE IF EXISTS inventories   CASCADE;
DROP TABLE IF EXISTS deliveries    CASCADE;
DROP TABLE IF EXISTS work_orders   CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;

-- ============================================================
-- 1. 발주 (purchase_orders)
-- ============================================================
CREATE TABLE purchase_orders (
  id                      BIGSERIAL PRIMARY KEY,
  po_number               TEXT NOT NULL UNIQUE,           -- PO-YYYYMM-NNN (자동 채번)
  po_date                 DATE NOT NULL DEFAULT CURRENT_DATE,
  site_id                 BIGINT REFERENCES sites(id),   -- 납품현장
  vendor_id               BIGINT NOT NULL REFERENCES vendors(id),
  due_date                DATE NOT NULL,                  -- 납기일
  expected_delivery_date  DATE,                           -- 출고예정일
  item_name               TEXT,                           -- 품목명
  quantity                INTEGER,                        -- 수량(매)
  area                    NUMERIC(12,2),                  -- 면적(㎡)
  order_weight            NUMERIC(12,3),                  -- 발주 중량(kg)
  unit_price_est          NUMERIC(12,2),                  -- 예상단가(원/kg)
  status                  TEXT NOT NULL DEFAULT '발주중'
                          CHECK (status IN ('발주중','작업중','출고중','완료','취소')),
  memo                    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. 작업내역 (work_orders) — coil_no 가 핵심 키
-- ============================================================
CREATE TABLE work_orders (
  id            BIGSERIAL PRIMARY KEY,
  coil_no       TEXT NOT NULL UNIQUE,             -- 소재번호 (핵심 키)
  po_id         BIGINT REFERENCES purchase_orders(id),
  vendor_id     BIGINT REFERENCES vendors(id),
  material      TEXT DEFAULT 'SGHC',              -- 재질
  thickness     NUMERIC(6,3),                     -- 두께(mm)
  width         NUMERIC(8,2),                     -- 폭(mm)
  coil_weight   NUMERIC(12,3),                   -- 원코일 중량(kg)
  work_spec     TEXT,                             -- 작업규격
  work_weight   NUMERIC(12,3) NOT NULL,           -- 작업(슬릿) 중량(kg)
  work_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  memo          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. 출고 (deliveries)
-- ============================================================
CREATE TABLE deliveries (
  id              BIGSERIAL PRIMARY KEY,
  packing_no      TEXT NOT NULL UNIQUE,           -- PK-YYYYMM-NNN
  coil_no         TEXT NOT NULL REFERENCES work_orders(coil_no),
  site_id         BIGINT NOT NULL REFERENCES sites(id),
  delivery_date   DATE NOT NULL,
  delivery_weight NUMERIC(12,3) NOT NULL,         -- 출고 중량(kg)
  delivery_qty    INTEGER DEFAULT 1,              -- 출고 수량(매)
  carrier_name    TEXT,
  vehicle_no      TEXT,
  driver_name     TEXT,
  driver_phone    TEXT,
  memo            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. 재고 (inventories) — work_orders INSERT 시 자동 생성
-- ============================================================
CREATE TABLE inventories (
  id              BIGSERIAL PRIMARY KEY,
  coil_no         TEXT NOT NULL UNIQUE REFERENCES work_orders(coil_no),
  work_order_id   BIGINT REFERENCES work_orders(id),
  current_weight  NUMERIC(12,3) NOT NULL DEFAULT 0,
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. 매입 (purchases) — 세금계산서 기준
-- ============================================================
CREATE TABLE purchases (
  id                BIGSERIAL PRIMARY KEY,
  coil_no           TEXT NOT NULL REFERENCES work_orders(coil_no),
  vendor_id         BIGINT NOT NULL REFERENCES vendors(id),
  purchase_date     DATE NOT NULL,
  unit_price        NUMERIC(12,2),
  supply_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(14,2) NOT NULL,
  tax_invoice_no    TEXT,
  payment_due_month TEXT NOT NULL,               -- YYYY-MM (매입월 익월 자동)
  is_paid           BOOLEAN NOT NULL DEFAULT FALSE,
  paid_date         DATE,
  memo              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. 감사 로그 (audit_logs)
-- ============================================================
CREATE TABLE audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  table_name      TEXT NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  record_id       TEXT,
  coil_no         TEXT,
  user_id         UUID,
  user_email      TEXT,
  changed_fields  JSONB,
  old_values      JSONB,
  new_values      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 인덱스
-- ============================================================
CREATE INDEX idx_po_vendor          ON purchase_orders(vendor_id);
CREATE INDEX idx_po_site            ON purchase_orders(site_id);
CREATE INDEX idx_po_status          ON purchase_orders(status);
CREATE INDEX idx_wo_coil_no         ON work_orders(coil_no);
CREATE INDEX idx_wo_po_id           ON work_orders(po_id);
CREATE INDEX idx_wo_vendor          ON work_orders(vendor_id);
CREATE INDEX idx_del_coil_no        ON deliveries(coil_no);
CREATE INDEX idx_del_site           ON deliveries(site_id);
CREATE INDEX idx_del_date           ON deliveries(delivery_date);
CREATE INDEX idx_inv_coil_no        ON inventories(coil_no);
CREATE INDEX idx_pur_coil_no        ON purchases(coil_no);
CREATE INDEX idx_pur_due_month      ON purchases(payment_due_month);
CREATE INDEX idx_pur_is_paid        ON purchases(is_paid);
CREATE INDEX idx_audit_table        ON audit_logs(table_name);
CREATE INDEX idx_audit_coil_no      ON audit_logs(coil_no);
CREATE INDEX idx_audit_created      ON audit_logs(created_at DESC);

-- ============================================================
-- updated_at 자동 갱신 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_po_updated_at ON purchase_orders;
DROP TRIGGER IF EXISTS trg_wo_updated_at ON work_orders;
DROP TRIGGER IF EXISTS trg_purchases_updated_at ON purchases;

CREATE TRIGGER trg_po_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_wo_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_purchases_updated_at
  BEFORE UPDATE ON purchases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 재고 자동 생성 트리거 (work_orders INSERT 시)
-- ============================================================
CREATE OR REPLACE FUNCTION create_inventory_on_work_order()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inventories (coil_no, work_order_id, current_weight, last_updated)
  VALUES (NEW.coil_no, NEW.id, NEW.work_weight, NOW())
  ON CONFLICT (coil_no) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_inventory ON work_orders;
CREATE TRIGGER trg_auto_inventory
  AFTER INSERT ON work_orders
  FOR EACH ROW EXECUTE FUNCTION create_inventory_on_work_order();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE purchase_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON purchase_orders;
DROP POLICY IF EXISTS "auth_all" ON work_orders;
DROP POLICY IF EXISTS "auth_all" ON deliveries;
DROP POLICY IF EXISTS "auth_all" ON inventories;
DROP POLICY IF EXISTS "auth_all" ON purchases;
DROP POLICY IF EXISTS "auth_all" ON audit_logs;

CREATE POLICY "auth_all" ON purchase_orders  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_all" ON work_orders      FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_all" ON deliveries       FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_all" ON inventories      FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_all" ON purchases        FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_all" ON audit_logs       FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
