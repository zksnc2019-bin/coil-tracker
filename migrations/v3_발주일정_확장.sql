-- v3: 발주 일정 컬럼 확장 (상차예정일, 실제출고일)
-- 이미 적용된 경우 IF NOT EXISTS로 안전하게 처리
-- 실행 전 확인: SELECT column_name FROM information_schema.columns WHERE table_name='purchase_orders';

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS shipped_date DATE;

COMMENT ON COLUMN purchase_orders.expected_delivery_date IS '상차예정일';
COMMENT ON COLUMN purchase_orders.shipped_date IS '실제 출고일';
