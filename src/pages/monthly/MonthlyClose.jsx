import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  Upload, CheckCircle, AlertCircle, FileText, ChevronRight,
  Download, Save, RefreshCw, X, Edit2, Check,
  ChevronDown, ChevronUp, ArrowRight,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  FILE_TYPES, normalizeRow, calcSiteAllocation, exportFullWorkbook,
} from '../../lib/monthlyWorkbook'

// ─────────── 상수 ─────────────────────────────
const TABS = [
  { key: 'upload', label: '① 파일업로드' },
  { key: 'fix',    label: '② 오류수정'   },
  { key: 'site',   label: '③ 현장별보고'  },
  { key: 'payout', label: '④ 지출보고·다운로드' },
]
const REPORT_STATUS_COLORS = {
  '작성중':  'bg-gray-100 text-gray-700',
  '보고완료': 'bg-blue-100 text-blue-700',
  '확인완료': 'bg-green-100 text-green-700',
}
const TODAY_MONTH = new Date().toISOString().slice(0, 7)

// ─────────── 유틸 ─────────────────────────────
const fmtNum = n => Number(n||0).toLocaleString('ko-KR')
const cls    = (...cs) => cs.filter(Boolean).join(' ')

async function fetchMasters() {
  const [
    { data: vendors = [] },
    { data: sites   = [] },
    { data: orders  = [] },
    { data: vendorAliases = [] },
    { data: siteAliases   = [] },
  ] = await Promise.all([
    supabase.from('vendors').select('id, vendor_name'),
    supabase.from('sites').select('id, site_name'),
    supabase.from('purchase_orders').select('id, po_number'),
    supabase.from('entity_aliases').select('id, alias_name, canonical_id, entity_type').eq('entity_type','vendor'),
    supabase.from('entity_aliases').select('id, alias_name, canonical_id, entity_type').eq('entity_type','site'),
  ])
  return { vendors, sites, orders, vendorAliases, siteAliases }
}

async function readXlsxFile(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb  = XLSX.read(e.target.result, { type:'binary', cellDates:true })
        res(wb.SheetNames.map(name => ({
          sheet: name,
          rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { defval:'' }),
        })))
      } catch(err) { rej(err) }
    }
    reader.onerror = rej
    reader.readAsBinaryString(file)
  })
}

// ─────────── 공통 Sub-components ──────────────
function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

function Badge({ status }) {
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${REPORT_STATUS_COLORS[status] || REPORT_STATUS_COLORS['작성중']}`}>
      {status || '작성중'}
    </span>
  )
}

function Toast({ msg, onClose }) {
  if (!msg) return null
  return (
    <div className="fixed top-4 right-4 z-50 bg-white border border-blue-300 shadow-lg rounded-lg px-4 py-2 text-sm font-semibold text-blue-700 flex items-center gap-2">
      {msg}
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5"/></button>
    </div>
  )
}

// ─────────── 탭1: 파일업로드 ──────────────────
function TabUpload({ baseMonth, batches, onUploaded }) {
  const [uploading, setUploading] = useState(null)
  const [msg, setMsg] = useState('')

  const batchMap = {}
  ;(batches||[]).forEach(b => { batchMap[b.file_type] = b })

  const handleFile = async (fileTypeKey, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(fileTypeKey)
    setMsg('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const masters = await fetchMasters()
      const sheets  = await readXlsxFile(file)

      // 같은 월+타입 기존 배치 삭제 후 재삽입
      const { data: existing } = await supabase
        .from('monthly_import_batches').select('id')
        .eq('base_month', baseMonth).eq('file_type', fileTypeKey).maybeSingle()
      if (existing) {
        await supabase.from('monthly_import_rows').delete().eq('batch_id', existing.id)
        await supabase.from('monthly_import_batches').delete().eq('id', existing.id)
      }

      const { data: batch, error: bErr } = await supabase
        .from('monthly_import_batches')
        .insert({ base_month: baseMonth, file_type: fileTypeKey, file_name: file.name,
          sheets_count: sheets.length, uploaded_by: user?.email, status: 'done' })
        .select('id').single()
      if (bErr) throw bErr

      const toInsert = []
      sheets.forEach(({ sheet, rows }) => {
        rows.forEach((raw, idx) => {
          const norm = normalizeRow(raw, fileTypeKey, masters)
          toInsert.push({ batch_id: batch.id, base_month: baseMonth, file_type: fileTypeKey,
            source_file: file.name, source_sheet: sheet, source_row: idx + 2, raw_data: raw, ...norm })
        })
      })

      const CHUNK = 200
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const { error } = await supabase.from('monthly_import_rows').insert(toInsert.slice(i, i+CHUNK))
        if (error) throw error
      }

      const label = FILE_TYPES.find(f=>f.key===fileTypeKey)?.label || fileTypeKey
      const errCnt = toInsert.filter(r=>r.link_status==='확인필요').length
      setMsg(`✅ ${label} 업로드 완료 (${toInsert.length}건, 확인필요: ${errCnt}건)`)
      onUploaded()
    } catch(err) {
      setMsg(`❌ 업로드 실패: ${err.message}`)
    } finally {
      setUploading(null)
      e.target.value = ''
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-base font-bold text-[#15385f]">파일 업로드 — {baseMonth}</h2>
      {msg && (
        <div className="text-sm font-semibold bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-700">
          {msg}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FILE_TYPES.map(({ key, label }) => {
          const b   = batchMap[key]
          const isU = uploading === key
          return (
            <label key={key} className={cls(
              'flex flex-col gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all select-none',
              b ? 'border-green-400 bg-green-50'
                : 'border-dashed border-blue-300 bg-white hover:border-blue-500 hover:bg-blue-50'
            )}>
              <input type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => handleFile(key, e)} disabled={!!uploading} />
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#15385f]">{label}</span>
                {isU ? <Spinner/> : b
                  ? <CheckCircle className="w-4 h-4 text-green-500"/>
                  : <Upload className="w-4 h-4 text-blue-400"/>}
              </div>
              {b ? (
                <div className="text-xs text-green-700 space-y-0.5">
                  <div className="truncate font-medium">{b.file_name}</div>
                  <div>{new Date(b.created_at).toLocaleString('ko-KR')} · {b.row_count ?? '?'}행</div>
                </div>
              ) : (
                <span className="text-xs text-blue-400">클릭하여 엑셀 선택</span>
              )}
            </label>
          )
        })}
      </div>
      {batches?.length > 0 && (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          총 {batches.reduce((s,b)=>s+(b.row_count||0),0).toLocaleString()}행 업로드됨.
          확인 필요 항목은 <strong className="text-orange-600">② 오류수정</strong> 탭에서 처리하세요.
        </p>
      )}
    </div>
  )
}

// ─────────── 탭2: 오류수정 ───────────────────
const EDIT_FIELDS = [
  { key:'std_date',        label:'일자',     type:'date'   },
  { key:'std_vendor_name', label:'업체',     type:'text'   },
  { key:'std_site_name',   label:'현장',     type:'text'   },
  { key:'std_coil_no',     label:'코일번호', type:'text'   },
  { key:'std_weight',      label:'중량(kg)', type:'number' },
  { key:'std_amount',      label:'금액(원)', type:'number' },
]

function TabFix({ rows, masters, onFixed }) {
  const errorRows = (rows||[]).filter(r => r.link_status==='확인필요' && !r.is_excluded)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState({})
  const [saving, setSaving]     = useState(false)
  const [filterType, setFilter] = useState('all')
  const [toast, setToast]       = useState('')
  const [history, setHistory]   = useState([])

  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(''),3000) }

  const filtered = filterType === 'all' ? errorRows
    : errorRows.filter(r => r.file_type === filterType)

  const startEdit = row => {
    setEditing(row.id)
    const f = {}
    EDIT_FIELDS.forEach(({ key }) => { f[key] = row[key] ?? '' })
    f.correction_memo = row.correction_memo || ''
    setForm(f)
  }

  const saveRow = async rowId => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const original = rows.find(r => r.id === rowId)
      const norm     = normalizeRow({ ...original.raw_data, ...form }, original.file_type, masters)
      const update   = {
        ...Object.fromEntries(EDIT_FIELDS.map(f => [f.key, form[f.key]])),
        correction_memo: form.correction_memo || '',
        corrected_data:  form,
        corrected_by:    user?.email,
        corrected_at:    new Date().toISOString(),
        link_status:     norm.link_status,
        error_detail:    norm.error_detail,
        std_vendor_id:   norm.std_vendor_id,
        std_site_id:     norm.std_site_id,
      }
      const { error } = await supabase.from('monthly_import_rows').update(update).eq('id', rowId)
      if (error) throw error
      setHistory(prev => [{ rowId, before: original, after: update, at: new Date().toISOString() }, ...prev.slice(0,19)])
      setEditing(null)
      showToast('✅ 저장되었습니다.')
      onFixed()
    } catch(err) {
      showToast(`❌ ${err.message}`)
    } finally { setSaving(false) }
  }

  const excludeRow = async rowId => {
    setSaving(true)
    try {
      await supabase.from('monthly_import_rows')
        .update({ is_excluded: true, exclude_reason:'사용자 제외', corrected_at: new Date().toISOString() })
        .eq('id', rowId)
      showToast('제외 처리되었습니다.')
      onFixed()
    } finally { setSaving(false) }
  }

  const bulkApplySameName = async rowId => {
    const base = rows.find(r => r.id === rowId)
    if (!base || !form.std_vendor_name) return
    setSaving(true)
    try {
      const same = rows.filter(r =>
        r.id !== rowId && r.link_status === '확인필요' &&
        r.source_file === base.source_file && r.std_vendor_name === base.std_vendor_name
      )
      for (const row of same) {
        await supabase.from('monthly_import_rows').update({
          std_vendor_name: form.std_vendor_name,
          std_site_name:   form.std_site_name,
          corrected_at:    new Date().toISOString(),
        }).eq('id', row.id)
      }
      showToast(`${same.length}건 일괄 적용 완료`)
      onFixed()
    } finally { setSaving(false) }
  }

  if (errorRows.length === 0) return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-green-600 font-bold mb-2">
        <CheckCircle className="w-5 h-5"/> 확인 필요 항목이 없습니다.
      </div>
      <p className="text-sm text-gray-500">모든 행이 정상 연결되었습니다. ③ 현장별보고 탭으로 이동하세요.</p>
    </div>
  )

  return (
    <div className="p-6 space-y-4">
      <Toast msg={toast} onClose={()=>setToast('')}/>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-bold text-[#15385f]">
          오류수정 — <span className="text-orange-600">확인필요 {errorRows.length}건</span>
        </h2>
        <div className="flex gap-2">
          <select value={filterType} onChange={e=>setFilter(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1 text-[#15385f]">
            <option value="all">전체</option>
            {FILE_TYPES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button onClick={onFixed} className="flex items-center gap-1 text-xs bg-blue-50 border border-blue-200 rounded px-3 py-1 hover:bg-blue-100">
            <RefreshCw className="w-3 h-3"/> 새로고침
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-orange-200">
        <table className="w-full text-xs border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-orange-50 text-[#15385f] font-bold">
              <th className="px-3 py-2 text-left">구분</th>
              <th className="px-3 py-2 text-left">일자</th>
              <th className="px-3 py-2 text-left">업체</th>
              <th className="px-3 py-2 text-left">현장</th>
              <th className="px-3 py-2 text-left">코일번호</th>
              <th className="px-3 py-2 text-right">중량</th>
              <th className="px-3 py-2 text-left">오류내용</th>
              <th className="px-3 py-2 text-center w-32">작업</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => {
              const isEditing = editing === row.id
              return (
                <tr key={row.id} className={cls('border-t border-gray-100',
                  isEditing ? 'bg-yellow-50' : 'hover:bg-orange-50')}>
                  {isEditing ? (
                    <>
                      <td className="px-2 py-1 text-[#15385f] font-semibold whitespace-nowrap">
                        {FILE_TYPES.find(f=>f.key===row.file_type)?.label}
                      </td>
                      {EDIT_FIELDS.slice(0,5).map(f => (
                        <td key={f.key} className="px-1 py-1">
                          <input type={f.type} value={form[f.key]??''}
                            onChange={e => setForm(p=>({...p,[f.key]:e.target.value}))}
                            className="w-full border border-blue-300 rounded px-1.5 py-0.5 text-xs min-w-[80px]"/>
                        </td>
                      ))}
                      <td className="px-1 py-1">
                        <input value={form.correction_memo||''}
                          onChange={e=>setForm(p=>({...p,correction_memo:e.target.value}))}
                          placeholder="수정메모"
                          className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs min-w-[80px]"/>
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex flex-col gap-1 items-center min-w-[90px]">
                          <button onClick={()=>saveRow(row.id)} disabled={saving}
                            className="w-full text-xs bg-blue-600 text-white rounded px-2 py-0.5 hover:bg-blue-700 flex items-center justify-center gap-1">
                            {saving?<Spinner/>:<Check className="w-3 h-3"/>} 저장
                          </button>
                          <button onClick={()=>bulkApplySameName(row.id)} disabled={saving}
                            className="w-full text-xs bg-orange-100 text-orange-700 border border-orange-200 rounded px-2 py-0.5 hover:bg-orange-200">
                            일괄적용
                          </button>
                          <button onClick={()=>setEditing(null)} className="text-xs text-gray-400 hover:text-gray-600">취소</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-[#15385f] font-semibold whitespace-nowrap">
                        {FILE_TYPES.find(f=>f.key===row.file_type)?.label}
                      </td>
                      <td className="px-3 py-2">{row.std_date||'-'}</td>
                      <td className="px-3 py-2">{row.std_vendor_name||<span className="text-red-400">미입력</span>}</td>
                      <td className="px-3 py-2">{row.std_site_name||<span className="text-red-400">미입력</span>}</td>
                      <td className="px-3 py-2">{row.std_coil_no||'-'}</td>
                      <td className="px-3 py-2 text-right">{row.std_weight?Number(row.std_weight).toFixed(1):'-'}</td>
                      <td className="px-3 py-2"><span className="text-orange-600 font-semibold">{row.error_detail}</span></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-center">
                          <button onClick={()=>startEdit(row)} title="수정"
                            className="p-1 rounded hover:bg-blue-100 text-blue-600"><Edit2 className="w-3.5 h-3.5"/></button>
                          <button onClick={()=>excludeRow(row.id)} title="제외" disabled={saving}
                            className="p-1 rounded hover:bg-red-100 text-red-500"><X className="w-3.5 h-3.5"/></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {history.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs font-bold text-gray-500 cursor-pointer select-none">수정이력 ({history.length}건)</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs border border-gray-200 rounded-lg">
              <thead><tr className="bg-gray-50 font-bold text-[#15385f]">
                <th className="px-2 py-1 text-left">시각</th>
                <th className="px-2 py-1 text-left">Row</th>
                <th className="px-2 py-1 text-left">업체 (변경 전→후)</th>
              </tr></thead>
              <tbody>
                {history.map((h,i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1">{new Date(h.at).toLocaleString('ko-KR')}</td>
                    <td className="px-2 py-1">#{h.rowId}</td>
                    <td className="px-2 py-1 text-gray-600">{h.before?.std_vendor_name} → {h.after?.std_vendor_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}

// ─────────── 탭3: 현장별보고 ─────────────────
function TabSite({ rows }) {
  const [selected, setSelected] = useState(null)
  const siteData = calcSiteAllocation(rows||[])

  const totalPurchaseAlloc = siteData.reduce((s,r)=>s+r.purchaseAlloc,0)
  const totalSales         = siteData.reduce((s,r)=>s+r.salesAmount,0)
  const totalWork          = siteData.reduce((s,r)=>s+r.workWeight,0)
  const totalDelivery      = siteData.reduce((s,r)=>s+r.deliveryWeight,0)

  const detailRows = selected ? (rows||[]).filter(r=>(r.std_site_name||'미지정')===selected) : []

  if (!rows?.length) return (
    <div className="p-6 text-sm text-gray-500">① 파일업로드 탭에서 파일을 먼저 업로드하세요.</div>
  )

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-base font-bold text-[#15385f]">현장별 보고</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:'현장 수',     value:`${siteData.length}개` },
          { label:'총 작업중량', value:`${fmtNum(totalWork.toFixed(0))} kg` },
          { label:'총 매입배분', value:`${fmtNum(Math.round(totalPurchaseAlloc))}원` },
          { label:'총 매출액',   value:`${fmtNum(Math.round(totalSales))}원` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <div className="text-xs text-blue-500 font-semibold mb-0.5">{label}</div>
            <div className="text-sm font-bold text-[#15385f]">{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-[#15385f] text-white font-bold">
              <th className="px-3 py-2 text-left">현장명</th>
              <th className="px-3 py-2 text-right">작업중량(kg)</th>
              <th className="px-3 py-2 text-right">출고중량(kg)</th>
              <th className="px-3 py-2 text-right">매입배분액</th>
              <th className="px-3 py-2 text-right">매출액</th>
              <th className="px-3 py-2 text-right">참고차액</th>
              <th className="px-3 py-2 text-center">확인필요</th>
              <th className="px-3 py-2 w-10"/>
            </tr>
          </thead>
          <tbody>
            {siteData.map(s => {
              const diff = s.salesAmount - s.purchaseAlloc
              return (
                <tr key={s.site}
                  className={cls('border-t border-gray-100 cursor-pointer',
                    selected===s.site ? 'bg-blue-50' : 'hover:bg-gray-50')}
                  onClick={() => setSelected(selected===s.site ? null : s.site)}>
                  <td className="px-3 py-2 font-semibold text-[#15385f]">{s.site}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(s.workWeight.toFixed(1))}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(s.deliveryWeight.toFixed(1))}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(Math.round(s.purchaseAlloc))}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(Math.round(s.salesAmount))}</td>
                  <td className={cls('px-3 py-2 text-right font-semibold', diff>=0?'text-blue-600':'text-red-500')}>
                    {fmtNum(Math.round(diff))}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.checkCount > 0
                      ? <span className="bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded-full">{s.checkCount}</span>
                      : <CheckCircle className="w-3.5 h-3.5 text-green-500 mx-auto"/>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {selected===s.site
                      ? <ChevronUp className="w-3.5 h-3.5 mx-auto text-blue-500"/>
                      : <ChevronRight className="w-3.5 h-3.5 mx-auto text-gray-400"/>}
                  </td>
                </tr>
              )
            })}
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-xs">
              <td className="px-3 py-2 text-[#15385f]">합계</td>
              <td className="px-3 py-2 text-right">{fmtNum(totalWork.toFixed(1))}</td>
              <td className="px-3 py-2 text-right">{fmtNum(totalDelivery.toFixed(1))}</td>
              <td className="px-3 py-2 text-right">{fmtNum(Math.round(totalPurchaseAlloc))}</td>
              <td className="px-3 py-2 text-right">{fmtNum(Math.round(totalSales))}</td>
              <td className={cls('px-3 py-2 text-right font-bold', totalSales-totalPurchaseAlloc>=0?'text-blue-600':'text-red-500')}>
                {fmtNum(Math.round(totalSales-totalPurchaseAlloc))}
              </td>
              <td colSpan={2}/>
            </tr>
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h3 className="font-bold text-sm text-[#15385f] mb-3">{selected} — 상세내역 ({detailRows.length}건)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse bg-white rounded-lg overflow-hidden min-w-[560px]">
              <thead>
                <tr className="bg-blue-100 text-[#15385f] font-bold">
                  <th className="px-2 py-1.5 text-left">구분</th>
                  <th className="px-2 py-1.5 text-left">일자</th>
                  <th className="px-2 py-1.5 text-left">코일번호</th>
                  <th className="px-2 py-1.5 text-left">업체</th>
                  <th className="px-2 py-1.5 text-right">중량</th>
                  <th className="px-2 py-1.5 text-right">금액</th>
                  <th className="px-2 py-1.5 text-center">상태</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map(r => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-blue-50">
                    <td className="px-2 py-1 font-semibold text-[#15385f]">{FILE_TYPES.find(f=>f.key===r.file_type)?.label}</td>
                    <td className="px-2 py-1">{r.std_date}</td>
                    <td className="px-2 py-1">{r.std_coil_no||'-'}</td>
                    <td className="px-2 py-1">{r.std_vendor_name||'-'}</td>
                    <td className="px-2 py-1 text-right">{r.std_weight?Number(r.std_weight).toFixed(1):'-'}</td>
                    <td className="px-2 py-1 text-right">{r.std_amount?fmtNum(r.std_amount):'-'}</td>
                    <td className="px-2 py-1 text-center">
                      {r.is_excluded
                        ? <span className="text-gray-400 text-xs">제외</span>
                        : r.link_status==='확인필요'
                          ? <span className="text-orange-500 text-xs font-bold">확인필요</span>
                          : <CheckCircle className="w-3 h-3 text-green-500 mx-auto"/>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────── 탭4: 지출보고·다운로드 ──────────
function TabPayout({ baseMonth, rows, closing, onRefresh }) {
  const [payments, setPayments] = useState([])
  const [saving,   setSaving]   = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [editIdx,  setEditIdx]  = useState(null)
  const [toast,    setToast]    = useState('')

  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(''),3500) }

  const loadPayments = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('monthly_vendor_payments')
      .select('*').eq('base_month', baseMonth).order('vendor_name')
    setPayments(data||[])
    setLoading(false)
  }, [baseMonth])

  useEffect(() => { loadPayments() }, [loadPayments])

  const siteData = calcSiteAllocation(rows||[])

  // 거래처별 매입 집계
  const vendorPurchaseMap = {}
  ;(rows||[]).filter(r=>r.file_type==='purchase'&&!r.is_excluded).forEach(r => {
    const k = r.std_vendor_name||'미확인'
    vendorPurchaseMap[k] = (vendorPurchaseMap[k]||0) + Number(r.std_amount||r.std_total_amount||0)
  })

  const initPayments = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const existing = new Set(payments.map(p=>p.vendor_name))
      const toInsert = Object.entries(vendorPurchaseMap)
        .filter(([name])=>!existing.has(name))
        .map(([name,amt])=>({
          base_month: baseMonth, closing_id: closing?.id||null,
          vendor_name: name, purchase_amount: amt, this_payment: 0, created_by: user?.email,
        }))
      if (toInsert.length>0) {
        const { error } = await supabase.from('monthly_vendor_payments').insert(toInsert)
        if (error) throw error
      }
      await loadPayments()
      showToast('✅ 거래처 목록 초기화 완료')
    } catch(err) { showToast(`❌ ${err.message}`) }
    finally { setSaving(false) }
  }

  const updateCell = (idx, field, val) =>
    setPayments(prev => prev.map((p,i) => i===idx ? {...p,[field]:val} : p))

  const saveRow = async idx => {
    const p = payments[idx]
    setSaving(true)
    try {
      const payload = {
        base_month:      baseMonth,
        vendor_name:     p.vendor_name,
        purchase_amount: Number(p.purchase_amount||0),
        prev_payment:    p.prev_payment!==''&&p.prev_payment!=null ? Number(p.prev_payment) : null,
        this_payment:    Number(p.this_payment||0),
        payment_date:    p.payment_date||null,
        remarks:         p.remarks||null,
        updated_at:      new Date().toISOString(),
      }
      if (p.id) {
        const { error } = await supabase.from('monthly_vendor_payments').update(payload).eq('id', p.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('monthly_vendor_payments').insert(payload).select('id').single()
        if (error) throw error
        setPayments(prev => prev.map((r,i) => i===idx ? {...r, id:data.id} : r))
      }
      setEditIdx(null)
      showToast('저장되었습니다.')
    } catch(err) { showToast(`❌ ${err.message}`) }
    finally { setSaving(false) }
  }

  const changeStatus = async newStatus => {
    if (!closing?.id) { showToast('마감 정보가 없습니다.'); return }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const upd = { report_status: newStatus }
      if (newStatus==='보고완료') { upd.reported_at=new Date().toISOString(); upd.reported_by=user?.email }
      if (newStatus==='확인완료') { upd.approved_at=new Date().toISOString();  upd.approved_by=user?.email  }
      const { error } = await supabase.from('monthly_closings').update(upd).eq('id', closing.id)
      if (error) throw error
      showToast(`보고 상태 → [${newStatus}]`)
      onRefresh()
    } finally { setSaving(false) }
  }

  const doDownload = () => {
    const label = baseMonth.replace('-','')
    exportFullWorkbook(rows||[], payments, siteData, closing, label)
    showToast('✅ 엑셀 다운로드 시작')
  }

  const totals = {
    purchase:    payments.reduce((s,p)=>s+Number(p.purchase_amount||0),0),
    thisPayment: payments.reduce((s,p)=>s+Number(p.this_payment||0),0),
  }
  const status = closing?.report_status || '작성중'

  return (
    <div className="p-6 space-y-5">
      <Toast msg={toast} onClose={()=>setToast('')}/>

      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-[#15385f]">지출보고 — {baseMonth}</h2>
          <Badge status={status}/>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={doDownload}
            className="flex items-center gap-1.5 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 font-semibold">
            <Download className="w-3.5 h-3.5"/> 엑셀(12시트)
          </button>
          {status==='작성중' && (
            <button onClick={()=>changeStatus('보고완료')} disabled={saving}
              className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-semibold">
              <ArrowRight className="w-3.5 h-3.5"/> 대표보고
            </button>
          )}
          {status==='보고완료' && (
            <>
              <button onClick={()=>changeStatus('작성중')} disabled={saving}
                className="text-xs bg-gray-100 text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-200 font-semibold">
                수정하기
              </button>
              <button onClick={()=>changeStatus('확인완료')} disabled={saving}
                className="flex items-center gap-1.5 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 font-semibold">
                <CheckCircle className="w-3.5 h-3.5"/> 확인완료
              </button>
            </>
          )}
          {status==='확인완료' && (
            <button onClick={()=>changeStatus('보고완료')} disabled={saving}
              className="text-xs bg-orange-100 text-orange-700 border border-orange-300 px-3 py-1.5 rounded-lg hover:bg-orange-200 font-semibold">
              재마감
            </button>
          )}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
          <div className="text-xs text-blue-500 font-semibold mb-0.5">총 매입금액</div>
          <div className="text-sm font-bold text-[#15385f]">{fmtNum(Math.round(totals.purchase))}원</div>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-3">
          <div className="text-xs text-green-600 font-semibold mb-0.5">이번 지급 요청액</div>
          <div className="text-sm font-bold text-[#15385f]">{fmtNum(Math.round(totals.thisPayment))}원</div>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
          <div className="text-xs text-orange-500 font-semibold mb-0.5">지급 후 미지급금</div>
          <div className="text-sm font-bold text-[#15385f]">{fmtNum(Math.round(totals.purchase-totals.thisPayment))}원</div>
        </div>
      </div>

      {/* 거래처 테이블 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-sm text-[#15385f]">거래처별 지급 입력</h3>
        <button onClick={initPayments} disabled={saving}
          className="flex items-center gap-1 text-xs bg-blue-50 border border-blue-200 rounded px-3 py-1 hover:bg-blue-100">
          <RefreshCw className="w-3 h-3"/> 거래처 자동불러오기
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-20"><Spinner/></div>
      ) : payments.length===0 ? (
        <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4">
          거래처가 없습니다. <strong>거래처 자동불러오기</strong>를 클릭하여 매입내역의 업체를 불러오세요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-[#15385f] text-white font-bold">
                <th className="px-3 py-2 text-left">거래처명</th>
                <th className="px-3 py-2 text-right">매입금액</th>
                <th className="px-3 py-2 text-right">이전지급액</th>
                <th className="px-3 py-2 text-right">이번지급액</th>
                <th className="px-3 py-2 text-right">미지급(예상)</th>
                <th className="px-3 py-2 text-center">지급예정일</th>
                <th className="px-3 py-2 text-left">특이사항</th>
                <th className="px-3 py-2 text-center w-16">저장</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => {
                const isEdit = editIdx===i
                const unpaid = p.prev_payment!=null
                  ? Number(p.purchase_amount||0)-Number(p.prev_payment||0)-Number(p.this_payment||0)
                  : null
                return (
                  <tr key={p.id||i} onClick={()=>setEditIdx(i)}
                    className={cls('border-t border-gray-100 cursor-pointer',
                      isEdit?'bg-yellow-50':'hover:bg-blue-50')}>
                    <td className="px-3 py-2 font-semibold text-[#15385f]">{p.vendor_name}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(Math.round(p.purchase_amount||0))}</td>
                    <td className="px-3 py-2 text-right">
                      {isEdit ? (
                        <input type="number" value={p.prev_payment??''}
                          onChange={e=>updateCell(i,'prev_payment',e.target.value)}
                          onClick={e=>e.stopPropagation()}
                          className="w-24 border border-blue-300 rounded px-1.5 py-0.5 text-right text-xs"/>
                      ) : p.prev_payment!=null ? fmtNum(p.prev_payment) : <span className="text-gray-300">미입력</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isEdit ? (
                        <input type="number" value={p.this_payment||''}
                          onChange={e=>updateCell(i,'this_payment',e.target.value)}
                          onClick={e=>e.stopPropagation()}
                          className="w-24 border border-blue-300 rounded px-1.5 py-0.5 text-right text-xs"/>
                      ) : fmtNum(p.this_payment||0)}
                    </td>
                    <td className={cls('px-3 py-2 text-right font-semibold',
                      unpaid==null?'text-gray-300':unpaid>0?'text-orange-600':'text-green-600')}>
                      {unpaid==null?'미확정':fmtNum(Math.round(unpaid))}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {isEdit ? (
                        <input type="date" value={p.payment_date||''}
                          onChange={e=>updateCell(i,'payment_date',e.target.value)}
                          onClick={e=>e.stopPropagation()}
                          className="border border-blue-300 rounded px-1 py-0.5 text-xs"/>
                      ) : (p.payment_date||'-')}
                    </td>
                    <td className="px-3 py-2">
                      {isEdit ? (
                        <input value={p.remarks||''}
                          onChange={e=>updateCell(i,'remarks',e.target.value)}
                          onClick={e=>e.stopPropagation()}
                          className="w-28 border border-gray-200 rounded px-1.5 py-0.5 text-xs"/>
                      ) : (p.remarks||'')}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {isEdit && (
                        <button onClick={e=>{e.stopPropagation();saveRow(i)}} disabled={saving}
                          className="text-xs bg-blue-600 text-white rounded px-2 py-0.5 hover:bg-blue-700 font-semibold">
                          {saving?'…':'저장'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        * 행을 클릭하면 이전지급액 / 이번지급액 / 지급예정일을 직접 입력할 수 있습니다.
        실제 지급자료가 없는 경우 이전지급액란은 비워두세요 (미확정 표시).
      </p>
    </div>
  )
}

// ─────────── 메인 컴포넌트 ───────────────────
export default function MonthlyClose() {
  const [tab,       setTab]      = useState('upload')
  const [baseMonth, setBaseMonth]= useState(TODAY_MONTH)
  const [batches,   setBatches]  = useState([])
  const [rows,      setRows]     = useState([])
  const [closing,   setClosing]  = useState(null)
  const [masters,   setMasters]  = useState({})
  const [loading,   setLoading]  = useState(false)
  const initialized = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const m = await fetchMasters()
      setMasters(m)

      const [{ data: batchData }, { data: rowData }, { data: closingData }] = await Promise.all([
        supabase.from('monthly_import_batches').select('*').eq('base_month', baseMonth).order('created_at'),
        supabase.from('monthly_import_rows').select('*').eq('base_month', baseMonth).order('id'),
        supabase.from('monthly_closings').select('*').eq('base_month', baseMonth).maybeSingle(),
      ])

      const rowCountMap = {}
      ;(rowData||[]).forEach(r => { rowCountMap[r.batch_id] = (rowCountMap[r.batch_id]||0)+1 })
      setBatches((batchData||[]).map(b => ({ ...b, row_count: rowCountMap[b.id]||0 })))
      setRows(rowData||[])
      setClosing(closingData)

      // monthly_closings 없으면 자동 생성
      if (!closingData) {
        const { data: { user } } = await supabase.auth.getUser()
        const { data: nc } = await supabase.from('monthly_closings')
          .insert({ base_month: baseMonth, created_by: user?.email, report_status:'작성중' })
          .select().single()
        setClosing(nc)
      }
    } catch(err) {
      console.error('load error', err)
    } finally { setLoading(false) }
  }, [baseMonth])

  useEffect(() => {
    initialized.current = true
    load()
  }, [load])

  const errorCount = rows.filter(r=>r.link_status==='확인필요'&&!r.is_excluded).length

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 페이지 헤더 */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4 flex-wrap shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-extrabold text-[#15385f]">월말반영</h1>
          {closing && <Badge status={closing.report_status}/>}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[#15385f]">기준월</label>
          <input type="month" value={baseMonth} onChange={e=>setBaseMonth(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 font-semibold text-[#15385f] focus:outline-none focus:ring-2 focus:ring-blue-400"/>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1 text-xs bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-100">
            {loading ? <Spinner/> : <RefreshCw className="w-3.5 h-3.5 text-blue-600"/>}
          </button>
        </div>
      </div>

      {/* 탭 내비게이션 */}
      <div className="flex border-b border-gray-200 bg-gray-50 shrink-0 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={()=>setTab(key)}
            className={cls(
              'px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap shrink-0',
              tab===key
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-[#15385f] hover:text-blue-700 hover:bg-white'
            )}>
            {label}
            {key==='fix' && errorCount>0 && (
              <span className="ml-1.5 bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {errorCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex-1 overflow-auto min-h-0">
        {tab==='upload' && <TabUpload baseMonth={baseMonth} batches={batches} onUploaded={load}/>}
        {tab==='fix'    && <TabFix    rows={rows} masters={masters} onFixed={load}/>}
        {tab==='site'   && <TabSite   rows={rows}/>}
        {tab==='payout' && <TabPayout baseMonth={baseMonth} rows={rows} closing={closing} onRefresh={load}/>}
      </div>
    </div>
  )
}
