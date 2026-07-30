import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { CalendarCheck, Upload, CheckCircle, AlertCircle, FileSpreadsheet, Plus } from 'lucide-react'
import * as XLSX from 'xlsx'

// 파일 타입 정의
const FILE_TYPES = [
  { key: 'purchase', label: '매입내역',  color: 'blue' },
  { key: 'work',     label: '작업내역',  color: 'green' },
  { key: 'delivery', label: '출고내역',  color: 'yellow' },
  { key: 'payment',  label: '지급내역',  color: 'purple' },
  { key: 'inventory',label: '재고현황',  color: 'orange' },
  { key: 'sales',    label: '매출내역',  color: 'red' },
]

const COLOR_MAP = {
  blue:   'bg-blue-50 border-blue-200 text-blue-700',
  green:  'bg-green-50 border-green-200 text-green-700',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  purple: 'bg-purple-50 border-purple-200 text-purple-700',
  orange: 'bg-orange-50 border-orange-200 text-orange-700',
  red:    'bg-red-50 border-red-200 text-red-700',
}

function MonthSelector({ value, onChange }) {
  return (
    <input
      type="month"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="input w-40"
    />
  )
}

function FileUploadCard({ type, baseMonth, onUploaded }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const colorClass = COLOR_MAP[type.color] || COLOR_MAP.blue

  const handleFile = async (file) => {
    if (!baseMonth) return toast.error('기준 연월을 먼저 선택하세요.')
    if (!file) return

    setUploading(true)
    setResult(null)

    try {
      // SheetJS로 파일 읽기
      const buf = await file.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array', cellDates: true })
      const sheetName = wb.SheetNames[0]
      const ws  = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: null })

      if (rows.length === 0) {
        setUploading(false)
        return toast.error('파일에 데이터가 없습니다.')
      }

      // monthly_import_batches에 배치 등록
      const { data: batch, error: bErr } = await supabase
        .from('monthly_import_batches')
        .insert({
          base_month:   baseMonth,
          file_type:    type.key,
          file_name:    file.name,
          sheet_name:   sheetName,
          total_rows:   rows.length,
          status:       '업로드중',
        })
        .select('id')
        .single()

      if (bErr) throw new Error(bErr.message)

      // monthly_import_rows에 RAW 데이터 저장 (100건 단위 배치)
      const CHUNK = 100
      let okRows = 0, errRows = 0

      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK).map((row, j) => ({
          batch_id:     batch.id,
          base_month:   baseMonth,
          file_type:    type.key,
          source_file:  file.name,
          source_sheet: sheetName,
          source_row:   i + j + 2,  // 헤더 제외 실제 행번호
          raw_data:     row,
          link_status:  '미확인',
        }))

        const { error: rErr } = await supabase.from('monthly_import_rows').insert(chunk)
        if (rErr) errRows += chunk.length
        else okRows += chunk.length
      }

      // 배치 상태 업데이트
      await supabase.from('monthly_import_batches').update({
        ok_rows:    okRows,
        error_rows: errRows,
        status:     errRows === 0 ? '검토중' : '검토중',
      }).eq('id', batch.id)

      const res = { total: rows.length, ok: okRows, err: errRows, batchId: batch.id }
      setResult(res)
      toast.success(`${type.label} ${okRows}행 업로드 완료`)
      if (onUploaded) onUploaded(res)
    } catch (e) {
      toast.error('업로드 실패: ' + e.message)
    }
    setUploading(false)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div
      className={`border-2 rounded-xl p-4 transition-all cursor-pointer ${
        dragging ? 'border-blue-400 bg-blue-50 scale-105' : `border ${colorClass}`
      }`}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => document.getElementById(`file-${type.key}`).click()}
    >
      <input id={`file-${type.key}`} type="file"
        accept=".xlsx,.xls,.csv" className="hidden"
        onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = '' }}
      />

      <div className="flex items-center gap-2 mb-2">
        <FileSpreadsheet className="w-4 h-4" />
        <span className="font-semibold text-sm">{type.label}</span>
      </div>

      {uploading ? (
        <div className="text-xs flex items-center gap-1.5 text-gray-500">
          <div className="animate-spin w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full" />
          업로드중...
        </div>
      ) : result ? (
        <div className="text-xs space-y-0.5">
          <div className="flex items-center gap-1 text-green-600">
            <CheckCircle className="w-3 h-3" /> {result.ok}행 완료
          </div>
          {result.err > 0 && (
            <div className="flex items-center gap-1 text-red-500">
              <AlertCircle className="w-3 h-3" /> {result.err}행 오류
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400">클릭하거나 파일을 끌어다 놓으세요</p>
      )}
    </div>
  )
}

export default function MonthlyClose() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [baseMonth, setBaseMonth] = useState(defaultMonth)
  const [batches, setBatches] = useState([])
  const [closing, setClosing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('upload')  // upload | review | confirm

  const loadMonthData = async () => {
    setLoading(true)
    const [{ data: bData }, { data: cData }] = await Promise.all([
      supabase.from('monthly_import_batches').select('*').eq('base_month', baseMonth).order('uploaded_at', { ascending: false }),
      supabase.from('monthly_closings').select('*').eq('base_month', baseMonth).single(),
    ])
    setBatches(bData || [])
    setClosing(cData || null)
    setLoading(false)
  }

  useEffect(() => { loadMonthData() }, [baseMonth])

  const totalRows  = batches.reduce((s, b) => s + (b.total_rows || 0), 0)
  const okRows     = batches.reduce((s, b) => s + (b.ok_rows || 0), 0)
  const errorRows  = batches.reduce((s, b) => s + (b.error_rows || 0), 0)

  const TABS = [
    { key: 'upload',  label: '① 파일 업로드' },
    { key: 'review',  label: '② 데이터 검토' },
    { key: 'confirm', label: '③ 마감 확정' },
  ]

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">월말반영</h1>
          <p className="text-sm text-gray-500">월별 실적자료 업로드 및 마감 처리</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 font-medium">기준 연월</span>
          <MonthSelector value={baseMonth} onChange={setBaseMonth} />
        </div>
      </div>

      {/* 현황 요약 */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: '업로드 파일', value: batches.length + '건', color: 'bg-blue-50 text-blue-700' },
          { label: '전체 행수',   value: totalRows.toLocaleString() + '행', color: 'bg-gray-50 text-gray-700' },
          { label: '정상 처리',   value: okRows.toLocaleString() + '행',    color: 'bg-green-50 text-green-700' },
          { label: '오류/미연결', value: errorRows.toLocaleString() + '행', color: 'bg-red-50 text-red-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl border p-3 ${color}`}>
            <p className="text-xs opacity-70 mb-0.5">{label}</p>
            <p className="text-lg font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* 마감 상태 표시 */}
      {closing && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg border flex items-center gap-2 text-sm ${
          closing.status === '마감확정' ? 'bg-green-50 border-green-300 text-green-700' :
          'bg-yellow-50 border-yellow-300 text-yellow-700'
        }`}>
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{baseMonth} 마감 상태: <b>{closing.status}</b> (v{closing.version})</span>
          {closing.confirmed_at && (
            <span className="ml-2 text-xs opacity-70">확정: {new Date(closing.confirmed_at).toLocaleString('ko-KR')}</span>
          )}
        </div>
      )}

      {/* 탭 */}
      <div className="flex border-b mb-4">
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      {tab === 'upload' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            아래 6가지 파일을 엑셀(.xlsx/.xls)로 업로드하세요. 원본 데이터는 ROW DATA로 100% 보존됩니다.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {FILE_TYPES.map(type => (
              <FileUploadCard key={type.key} type={type} baseMonth={baseMonth} onUploaded={loadMonthData} />
            ))}
          </div>

          {/* 업로드 이력 */}
          {batches.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-gray-700 mb-2">{baseMonth} 업로드 이력</h3>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>구분</th><th>파일명</th><th>시트</th><th>전체</th><th>정상</th><th>오류</th><th>상태</th><th>업로드시각</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map(b => (
                      <tr key={b.id}>
                        <td className="text-xs font-medium">{FILE_TYPES.find(t => t.key === b.file_type)?.label || b.file_type}</td>
                        <td className="text-xs max-w-[160px] truncate" title={b.file_name}>{b.file_name}</td>
                        <td className="text-xs">{b.sheet_name || '-'}</td>
                        <td className="text-right text-xs">{(b.total_rows || 0).toLocaleString()}</td>
                        <td className="text-right text-xs text-green-600">{(b.ok_rows || 0).toLocaleString()}</td>
                        <td className="text-right text-xs text-red-500">{(b.error_rows || 0).toLocaleString()}</td>
                        <td className="text-center">
                          <span className={b.status === '마감확정' ? 'badge-green' : b.status === '검토중' ? 'badge-yellow' : 'badge-blue'}>
                            {b.status}
                          </span>
                        </td>
                        <td className="text-xs text-gray-400">
                          {b.uploaded_at ? new Date(b.uploaded_at).toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'review' && (
        <div className="text-center py-16 text-gray-400">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p className="text-sm">데이터 검토 기능은 다음 단계에서 구현됩니다.</p>
          <p className="text-xs mt-1 text-gray-300">업로드된 ROW DATA의 거래처·현장·발주 연결 상태를 검토합니다.</p>
        </div>
      )}

      {tab === 'confirm' && (
        <div className="max-w-md">
          <div className="card">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-blue-500" />
              {baseMonth} 마감 확정
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              업로드된 자료를 최종 확정합니다. 확정 후에는 수정 사유를 입력해야 재마감이 가능합니다.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">업로드 파일</span>
                <span className="font-medium">{batches.length}건</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">전체 행수</span>
                <span className="font-medium">{totalRows.toLocaleString()}행</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">오류 행수</span>
                <span className={`font-medium ${errorRows > 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {errorRows.toLocaleString()}행
                </span>
              </div>
            </div>
            {closing?.status === '마감확정' ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                ✓ 이미 마감 확정되었습니다 (v{closing.version})
              </div>
            ) : (
              <button
                disabled={batches.length === 0}
                onClick={async () => {
                  if (batches.length === 0) return toast.error('업로드된 파일이 없습니다.')
                  const { error } = await supabase.from('monthly_closings').upsert({
                    base_month:   baseMonth,
                    status:       '마감확정',
                    total_rows:   totalRows,
                    ok_rows:      okRows,
                    error_rows:   errorRows,
                    confirmed_at: new Date().toISOString(),
                    confirmed_by: 'user',
                    version:      (closing?.version || 0) + 1,
                  }, { onConflict: 'base_month' })
                  if (error) return toast.error(error.message)
                  toast.success(`${baseMonth} 마감이 확정되었습니다.`)
                  loadMonthData()
                }}
                className="btn-primary w-full">
                마감 확정
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
