-- v4_monthly_close_enhancement.sql
-- 적용일: 2026-08-19  (이미 Supabase에 적용 완료)

-- monthly_import_rows 컬럼 추가
ALTER TABLE monthly_import_rows
  ADD COLUMN IF NOT EXISTS corrected_data jsonb,
  ADD COLUMN IF NOT EXISTS corrected_by text,
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_excluded boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclude_reason text,
  ADD COLUMN IF NOT EXISTS correction_memo text;

-- monthly_closings 컬럼 추가
ALTER TABLE monthly_closings
  ADD COLUMN IF NOT EXISTS report_status varchar(20) DEFAULT '작성중',
  ADD COLUMN IF NOT EXISTS sales_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_requested numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS reported_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by text;

-- monthly_vendor_payments 신규 테이블
CREATE TABLE IF NOT EXISTS monthly_vendor_payments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  base_month char(7) NOT NULL,
  closing_id bigint REFERENCES monthly_closings(id),
  vendor_id bigint REFERENCES vendors(id),
  vendor_name text NOT NULL,
  related_sites text,
  purchase_amount numeric DEFAULT 0,
  prev_payment numeric,
  this_payment numeric DEFAULT 0,
  payment_date date,
  unpaid_after numeric GENERATED ALWAYS AS (
    CASE WHEN prev_payment IS NOT NULL
      THEN purchase_amount - prev_payment - this_payment
      ELSE NULL END
  ) STORED,
  remarks text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE monthly_vendor_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS auth_all ON monthly_vendor_payments
  FOR ALL USING (auth.role() = 'authenticated');

-- monthly_import_batches: sheets_count 추가
ALTER TABLE monthly_import_batches
  ADD COLUMN IF NOT EXISTS sheets_count integer DEFAULT 1;
