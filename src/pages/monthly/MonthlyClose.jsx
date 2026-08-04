import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  AlertCircle, CalendarCheck, CheckCircle, Download,
  FileSpreadsheet, Pencil, RefreshCw,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  exportRowsWorkbook, FILE_TYPES, getPeriodMonths, normalizeRow,
} from '../../lib/monthlyWorkbook'

const COLORS = {
  purchase: 'bg-blue-50 border-blue-200 text-blue-700',
  work: 'bg-green-50 border-green-200 text-green-700',
  delivery: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  payment: 'bg-purple-50 border-purple-200 text-purple-700',
  inventory: 'bg-orange-50 border-orange-200 text-orange-700',
  sales: 'bg-red-50 border-red-200 text-red-700',
}

const fmt = value => Number(value || 0).toLocaleString('ko-KR')

async function getCurrentUserLabel() {
  const { data } = await supabase.auth.getUser()
  return data.user?.email || '관리자'
}

function FileUploadCard({ type, baseMonth, locked, masters, onUploaded }) {
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)

  const handleFile = async file => {
    if (locked) return toast.error('마감확정된 월입니다. 먼저 마감 수정을 시작해 주세요.')
    if (!baseMonth) return toast.error('기준연월을 선택해 주세요.')
    if (!file) return
    setUploading(true)
    setResult(null)

    let batchId = null
    try {
      const { data: duplicate } = await supabase
        .from('monthly_import_batches')
        .select('id')
        .eq('base_month', baseMonth)
        .eq('file_type', type.key)
        .eq('file_name', file.name)
        .limit(1)
      if (duplicate?.length) throw new Error('같은 기준월에 동일한 파일이 이미 등록되어 있습니다.')

      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
      const sourceRows = []
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName]
        XLSX.utils.sheet_to_json(sheet, { raw: false, defval: null }).forEach((row, index) => {
          sourceRows.push({ sheetName, sourceRow: index + 2, row })
        })
      })
      if (!sourceRows.length) throw new Error('파일에 읽을 수 있는 데이터가 없습니다.')

      const uploadedBy = await getCurrentUserLabel()
      const { data: batch, error: batchError } = await supabase
        .from('monthly_import_batches')
        .insert({
          base_month: baseMonth,
          file_type: type.key,
          file_name: file.name,
          sheet_name: workbook.SheetNames.join(', '),
          total_rows: sourceRows.length,
          status: '업로드중',
          uploaded_by: uploadedBy,
        })
        .select('id')
        .single()
      if (batchError) throw batchError
      batchId = batch.id

      let okRows = 0
      let checkRows = 0
      let errorRows = 0
      const chunkSize = 100
      for (let index = 0; index < sourceRows.length; index += chunkSize) {
        const payload = sourceRows.slice(index, index + chunkSize).map(source => {
          const normalized = normalizeRow(source.row, type.key, masters)
          if (normalized.link_status === '정상') okRows += 1
          else checkRows += 1
          return {
            batch_id: batch.id,
            base_month: baseMonth,
            file_type: type.key,
            source_file: file.name,
            source_sheet: source.sheetName,
            source_row: source.sourceRow,
            raw_data: source.row,
            ...normalized,
          }
        })
        const { error } = await supabase.from('monthly_import_rows').insert(payload)
        if (error) {
          errorRows += payload.length
          okRows = Math.max(0, okRows - payload.filter(row => row.link_status === '정상').length)
          checkRows = Math.max(0, checkRows - payload.filter(row => row.link_status !== '정상').length)
        }
      }

      await supabase.from('monthly_import_batches').update({
        ok_rows: okRows,
        error_rows: errorRows,
        unlinked_rows: checkRows,
        status: '검토중',
      }).eq('id', batch.id)

      setResult({ total: sourceRows.length, ok: okRows, check: checkRows, error: errorRows })
      toast.success(`${type.label} ${sourceRows.length}행을 분석했습니다.`)
      onUploaded()
    } catch (error) {
      if (batchId) {
        await supabase.from('monthly_import_batches').delete().eq('id', batchId)
      }
      toast.error(`업로드 실패: ${error.message}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <label className={`border rounded-xl p-4 ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${COLORS[type.key]}`}>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        disabled={locked || uploading}
        onChange={event => {
          handleFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <div className="flex items-center gap-2 mb-2">
        <FileSpreadsheet className="w-4 h-4" />
        <span className="font-semibold text-sm">{type.label}</span>
      </div>
      {uploading ? (
        <p className="text-xs">전체 시트 분석 중...</p>
      ) : result ? (
        <div className="text-xs space-y-0.5">
          <p>전체 {fmt(result.total)}행</p>
          <p>정상 {fmt(result.ok)}행 · 확인필요 {fmt(result.check)}행</p>
          {result.error > 0 && <p className="text-red-600">저장오류 {fmt(result.error)}행</p>}
        </div>
      ) : (
        <p className="text-xs opacity-70">파일을 선택해 주세요.</p>
      )}
    </label>
  )
}

function ReviewTable({ rows, loading }) {
  if (loading) return <p className="text-center py-16 text-gray-400">ROW DATA를 불러오는 중입니다.</p>
  if (!rows.length) return <p className="text-center py-16 text-gray-400">검토할 자료가 없습니다.</p>
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
      <table className="tbl min-w-[1180px]">
        <thead>
          <tr>
            <th>구분</th><th>일자</th><th>업체</th><th>현장</th><th>발주번호</th>
            <th>코일번호</th><th>재질</th><th>두께</th><th>폭</th>
            <th>중량</th><th>금액</th><th>원본</th><th>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td>{FILE_TYPES.find(type => type.key === row.file_type)?.label || row.file_type}</td>
              <td>{row.std_date || '-'}</td>
              <td>{row.std_vendor_name || '-'}</td>
              <td>{row.std_site_name || '-'}</td>
              <td>{row.std_po_number || '-'}</td>
              <td>{row.std_coil_no || '-'}</td>
              <td>{row.std_material || '-'}</td>
              <td className="text-right">{row.std_thickness ?? '-'}</td>
              <td className="text-right">{row.std_width ?? '-'}</td>
              <td className="text-right">{row.std_weight != null ? fmt(row.std_weight) : '-'}</td>
              <td className="text-right">{row.std_amount != null ? fmt(row.std_amount) : '-'}</td>
              <td className="text-xs">{row.source_file}<br />{row.source_sheet} / {row.source_row}행</td>
              <td>
                <span className={row.link_status === '정상' ? 'badge-green' : 'badge-yellow'}>
                  {row.link_status}
                </span>
                {row.error_detail && <p className="text-xs text-red-500 mt-1">{row.error_detail}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function MonthlyClose() {
  const now = new Date()
  const initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [baseMonth, setBaseMonth] = useState(initialMonth)
  const [batches, setBatches] = useState([])
  const [closing, setClosing] = useState(null)
  const [reviewRows, setReviewRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('upload')
  const [period, setPeriod] = useState('month')
  const [masters, setMasters] = useState({ vendors: [], sites: [], orders: [] })

  const locked = ['마감확정', '재마감확정'].includes(closing?.status)

  const loadMonthData = useCallback(async () => {
    setLoading(true)
    const [batchResult, closingResult, rowResult] = await Promise.all([
      supabase.from('monthly_import_batches').select('*').eq('base_month', baseMonth).order('uploaded_at', { ascending: false }),
      supabase.from('monthly_closings').select('*').eq('base_month', baseMonth).maybeSingle(),
      supabase.from('monthly_import_rows').select('*').eq('base_month', baseMonth).order('source_file').order('source_row').limit(1000),
    ])
    setBatches(batchResult.data || [])
    setClosing(closingResult.data || null)
    setReviewRows(rowResult.data || [])
    setLoading(false)
  }, [baseMonth])

  useEffect(() => {
    Promise.all([
      supabase.from('vendors').select('id,vendor_name'),
      supabase.from('sites').select('id,site_name'),
      supabase.from('purchase_orders').select('id,po_number'),
    ]).then(([vendors, sites, orders]) => {
      setMasters({
        vendors: vendors.data || [],
        sites: sites.data || [],
        orders: orders.data || [],
      })
    })
  }, [])

  useEffect(() => { loadMonthData() }, [loadMonthData])

  const totals = useMemo(() => ({
    total: batches.reduce((sum, batch) => sum + Number(batch.total_rows || 0), 0),
    ok: batches.reduce((sum, batch) => sum + Number(batch.ok_rows || 0), 0),
    error: batches.reduce((sum, batch) => sum + Number(batch.error_rows || 0), 0),
    unlinked: batches.reduce((sum, batch) => sum + Number(batch.unlinked_rows || 0), 0),
  }), [batches])

  const confirmClosing = async () => {
    if (!batches.length) return toast.error('업로드된 파일이 없습니다.')
    const user = await getCurrentUserLabel()
    const nextStatus = closing?.status === '수정중' ? '재마감확정' : '마감확정'
    const nextVersion = closing?.status === '수정중' ? Number(closing.version || 1) : 1
    const { data, error } = await supabase.from('monthly_closings').upsert({
      base_month: baseMonth,
      status: nextStatus,
      total_rows: totals.total,
      ok_rows: totals.ok,
      error_rows: totals.error,
      unlinked_rows: totals.unlinked,
      confirmed_at: new Date().toISOString(),
      confirmed_by: user,
      version: nextVersion,
    }, { onConflict: 'base_month' }).select('id').single()
    if (error) return toast.error(error.message)
    await Promise.all([
      supabase.from('monthly_import_batches').update({ status: '마감확정', closing_id: data.id }).eq('base_month', baseMonth),
      supabase.from('monthly_import_rows').update({ is_confirmed: true, confirmed_at: new Date().toISOString() }).eq('base_month', baseMonth),
    ])
    toast.success(`${baseMonth} 마감이 확정되었습니다.`)
    loadMonthData()
  }

  const startRevision = async () => {
    const reason = window.prompt('마감 수정사유를 입력해 주세요.')
    if (!reason?.trim()) return toast.error('마감 수정사유는 필수입니다.')
    const user = await getCurrentUserLabel()
    const versionFrom = Number(closing.version || 1)
    const versionTo = versionFrom + 1
    const { error } = await supabase.from('monthly_closing_revisions').insert({
      closing_id: closing.id,
      base_month: baseMonth,
      version_from: versionFrom,
      version_to: versionTo,
      revision_reason: reason.trim(),
      target_desc: '월 마감자료 수정',
      changed_by: user,
      changes: { status: { before: closing.status, after: '수정중' } },
    })
    if (error) return toast.error(error.message)
    await Promise.all([
      supabase.from('monthly_closings').update({ status: '수정중', version: versionTo }).eq('id', closing.id),
      supabase.from('monthly_import_rows').update({ is_confirmed: false, confirmed_at: null }).eq('base_month', baseMonth),
    ])
    toast.success('마감 수정상태로 변경했습니다.')
    loadMonthData()
  }

  const download = async () => {
    const months = getPeriodMonths(baseMonth, period)
    const { data: closings, error: closingError } = await supabase
      .from('monthly_closings')
      .select('base_month,status')
      .in('base_month', months)
      .in('status', ['마감확정', '재마감확정'])
    if (closingError) return toast.error(closingError.message)
    const confirmedMonths = closings?.map(item => item.base_month) || []
    if (!confirmedMonths.length) return toast.error('선택 기간에 마감확정된 월이 없습니다.')

    const { data: rows, error } = await supabase
      .from('monthly_import_rows')
      .select('*')
      .in('base_month', confirmedMonths)
      .order('base_month')
      .order('source_file')
      .order('source_row')
    if (error) return toast.error(error.message)
    const labelMap = { month: baseMonth, quarter: `${baseMonth.slice(0, 4)}년_${Math.floor((Number(baseMonth.slice(5)) - 1) / 3) + 1}분기`, half: `${baseMonth.slice(0, 4)}년_${Number(baseMonth.slice(5)) <= 6 ? '상반기' : '하반기'}`, year: `${baseMonth.slice(0, 4)}년_연간` }
    exportRowsWorkbook(rows || [], labelMap[period])
    toast.success(`${fmt(rows?.length)}행 ROW DATA를 다운로드했습니다.`)
  }

  const tabs = [
    ['upload', '① 파일 업로드'],
    ['review', '② ROW DATA 검토'],
    ['confirm', '③ 마감 확정·수정'],
    ['download', '④ 기간별 다운로드'],
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">월말반영</h1>
          <p className="text-sm text-gray-500">원본 ROW DATA 보존 · 검토 · 마감 · 기간별 다운로드</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 font-medium">기준연월</span>
          <input type="month" value={baseMonth} onChange={event => setBaseMonth(event.target.value)} className="input w-40" />
          <button onClick={loadMonthData} className="btn-secondary"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          ['업로드 파일', `${batches.length}건`, 'bg-blue-50 text-blue-700'],
          ['전체 ROW DATA', `${fmt(totals.total)}행`, 'bg-gray-50 text-gray-700'],
          ['정상 연결', `${fmt(totals.ok)}행`, 'bg-green-50 text-green-700'],
          ['확인필요·오류', `${fmt(totals.unlinked + totals.error)}행`, 'bg-red-50 text-red-700'],
        ].map(([label, value, color]) => (
          <div key={label} className={`rounded-xl border p-3 ${color}`}>
            <p className="text-xs opacity-70">{label}</p>
            <p className="text-lg font-bold">{value}</p>
          </div>
        ))}
      </div>

      {closing && (
        <div className={`mb-4 px-4 py-3 rounded-lg border flex items-center gap-2 text-sm ${locked ? 'bg-green-50 border-green-300 text-green-700' : 'bg-yellow-50 border-yellow-300 text-yellow-700'}`}>
          <CheckCircle className="w-4 h-4" />
          <span>{baseMonth} · <b>{closing.status}</b> · 버전 {closing.version}</span>
          {closing.confirmed_at && <span className="text-xs opacity-70">{new Date(closing.confirmed_at).toLocaleString('ko-KR')}</span>}
        </div>
      )}

      <div className="flex border-b mb-4">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-5 py-2.5 text-sm font-medium border-b-2 ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'upload' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">파일의 모든 시트를 읽고 원본파일·시트·행번호와 함께 저장합니다.</p>
          <div className="grid grid-cols-3 gap-3">
            {FILE_TYPES.map(type => <FileUploadCard key={type.key} type={type} baseMonth={baseMonth} locked={locked} masters={masters} onUploaded={loadMonthData} />)}
          </div>
          {batches.length > 0 && (
            <div className="mt-6 bg-white rounded-xl border overflow-hidden">
              <table className="tbl">
                <thead><tr><th>구분</th><th>파일명</th><th>시트</th><th>전체</th><th>정상</th><th>확인필요</th><th>오류</th><th>상태</th></tr></thead>
                <tbody>
                  {batches.map(batch => (
                    <tr key={batch.id}>
                      <td>{FILE_TYPES.find(type => type.key === batch.file_type)?.label}</td>
                      <td>{batch.file_name}</td><td>{batch.sheet_name}</td>
                      <td className="text-right">{fmt(batch.total_rows)}</td>
                      <td className="text-right text-green-600">{fmt(batch.ok_rows)}</td>
                      <td className="text-right text-yellow-600">{fmt(batch.unlinked_rows)}</td>
                      <td className="text-right text-red-600">{fmt(batch.error_rows)}</td>
                      <td><span className={batch.status === '마감확정' ? 'badge-green' : 'badge-yellow'}>{batch.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'review' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">최대 1,000행을 화면에서 검토하며 다운로드에는 전체 행이 포함됩니다.</p>
            <span className="text-xs text-gray-400">표시 {fmt(reviewRows.length)}행</span>
          </div>
          <ReviewTable rows={reviewRows} loading={loading} />
        </div>
      )}

      {tab === 'confirm' && (
        <div className="max-w-xl card">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><CalendarCheck className="w-5 h-5 text-blue-500" />{baseMonth} 마감관리</h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1 mb-4">
            <div className="flex justify-between"><span>전체 ROW DATA</span><b>{fmt(totals.total)}행</b></div>
            <div className="flex justify-between"><span>확인필요·오류</span><b className={totals.unlinked + totals.error ? 'text-red-600' : 'text-green-600'}>{fmt(totals.unlinked + totals.error)}행</b></div>
            <div className="flex justify-between"><span>현재 상태</span><b>{closing?.status || '미마감'}</b></div>
          </div>
          {locked ? (
            <button onClick={startRevision} className="btn-secondary w-full flex justify-center items-center gap-2"><Pencil className="w-4 h-4" />마감 수정 시작</button>
          ) : (
            <button disabled={!batches.length} onClick={confirmClosing} className="btn-primary w-full">{closing?.status === '수정중' ? '재마감 확정' : '마감 확정'}</button>
          )}
          <p className="text-xs text-gray-400 mt-3">마감 수정 시 사유와 버전이 기록되며 기존 이력은 삭제되지 않습니다.</p>
        </div>
      )}

      {tab === 'download' && (
        <div className="max-w-2xl card">
          <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2"><Download className="w-5 h-5 text-blue-500" />통합 ROW DATA 다운로드</h3>
          <p className="text-sm text-gray-500 mb-4">마감확정된 월의 원본행·표준화원장·오류·현장별원가·업체별매입지급을 한 파일로 정리합니다.</p>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[['month', '월간'], ['quarter', '분기'], ['half', '반기'], ['year', '연간']].map(([key, label]) => (
              <button key={key} onClick={() => setPeriod(key)} className={period === key ? 'btn-primary' : 'btn-secondary'}>{label}</button>
            ))}
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 mb-4">
            포함 시트: 통합ROW_DATA, 작업·출고·매입·지급·재고·매출 원본, 현장별원가, 업체별매입지급, 검증오류, 요약분석
          </div>
          <button onClick={download} className="btn-primary w-full flex items-center justify-center gap-2"><FileSpreadsheet className="w-4 h-4" />엑셀 다운로드</button>
        </div>
      )}
    </div>
  )
}
