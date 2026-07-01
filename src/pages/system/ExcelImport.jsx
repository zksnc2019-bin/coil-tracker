import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, ChevronDown } from 'lucide-react'

// ── 컬럼 매핑 정의 ──────────────────────────────────────────────
const MAPS = {
  workorder: {
    label: '작업내역',
    color: 'blue',
    columns: [
      { db: 'coil_no',      labels: ['소재번호','코일번호','코일no','소재no','coil_no'], required: true },
      { db: 'thickness',    labels: ['두께','두께(mm)','thickness'], type: 'float' },
      { db: 'width',        labels: ['폭','폭(mm)','width'], type: 'float' },
      { db: 'coil_weight',  labels: ['원코일중량','원중량','원코일','coil_weight'], type: 'float' },
      { db: 'work_weight',  labels: ['작업중량','슬릿중량','작업무게','work_weight'], required: true, type: 'float' },
      { db: 'work_date',    labels: ['작업일자','작업일','작업날짜','work_date'], type: 'date' },
      { db: 'material',     labels: ['재질','material','규격'] },
      { db: 'work_spec',    labels: ['작업규격','규격명','work_spec'] },
      { db: '_vendor_name', labels: ['업체명','거래처','업체','vendor'] },
      { db: 'memo',         labels: ['비고','메모','memo'] },
    ],
  },
  delivery: {
    label: '출고내역',
    color: 'purple',
    columns: [
      { db: 'packing_no',      labels: ['패킹번호','포장번호','packing_no'], required: true },
      { db: 'coil_no',         labels: ['소재번호','코일번호','coil_no'], required: true },
      { db: 'delivery_date',   labels: ['출고일자','출고일','출고날짜','delivery_date'], type: 'date' },
      { db: 'delivery_weight', labels: ['출고중량','출고무게','delivery_weight'], required: true, type: 'float' },
      { db: 'delivery_qty',    labels: ['출고수량','수량','qty','delivery_qty'], type: 'int' },
      { db: '_site_name',      labels: ['현장명','납품처','현장','site'] },
      { db: 'vehicle_no',      labels: ['차량번호','차번','vehicle_no'] },
      { db: 'driver_name',     labels: ['기사명','운전자','driver_name'] },
      { db: 'driver_phone',    labels: ['기사연락처','연락처','driver_phone'] },
      { db: 'carrier_name',    labels: ['운반사','운송사','carrier_name'] },
      { db: 'memo',            labels: ['비고','메모','memo'] },
    ],
  },
  purchase: {
    label: '매입내역',
    color: 'green',
    columns: [
      { db: 'coil_no',        labels: ['소재번호','코일번호','coil_no'], required: true },
      { db: 'purchase_date',  labels: ['매입일자','세금계산서일자','매입일','purchase_date'], type: 'date' },
      { db: '_vendor_name',   labels: ['업체명','거래처','업체','vendor'] },
      { db: 'unit_price',     labels: ['단가','unit_price'], type: 'float' },
      { db: 'supply_amount',  labels: ['공급가액','공급액','supply_amount'], required: true, type: 'float' },
      { db: 'tax_amount',     labels: ['세액','tax_amount'], type: 'float' },
      { db: 'total_amount',   labels: ['합계금액','합계','total_amount'], required: true, type: 'float' },
      { db: 'tax_invoice_no', labels: ['세금계산서번호','계산서번호','tax_invoice_no'] },
      { db: 'memo',           labels: ['비고','메모','memo'] },
    ],
  },
}

// 값 변환
function castValue(raw, type) {
  if (raw === undefined || raw === null || raw === '') return null
  const str = String(raw).trim()
  if (!str) return null
  if (type === 'float') {
    const n = parseFloat(str.replace(/,/g, ''))
    return isNaN(n) ? null : n
  }
  if (type === 'int') {
    const n = parseInt(str.replace(/,/g, ''), 10)
    return isNaN(n) ? null : n
  }
  if (type === 'date') {
    // Excel serial number
    if (!isNaN(str)) {
      const d = XLSX.SSF.parse_date_code(Number(str))
      if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
    }
    // 이미 날짜 문자열
    const m = str.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
    if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
    return str
  }
  return str
}

// 헤더 → DB 컬럼 매핑
function mapHeaders(headers, columns) {
  const result = {}
  headers.forEach((h, i) => {
    if (!h) return
    const norm = String(h).trim().toLowerCase().replace(/\s+/g,'')
    for (const col of columns) {
      if (col.labels.some(l => l.toLowerCase().replace(/\s+/g,'') === norm)) {
        result[col.db] = i
        break
      }
    }
  })
  return result
}

// 행 → 객체 변환
function rowToObj(row, headerMap, columns) {
  const obj = {}
  for (const col of columns) {
    const idx = headerMap[col.db]
    if (idx === undefined) continue
    obj[col.db] = castValue(row[idx], col.type)
  }
  return obj
}

// 색상 맵
const COLOR = {
  blue:   { bg: 'bg-blue-600',   light: 'bg-blue-50',   border: 'border-blue-200', text: 'text-blue-700',  tab: 'bg-blue-600 text-white' },
  purple: { bg: 'bg-purple-600', light: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', tab: 'bg-purple-600 text-white' },
  green:  { bg: 'bg-emerald-600',light: 'bg-emerald-50',border: 'border-emerald-200', text: 'text-emerald-700', tab: 'bg-emerald-600 text-white' },
}

export default function ExcelImport() {
  const [tab, setTab] = useState('workorder')
  const [rows, setRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [headerMap, setHeaderMap] = useState({})
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState(null)   // { ok, skip, errors }
  const [loading, setLoading] = useState(false)
  const fileRef = useRef()

  const cfg = MAPS[tab]
  const c = COLOR[cfg.color]

  function reset() {
    setRows([]); setHeaders([]); setHeaderMap({}); setFileName(''); setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function onTabChange(t) {
    setTab(t); reset()
  }

  function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setResult(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      if (!data || data.length < 2) { toast.error('데이터가 없습니다.'); return }
      const hdrs = data[0].map(h => String(h ?? ''))
      const body = data.slice(1).filter(r => r.some(c => c !== '' && c !== null))
      const hmap = mapHeaders(hdrs, cfg.columns)
      setHeaders(hdrs); setRows(body); setHeaderMap(hmap)
    }
    reader.readAsArrayBuffer(file)
  }

  // 매핑 안 된 필수 컬럼 확인
  const missingRequired = cfg.columns
    .filter(col => col.required && headerMap[col.db] === undefined)
    .map(col => col.labels[0])

  async function doImport() {
    if (missingRequired.length > 0) {
      toast.error(`필수 컬럼 없음: ${missingRequired.join(', ')}`)
      return
    }
    setLoading(true)
    setResult(null)
    let ok = 0, skip = 0, errors = []

    try {
      // 업체/현장 캐시 로드
      const vendorCache = {}, siteCache = {}
      if (cfg.columns.some(c => c.db === '_vendor_name')) {
        const { data: vs } = await supabase.from('vendors').select('id, name')
        vs?.forEach(v => { vendorCache[v.name.trim()] = v.id })
      }
      if (cfg.columns.some(c => c.db === '_site_name')) {
        const { data: ss } = await supabase.from('sites').select('id, name')
        ss?.forEach(s => { siteCache[s.name.trim()] = s.id })
      }

      for (let i = 0; i < rows.length; i++) {
        const obj = rowToObj(rows[i], headerMap, cfg.columns)

        // 업체명 → vendor_id 변환
        if (obj._vendor_name !== undefined) {
          const vid = vendorCache[obj._vendor_name?.trim()]
          obj.vendor_id = vid ?? null
          delete obj._vendor_name
        }
        // 현장명 → site_id 변환
        if (obj._site_name !== undefined) {
          const sid = siteCache[obj._site_name?.trim()]
          obj.site_id = sid ?? null
          delete obj._site_name
        }

        // 테이블별 삽입
        let err = null
        if (tab === 'workorder') {
          if (!obj.coil_no || !obj.work_weight) { skip++; continue }
          obj.coil_no = obj.coil_no.trim().toUpperCase()
          if (!obj.work_date) obj.work_date = new Date().toISOString().slice(0,10)
          const { error } = await supabase.from('work_orders').upsert(obj, { onConflict: 'coil_no' })
          if (!error) {
            await supabase.from('inventories').upsert(
              { coil_no: obj.coil_no, current_weight: obj.work_weight },
              { onConflict: 'coil_no' }
            )
          }
          err = error
        } else if (tab === 'delivery') {
          if (!obj.packing_no || !obj.coil_no || !obj.delivery_weight) { skip++; continue }
          obj.coil_no = obj.coil_no.trim().toUpperCase()
          if (!obj.delivery_date) obj.delivery_date = new Date().toISOString().slice(0,10)
          if (!obj.site_id) { skip++; errors.push(`행 ${i+2}: 현장명을 찾을 수 없음`); continue }
          const { error } = await supabase.from('deliveries').upsert(obj, { onConflict: 'packing_no' })
          err = error
        } else if (tab === 'purchase') {
          if (!obj.coil_no || !obj.supply_amount || !obj.total_amount) { skip++; continue }
          obj.coil_no = obj.coil_no.trim().toUpperCase()
          if (!obj.purchase_date) obj.purchase_date = new Date().toISOString().slice(0,10)
          if (!obj.vendor_id) { skip++; errors.push(`행 ${i+2}: 업체명을 찾을 수 없음`); continue }
          // 중복 체크 (tax_invoice_no 기준)
          if (obj.tax_invoice_no) {
            const { data: ex } = await supabase.from('purchases')
              .select('id').eq('tax_invoice_no', obj.tax_invoice_no).single()
            if (ex) { skip++; continue }
          }
          const { error } = await supabase.from('purchases').insert(obj)
          err = error
        }

        if (err) {
          errors.push(`행 ${i+2}: ${err.message}`)
        } else {
          ok++
        }
      }
    } catch (e) {
      toast.error('업로드 중 오류: ' + e.message)
    }

    setLoading(false)
    setResult({ ok, skip, errors })
    if (ok > 0) toast.success(`${ok}건 업로드 완료`)
  }

  const mappedCount = Object.keys(headerMap).filter(k => !k.startsWith('_')).length +
    Object.keys(headerMap).filter(k => k.startsWith('_')).length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* 타이틀 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FileSpreadsheet className="w-7 h-7 text-blue-600" />
          엑셀 일괄 업로드
        </h1>
        <p className="text-gray-500 text-sm mt-1">월말 엑셀 파일을 DB에 자동으로 등록합니다. 중복 소재번호는 자동 갱신됩니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-6">
        {Object.entries(MAPS).map(([key, val]) => {
          const cc = COLOR[val.color]
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                active ? cc.tab : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {val.label}
            </button>
          )
        })}
      </div>

      {/* 업로드 영역 */}
      <div className={`border-2 border-dashed rounded-xl p-8 text-center mb-6 ${c.border} ${c.light}`}>
        <Upload className={`w-10 h-10 mx-auto mb-3 ${c.text}`} />
        <p className="font-semibold text-gray-700 mb-1">{cfg.label} 엑셀 파일 선택</p>
        <p className="text-xs text-gray-400 mb-4">.xlsx / .xls 형식 · 첫 행이 헤더여야 합니다</p>
        <label className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-white cursor-pointer text-sm font-medium ${c.bg}`}>
          <Upload className="w-4 h-4" />
          파일 선택
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />
        </label>
        {fileName && <p className="mt-3 text-sm text-gray-600">📄 {fileName}</p>}
      </div>

      {/* 컬럼 매핑 현황 */}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <ChevronDown className="w-4 h-4" /> 컬럼 매핑 현황 ({rows.length}행 인식)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {cfg.columns.map(col => {
              const mapped = headerMap[col.db] !== undefined
              const excelHeader = mapped ? headers[headerMap[col.db]] : null
              return (
                <div key={col.db} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
                  mapped ? 'bg-green-50 border-green-200' : col.required ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                }`}>
                  {mapped
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    : col.required
                      ? <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      : <AlertTriangle className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  }
                  <span className="font-medium text-gray-700">{col.labels[0]}</span>
                  {mapped && <span className="text-gray-400">← {excelHeader}</span>}
                </div>
              )
            })}
          </div>
          {missingRequired.length > 0 && (
            <p className="mt-3 text-xs text-red-600 font-medium">
              ⚠️ 필수 컬럼 누락: {missingRequired.join(', ')} — 엑셀 헤더명을 확인해주세요.
            </p>
          )}
        </div>
      )}

      {/* 미리보기 */}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-semibold text-gray-700 text-sm">미리보기 (최대 5행)</span>
            <span className="text-xs text-gray-400">총 {rows.length}행</span>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead className="bg-gray-50">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap border-b border-gray-100">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, ri) => (
                  <tr key={ri} className="border-b border-gray-50 hover:bg-gray-50">
                    {headers.map((_, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-gray-600 whitespace-nowrap">
                        {String(row[ci] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 업로드 버튼 */}
      {rows.length > 0 && !result && (
        <div className="flex gap-3">
          <button
            onClick={doImport}
            disabled={loading || missingRequired.length > 0}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-semibold ${
              loading || missingRequired.length > 0
                ? 'bg-gray-300 cursor-not-allowed'
                : c.bg + ' hover:opacity-90'
            }`}
          >
            {loading
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />처리 중...</>
              : <><Upload className="w-4 h-4" />{rows.length}건 DB 업로드</>
            }
          </button>
          <button onClick={reset} className="px-5 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
            취소
          </button>
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-700 mb-4">업로드 결과</h2>
          <div className="flex gap-4 mb-4">
            <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <CheckCircle className="w-6 h-6 text-green-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-green-700">{result.ok}</p>
              <p className="text-xs text-green-600">성공</p>
            </div>
            <div className="flex-1 bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
              <AlertTriangle className="w-6 h-6 text-yellow-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-yellow-700">{result.skip}</p>
              <p className="text-xs text-yellow-600">스킵(중복/필수값 없음)</p>
            </div>
            <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <XCircle className="w-6 h-6 text-red-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-red-600">{result.errors.length}</p>
              <p className="text-xs text-red-500">오류</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-y-auto">
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">{e}</p>
              ))}
            </div>
          )}
          <button onClick={reset} className={`mt-4 px-5 py-2 rounded-lg text-white text-sm font-medium ${c.bg}`}>
            다시 업로드
          </button>
        </div>
      )}
    </div>
  )
}
