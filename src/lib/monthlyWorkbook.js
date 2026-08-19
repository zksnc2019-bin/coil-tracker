import * as XLSX from 'xlsx'

// 지급내역 제거 — 5종만 유지
export const FILE_TYPES = [
  { key: 'purchase',  label: '매입내역', color: 'blue'   },
  { key: 'work',      label: '작업내역', color: 'green'  },
  { key: 'delivery',  label: '출고내역', color: 'yellow' },
  { key: 'inventory', label: '재고현황', color: 'orange' },
  { key: 'sales',     label: '매출내역', color: 'red'    },
]

const FIELD_ALIASES = {
  date:        ['일자','날짜','작업일','작업일자','출고일','출고일자','매입일','매입일자','기준일'],
  vendor:      ['업체','업체명','거래처','거래처명','매입처','공급업체'],
  site:        ['현장','현장명','납품현장','프로젝트','프로젝트명'],
  poNumber:    ['발주번호','PO번호','PO NO','PO_NO'],
  coilNo:      ['코일번호','코일NO','COIL NO','COIL_NO','소재번호'],
  item:        ['품목','품목명','제품','제품명','모델NO','모델'],
  material:    ['재질','소재','강종'],
  thickness:   ['두께','두께(mm)','T'],
  width:       ['폭','폭(mm)','WIDTH'],
  length:      ['길이','길이(mm)','규격(길이)','LENGTH'],
  qty:         ['수량','매수','생산수량','출고수량'],
  area:        ['면적','면적(㎡)','M2','㎡'],
  weight:      ['중량','중량(kg)','작업중량','출고중량','매입중량','재고중량','사용중량'],
  unitPrice:   ['단가','단가(원/kg)','매입단가','KG단가'],
  amount:      ['금액','공급가액','매입금액','재고금액','매출액','출고금액'],
  tax:         ['부가세','세액','VAT'],
  totalAmount: ['합계금액','총금액','부가세포함'],
  vehicleNo:   ['차량번호','차량','차번'],
}

const cleanKey = v => String(v ?? '').replace(/\s+/g, '').toUpperCase()

function pick(row, aliases) {
  const entries = Object.entries(row || {})
  for (const alias of aliases) {
    const target = cleanKey(alias)
    const found = entries.find(([key]) => cleanKey(key) === target)
    if (found && found[1] !== '' && found[1] != null) return found[1]
  }
  return null
}

export function toNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function toDate(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10)
  const text = String(value).trim().replace(/[./]/g, '-')
  const match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!match) return null
  return `${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`
}

function findMasterId(name, rows, nameKey) {
  if (!name) return null
  const target = cleanKey(name)
  return rows.find(r => cleanKey(r[nameKey]) === target)?.id ?? null
}

export function normalizeRow(row, fileType, masters = {}) {
  const vendorName = pick(row, FIELD_ALIASES.vendor)
  const siteName   = pick(row, FIELD_ALIASES.site)
  const poNumber   = pick(row, FIELD_ALIASES.poNumber)
  const coilNo     = pick(row, FIELD_ALIASES.coilNo)

  // entity_aliases 포함 연결
  const aliasedVendorId = masters.vendorAliases
    ? (masters.vendorAliases.find(a => cleanKey(a.alias_name) === cleanKey(vendorName))?.canonical_id ?? null)
    : null
  const aliasedSiteId = masters.siteAliases
    ? (masters.siteAliases.find(a => cleanKey(a.alias_name) === cleanKey(siteName))?.canonical_id ?? null)
    : null

  const vendorId = findMasterId(vendorName, masters.vendors || [], 'vendor_name') ?? aliasedVendorId
  const siteId   = findMasterId(siteName,   masters.sites   || [], 'site_name')   ?? aliasedSiteId
  const poId     = (masters.orders || []).find(po => cleanKey(po.po_number) === cleanKey(poNumber))?.id ?? null

  const problems = []
  if (fileType === 'purchase' && vendorName && !vendorId) problems.push('업체 미연결')
  if (['work','delivery','sales'].includes(fileType) && siteName && !siteId) problems.push('현장 미연결')
  if (['work','delivery'].includes(fileType) && !coilNo) problems.push('코일번호 없음')

  const dateVal = toDate(pick(row, FIELD_ALIASES.date))
  if (!dateVal) problems.push('날짜 형식 오류')
  const weightVal = toNumber(pick(row, FIELD_ALIASES.weight))
  const amountVal = toNumber(pick(row, FIELD_ALIASES.amount))

  return {
    std_date:         dateVal,
    std_vendor_name:  vendorName ? String(vendorName) : null,
    std_vendor_id:    vendorId,
    std_site_name:    siteName   ? String(siteName)   : null,
    std_site_id:      siteId,
    std_po_number:    poNumber   ? String(poNumber)   : null,
    std_po_id:        poId,
    std_coil_no:      coilNo     ? String(coilNo)     : null,
    std_material:     pick(row, FIELD_ALIASES.material),
    std_thickness:    toNumber(pick(row, FIELD_ALIASES.thickness)),
    std_width:        toNumber(pick(row, FIELD_ALIASES.width)),
    std_qty:          toNumber(pick(row, FIELD_ALIASES.qty)),
    std_area:         toNumber(pick(row, FIELD_ALIASES.area)),
    std_weight:       weightVal,
    std_unit_price:   toNumber(pick(row, FIELD_ALIASES.unitPrice)),
    std_amount:       amountVal,
    std_tax_amount:   toNumber(pick(row, FIELD_ALIASES.tax)),
    std_total_amount: toNumber(pick(row, FIELD_ALIASES.totalAmount)),
    std_extra: {
      item_name:  pick(row, FIELD_ALIASES.item),
      length_mm:  toNumber(pick(row, FIELD_ALIASES.length)),
      vehicle_no: pick(row, FIELD_ALIASES.vehicleNo),
    },
    link_vendor_ok: Boolean(vendorId),
    link_site_ok:   Boolean(siteId),
    link_po_ok:     Boolean(poId),
    link_coil_ok:   Boolean(coilNo),
    link_status:    problems.length ? '확인필요' : '정상',
    error_detail:   problems.length ? problems.join(', ') : null,
  }
}

export function getPeriodMonths(baseMonth, period) {
  const [year, month] = baseMonth.split('-').map(Number)
  if (period === 'month') return [baseMonth]
  let start = 1, count = 12
  if (period === 'quarter') { start = Math.floor((month-1)/3)*3+1; count = 3 }
  else if (period === 'half') { start = month <= 6 ? 1 : 7; count = 6 }
  return Array.from({ length: count }, (_, i) => `${year}-${String(start+i).padStart(2,'0')}`)
}

// ──────────────────────────────────────────────
// 현장별 매입배분 계산 (중량비례)
// ──────────────────────────────────────────────
export function calcSiteAllocation(rows) {
  const purchaseRows  = rows.filter(r => r.file_type === 'purchase' && !r.is_excluded)
  const workRows      = rows.filter(r => r.file_type === 'work'     && !r.is_excluded)
  const deliveryRows  = rows.filter(r => r.file_type === 'delivery' && !r.is_excluded)
  const salesRows     = rows.filter(r => r.file_type === 'sales'    && !r.is_excluded)

  // 코일별 매입금액 집계
  const coilPurchase = new Map()
  purchaseRows.forEach(r => {
    const key = r.std_coil_no || `__vendor_${r.std_vendor_id}_${r.std_date}`
    const prev = coilPurchase.get(key) || { amount: 0, weight: 0, vendorName: r.std_vendor_name }
    prev.amount += Number(r.std_amount || r.std_total_amount || 0)
    prev.weight += Number(r.std_weight || 0)
    coilPurchase.set(key, prev)
  })

  // 코일별 현장 사용중량 집계
  const coilSiteWeight = new Map()
  workRows.forEach(r => {
    const key = r.std_coil_no || ''
    if (!key) return
    const siteKey = r.std_site_name || '미지정'
    const mapKey = `${key}::${siteKey}`
    coilSiteWeight.set(mapKey, (coilSiteWeight.get(mapKey) || 0) + Number(r.std_weight || 0))
  })

  // 코일 전체 사용중량
  const coilTotalWeight = new Map()
  workRows.forEach(r => {
    const key = r.std_coil_no || ''
    if (!key) return
    coilTotalWeight.set(key, (coilTotalWeight.get(key) || 0) + Number(r.std_weight || 0))
  })

  // 현장별 집계
  const siteMap = new Map()
  const ensureSite = name => {
    if (!siteMap.has(name)) siteMap.set(name, {
      site: name, workWeight: 0, deliveryWeight: 0,
      purchaseAlloc: 0, salesAmount: 0,
      allocDetails: [], checkCount: 0,
    })
    return siteMap.get(name)
  }

  workRows.forEach(r => {
    const site = ensureSite(r.std_site_name || '미지정')
    site.workWeight += Number(r.std_weight || 0)
    if (r.link_status === '확인필요') site.checkCount++
  })
  deliveryRows.forEach(r => {
    const site = ensureSite(r.std_site_name || '미지정')
    site.deliveryWeight += Number(r.std_weight || 0)
  })
  salesRows.forEach(r => {
    const site = ensureSite(r.std_site_name || '미지정')
    site.salesAmount += Number(r.std_amount || r.std_total_amount || 0)
  })

  // 매입배분
  coilSiteWeight.forEach((siteWeight, mapKey) => {
    const [coilNo, siteName] = mapKey.split('::')
    const totalWeight = coilTotalWeight.get(coilNo) || 0
    const purchase    = coilPurchase.get(coilNo)
    if (!purchase || totalWeight === 0) return
    const ratio  = siteWeight / totalWeight
    const alloc  = purchase.amount * ratio
    const site   = ensureSite(siteName)
    site.purchaseAlloc += alloc
    site.allocDetails.push({
      coilNo, vendorName: purchase.vendorName,
      totalPurchaseAmt: purchase.amount, totalWeight,
      siteWeight, ratio, allocAmt: alloc,
    })
  })

  return [...siteMap.values()].sort((a, b) => b.salesAmount - a.salesAmount)
}

// ──────────────────────────────────────────────
// 12시트 통합 엑셀 다운로드
// ──────────────────────────────────────────────
function appendSheet(wb, name, data) {
  const safe = data.length ? data : [{ 안내: '해당 자료가 없습니다.' }]
  const ws = XLSX.utils.json_to_sheet(safe)
  ws['!autofilter'] = { ref: ws['!ref'] }
  ws['!cols'] = Object.keys(safe[0]).map(k => ({ wch: Math.min(36, Math.max(10, k.length+4)) }))
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0,31))
}

export function exportFullWorkbook(rows, vendorPayments, siteData, closing, label) {
  const wb = XLSX.utils.book_new()
  const fmt = n => Number(n||0).toLocaleString('ko-KR')

  // 1. 대표요약
  appendSheet(wb, '01_대표요약', [{
    기준연월: closing?.base_month || label,
    전체매입금액: fmt(closing?.purchase_amount),
    이번지급요청총액: fmt(closing?.payment_requested),
    지급후미지급금: fmt((closing?.purchase_amount||0)-(closing?.payment_requested||0)),
    현장별매입배분합계: fmt(siteData.reduce((s,r)=>s+r.purchaseAlloc,0)),
    현장별매출액합계: fmt(siteData.reduce((s,r)=>s+r.salesAmount,0)),
    확인필요건수: rows.filter(r=>r.link_status==='확인필요').length,
    보고상태: closing?.report_status || '작성중',
    특이사항: closing?.memo || '',
  }])

  // 2. 현장별보고
  appendSheet(wb, '02_현장별보고', siteData.map(s=>({
    현장: s.site,
    작업사용중량: s.workWeight.toFixed(2),
    출고중량: s.deliveryWeight.toFixed(2),
    매입배분액: Math.round(s.purchaseAlloc),
    매출액: Math.round(s.salesAmount),
    참고차액: Math.round(s.salesAmount - s.purchaseAlloc),
    확인필요: s.checkCount,
  })))

  // 3. 현장별상세
  appendSheet(wb, '03_현장별상세', rows.filter(r=>!r.is_excluded).map(r=>({
    현장: r.std_site_name || '미지정',
    자료구분: FILE_TYPES.find(t=>t.key===r.file_type)?.label||r.file_type,
    일자: r.std_date,
    코일번호: r.std_coil_no,
    재질: r.std_material,
    두께: r.std_thickness,
    폭: r.std_width,
    중량: r.std_weight,
    금액: r.std_amount,
    원본파일: r.source_file,
    원본시트: r.source_sheet,
    원본행: r.source_row,
  })))

  // 4. 거래처별지급요청
  appendSheet(wb, '04_거래처별지급요청', vendorPayments.map(p=>({
    매입거래처: p.vendor_name,
    관련현장: p.related_sites,
    매입금액: p.purchase_amount,
    이전지급액: p.prev_payment ?? '미입력',
    이번지급액: p.this_payment,
    지급후미지급금: p.unpaid_after ?? '미확정',
    지급예정일: p.payment_date,
    특이사항: p.remarks,
  })))

  // 5. 통합ROW_DATA
  appendSheet(wb, '05_통합ROW_DATA', rows.map(r=>({
    기준월: r.base_month,
    자료구분: FILE_TYPES.find(t=>t.key===r.file_type)?.label||r.file_type,
    일자: r.std_date, 업체: r.std_vendor_name, 현장: r.std_site_name,
    코일번호: r.std_coil_no, 재질: r.std_material, 두께: r.std_thickness,
    폭: r.std_width, 중량: r.std_weight, 금액: r.std_amount, 총금액: r.std_total_amount,
    연결상태: r.link_status, 오류: r.error_detail,
    원본파일: r.source_file, 원본시트: r.source_sheet, 원본행: r.source_row,
  })))

  // 6~10. 파일별 원본
  const typeOrder = ['purchase','work','delivery','inventory','sales']
  const typeLabels = ['매입원본','작업원본','출고원본','재고원본','매출원본']
  typeOrder.forEach((key, i) => {
    appendSheet(wb, `${String(i+6).padStart(2,'0')}_${typeLabels[i]}`,
      rows.filter(r=>r.file_type===key).map(r=>({
        원본파일: r.source_file, 원본시트: r.source_sheet, 원본행: r.source_row,
        ...r.raw_data,
      }))
    )
  })

  // 11. 검증오류
  appendSheet(wb, '11_검증오류', rows.filter(r=>r.link_status==='확인필요').map(r=>({
    자료구분: FILE_TYPES.find(t=>t.key===r.file_type)?.label||r.file_type,
    일자: r.std_date, 업체: r.std_vendor_name, 현장: r.std_site_name,
    오류내용: r.error_detail,
    원본파일: r.source_file, 원본시트: r.source_sheet, 원본행: r.source_row,
  })))

  // 12. 수정이력
  appendSheet(wb, '12_수정이력', rows.filter(r=>r.corrected_at).map(r=>({
    자료구분: FILE_TYPES.find(t=>t.key===r.file_type)?.label||r.file_type,
    원본파일: r.source_file, 원본행: r.source_row,
    수정자: r.corrected_by, 수정일시: r.corrected_at,
    수정메모: r.correction_memo,
    수정전값: JSON.stringify(r.raw_data),
    수정후값: JSON.stringify(r.corrected_data),
  })))

  XLSX.writeFile(wb, `자강_월말보고_${label}.xlsx`)
}

// 하위 호환 유지
export function exportRowsWorkbook(rows, label) {
  exportFullWorkbook(rows, [], [], null, label)
}
