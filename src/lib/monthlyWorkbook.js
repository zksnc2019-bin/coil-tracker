import * as XLSX from 'xlsx'

export const FILE_TYPES = [
  { key: 'purchase', label: '매입내역' },
  { key: 'work', label: '작업내역' },
  { key: 'delivery', label: '출고내역' },
  { key: 'payment', label: '지급내역' },
  { key: 'inventory', label: '재고현황' },
  { key: 'sales', label: '매출내역' },
]

const FIELD_ALIASES = {
  date: ['일자', '날짜', '작업일', '작업일자', '출고일', '출고일자', '매입일', '매입일자', '지급일', '지급일자', '기준일'],
  vendor: ['업체', '업체명', '거래처', '거래처명', '매입처', '공급업체'],
  site: ['현장', '현장명', '납품현장', '프로젝트', '프로젝트명', '비고'],
  poNumber: ['발주번호', 'PO번호', 'PO NO', 'PO_NO'],
  coilNo: ['코일번호', '코일NO', 'COIL NO', 'COIL_NO', '소재번호'],
  item: ['품목', '품목명', '제품', '제품명', '모델NO', '모델'],
  material: ['재질', '소재', '강종'],
  thickness: ['두께', '두께(mm)', 'T'],
  width: ['폭', '폭(mm)', 'WIDTH'],
  length: ['길이', '길이(mm)', '규격(길이)', 'LENGTH'],
  qty: ['수량', '매수', '생산수량', '출고수량'],
  area: ['면적', '면적(㎡)', 'M2', '㎡'],
  weight: ['중량', '중량(kg)', '작업중량', '출고중량', '매입중량', '재고중량'],
  unitPrice: ['단가', '단가(원/kg)', '매입단가', 'KG단가'],
  amount: ['금액', '공급가액', '매입금액', '지급액', '재고금액', '매출액'],
  tax: ['부가세', '세액', 'VAT'],
  totalAmount: ['합계금액', '총금액', '부가세포함', '지급합계'],
  vehicleNo: ['차량번호', '차량', '차번'],
}

const cleanKey = value => String(value ?? '').replace(/\s+/g, '').toUpperCase()

function pick(row, aliases) {
  const entries = Object.entries(row || {})
  for (const alias of aliases) {
    const target = cleanKey(alias)
    const found = entries.find(([key]) => cleanKey(key) === target)
    if (found && found[1] !== '' && found[1] != null) return found[1]
  }
  return null
}

function toNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const text = String(value).trim().replace(/[.\/]/g, '-')
  const match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!match) return null
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
}

function findMasterId(name, rows, nameKey) {
  if (!name) return null
  const target = cleanKey(name)
  return rows.find(row => cleanKey(row[nameKey]) === target)?.id ?? null
}

export function normalizeRow(row, fileType, masters = {}) {
  const vendorName = pick(row, FIELD_ALIASES.vendor)
  const siteName = pick(row, FIELD_ALIASES.site)
  const poNumber = pick(row, FIELD_ALIASES.poNumber)
  const coilNo = pick(row, FIELD_ALIASES.coilNo)
  const vendorId = findMasterId(vendorName, masters.vendors || [], 'vendor_name')
  const siteId = findMasterId(siteName, masters.sites || [], 'site_name')
  const poId = (masters.orders || []).find(po => cleanKey(po.po_number) === cleanKey(poNumber))?.id ?? null

  const requiredProblems = []
  if (['purchase', 'payment'].includes(fileType) && vendorName && !vendorId) requiredProblems.push('업체 미연결')
  if (fileType === 'delivery' && siteName && !siteId) requiredProblems.push('현장 미연결')
  if (poNumber && !poId) requiredProblems.push('발주 미연결')

  return {
    std_date: toDate(pick(row, FIELD_ALIASES.date)),
    std_vendor_name: vendorName ? String(vendorName) : null,
    std_vendor_id: vendorId,
    std_site_name: siteName ? String(siteName) : null,
    std_site_id: siteId,
    std_po_number: poNumber ? String(poNumber) : null,
    std_po_id: poId,
    std_coil_no: coilNo ? String(coilNo) : null,
    std_material: pick(row, FIELD_ALIASES.material),
    std_thickness: toNumber(pick(row, FIELD_ALIASES.thickness)),
    std_width: toNumber(pick(row, FIELD_ALIASES.width)),
    std_qty: toNumber(pick(row, FIELD_ALIASES.qty)),
    std_area: toNumber(pick(row, FIELD_ALIASES.area)),
    std_weight: toNumber(pick(row, FIELD_ALIASES.weight)),
    std_unit_price: toNumber(pick(row, FIELD_ALIASES.unitPrice)),
    std_amount: toNumber(pick(row, FIELD_ALIASES.amount)),
    std_tax_amount: toNumber(pick(row, FIELD_ALIASES.tax)),
    std_total_amount: toNumber(pick(row, FIELD_ALIASES.totalAmount)),
    std_extra: {
      item_name: pick(row, FIELD_ALIASES.item),
      length_mm: toNumber(pick(row, FIELD_ALIASES.length)),
      vehicle_no: pick(row, FIELD_ALIASES.vehicleNo),
    },
    link_vendor_ok: Boolean(vendorId),
    link_site_ok: Boolean(siteId),
    link_po_ok: Boolean(poId),
    link_coil_ok: Boolean(coilNo),
    link_status: requiredProblems.length ? '확인필요' : '정상',
    error_detail: requiredProblems.length ? requiredProblems.join(', ') : null,
  }
}

export function getPeriodMonths(baseMonth, period) {
  const [year, month] = baseMonth.split('-').map(Number)
  if (period === 'month') return [baseMonth]
  let start = 1
  let count = 12
  if (period === 'quarter') {
    start = Math.floor((month - 1) / 3) * 3 + 1
    count = 3
  } else if (period === 'half') {
    start = month <= 6 ? 1 : 7
    count = 6
  }
  return Array.from({ length: count }, (_, index) => `${year}-${String(start + index).padStart(2, '0')}`)
}

const sumBy = (rows, keyFn) => {
  const result = new Map()
  rows.forEach(row => {
    const key = keyFn(row) || '미지정'
    const current = result.get(key) || { 구분: key, 건수: 0, 중량: 0, 금액: 0 }
    current.건수 += 1
    current.중량 += Number(row.std_weight || 0)
    current.금액 += Number(row.std_total_amount || row.std_amount || 0)
    result.set(key, current)
  })
  return [...result.values()]
}

function appendSheet(workbook, name, data) {
  const safeData = data.length ? data : [{ 안내: '해당 자료가 없습니다.' }]
  const sheet = XLSX.utils.json_to_sheet(safeData)
  sheet['!autofilter'] = { ref: sheet['!ref'] }
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 }
  sheet['!cols'] = Object.keys(safeData[0]).map(key => ({
    wch: Math.min(36, Math.max(12, key.length + 4)),
  }))
  XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31))
}

export function exportRowsWorkbook(rows, label) {
  const workbook = XLSX.utils.book_new()
  const integrated = rows.map(row => ({
    기준월: row.base_month,
    자료구분: FILE_TYPES.find(type => type.key === row.file_type)?.label || row.file_type,
    일자: row.std_date,
    업체: row.std_vendor_name,
    현장: row.std_site_name,
    발주번호: row.std_po_number,
    품목: row.std_extra?.item_name,
    재질: row.std_material,
    두께: row.std_thickness,
    폭: row.std_width,
    길이: row.std_extra?.length_mm,
    수량: row.std_qty,
    면적: row.std_area,
    중량: row.std_weight,
    단가: row.std_unit_price,
    금액: row.std_amount,
    부가세: row.std_tax_amount,
    총금액: row.std_total_amount,
    코일번호: row.std_coil_no,
    차량번호: row.std_extra?.vehicle_no,
    연결상태: row.link_status,
    오류내용: row.error_detail,
    원본파일: row.source_file,
    원본시트: row.source_sheet,
    원본행: row.source_row,
  }))

  appendSheet(workbook, '01_통합ROW_DATA', integrated)
  FILE_TYPES.forEach((type, index) => {
    const rawRows = rows
      .filter(row => row.file_type === type.key)
      .map(row => ({
        기준월: row.base_month,
        원본파일: row.source_file,
        원본시트: row.source_sheet,
        원본행: row.source_row,
        ...row.raw_data,
      }))
    appendSheet(workbook, `${String(index + 2).padStart(2, '0')}_${type.label.replace('내역', '원본')}`, rawRows)
  })
  appendSheet(workbook, '08_현장별원가', sumBy(rows.filter(row => row.file_type === 'purchase'), row => row.std_site_name))
  appendSheet(workbook, '09_업체별매입지급', sumBy(rows.filter(row => ['purchase', 'payment'].includes(row.file_type)), row => row.std_vendor_name))
  appendSheet(workbook, '10_검증오류', integrated.filter(row => row.연결상태 !== '정상'))
  appendSheet(workbook, '11_요약분석', FILE_TYPES.map(type => {
    const typed = rows.filter(row => row.file_type === type.key)
    return {
      자료구분: type.label,
      건수: typed.length,
      중량: typed.reduce((sum, row) => sum + Number(row.std_weight || 0), 0),
      금액: typed.reduce((sum, row) => sum + Number(row.std_total_amount || row.std_amount || 0), 0),
    }
  }))

  XLSX.writeFile(workbook, `자강_원자재관리_${label}.xlsx`)
}
