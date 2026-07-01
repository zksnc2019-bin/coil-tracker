import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { Plus, Search, X } from 'lucide-react'

const STATUS = ['발주중', '작업중', '출고중', '완료', '취소']
const BADGE = { '발주중':'badge-blue','작업중':'badge-yellow','출고중':'badge-yellow','완료':'badge-green','취소':'badge-gray' }

function Modal({ po, vendors, sites, onClose, onSaved }) {
  const isNew = !po?.id
  const [form, setForm] = useState({
    po_number: '', po_date: new Date().toISOString().slice(0,10),
    site_id: '', vendor_id: '', due_date: '', expected_delivery_date: '',
    status: '발주중', memo: '',
    item_name: '', quantity: '', area: '', order_weight: '', unit_price_est: '',
    ...po,
    site_id: po?.site_id ?? '',
    vendor_id: po?.vendor_id ?? '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // 예상금액 자동 계산
  const estAmount = (parseFloat(form.order_weight)||0) * (parseFloat(form.unit_price_est)||0)

  const save = async () => {
    if (!form.site_id || !form.vendor_id || !form.due_date) {
      return toast.error('현장, 업체, 납기일은 필수입니다.')
    }
    const payload = {
      po_date: form.po_date,
      site_id: parseInt(form.site_id),
      vendor_id: parseInt(form.vendor_id),
      due_date: form.due_date,
      expected_delivery_date: form.expected_delivery_date || null,
      status: form.status,
      memo: form.memo,
      item_name: form.item_name || null,
      quantity: form.quantity ? parseInt(form.quantity) : null,
      area: form.area ? parseFloat(form.area) : null,
      order_weight: form.order_weight ? parseFloat(form.order_weight) : null,
      unit_price_est: form.unit_price_est ? parseFloat(form.unit_price_est) : null,
    }

    let err
    if (isNew) {
      const { data: last } = await supabase
        .from('purchase_orders')
        .select('po_number')
        .like('po_number', `PO-${form.po_date.slice(0,7).replace('-','')}-*`)
        .order('po_number', { ascending: false })
        .limit(1)
      const seq = last?.length ? parseInt(last[0].po_number.split('-')[2]) + 1 : 1
      payload.po_number = `PO-${form.po_date.slice(0,7).replace('-','')}-${String(seq).padStart(3,'0')}`
      ;({ error: err } = await supabase.from('purchase_orders').insert(payload))
    } else {
      ;({ error: err } = await supabase.from('purchase_orders').update(payload).eq('id', po.id))
    }
    if (err) return toast.error(err.message)
    toast.success(isNew ? '발주가 등록되었습니다.' : '수정되었습니다.')
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-800">{isNew ? '발주 등록' : '발주 수정'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="space-y-3">
          {/* 날짜 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">발주일 *</label>
              <input type="date" value={form.po_date} onChange={e=>set('po_date',e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">납기일 *</label>
              <input type="date" value={form.due_date} onChange={e=>set('due_date',e.target.value)} className="input" />
            </div>
          </div>

          {/* 현장 / 업체 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">현장 *</label>
              <select value={form.site_id} onChange={e=>set('site_id',e.target.value)} className="select">
                <option value="">선택</option>
                {sites.map(s=><option key={s.id} value={s.id}>{s.site_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">외주업체 *</label>
              <select value={form.vendor_id} onChange={e=>set('vendor_id',e.target.value)} className="select">
                <option value="">선택</option>
                {vendors.map(v=><option key={v.id} value={v.id}>{v.vendor_name}</option>)}
              </select>
            </div>
          </div>

          {/* 품목 */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">품목</label>
            <input value={form.item_name||''} onChange={e=>set('item_name',e.target.value)}
              className="input" placeholder="예) HGI 0.8T×1420W SGHC" />
          </div>

          {/* 수량 / 면적 / 중량 / 예상단가 */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">수량(매)</label>
              <input type="number" value={form.quantity||''} onChange={e=>set('quantity',e.target.value)}
                className="input" min="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">면적(㎡)</label>
              <input type="number" value={form.area||''} onChange={e=>set('area',e.target.value)}
                className="input" step="0.01" min="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">중량(kg)</label>
              <input type="number" value={form.order_weight||''} onChange={e=>set('order_weight',e.target.value)}
                className="input" step="0.001" min="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">예상단가(원/kg)</label>
              <input type="number" value={form.unit_price_est||''} onChange={e=>set('unit_price_est',e.target.value)}
                className="input" step="1" min="0" />
            </div>
          </div>

          {/* 예상금액 자동 표시 */}
          {estAmount > 0 && (
            <div className="bg-blue-50 rounded-lg px-4 py-2 flex items-center justify-between">
              <span className="text-xs text-blue-600">예상금액 (중량 × 단가)</span>
              <span className="text-sm font-bold text-blue-700">{estAmount.toLocaleString()} 원</span>
            </div>
          )}

          {/* 출고예정일 */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">출고예정일</label>
            <input type="date" value={form.expected_delivery_date||''} onChange={e=>set('expected_delivery_date',e.target.value)} className="input" />
          </div>

          {/* 상태 (수정 시만) */}
          {!isNew && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">상태</label>
              <select value={form.status} onChange={e=>set('status',e.target.value)} className="select">
                {STATUS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* 메모 */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">메모</label>
            <textarea value={form.memo||''} onChange={e=>set('memo',e.target.value)} className="input resize-none" rows={2} />
          </div>
        </div>

        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="btn-secondary">취소</button>
          <button onClick={save} className="btn-primary">저장</button>
        </div>
      </div>
    </div>
  )
}

export default function POList() {
  const [rows, setRows] = useState([])
  const [vendors, setVendors] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal] = useState(null)

  const load = async () => {
    setLoading(true)
    let q = supabase
      .from('purchase_orders')
      .select('*')
      .order('po_date', { ascending: false })
    if (filterStatus) q = q.eq('status', filterStatus)
    if (search) q = q.ilike('po_number', `%${search}%`)
    const { data, error } = await q
    if (error) toast.error(error.message)
    else setRows(data)
    setLoading(false)
  }

  useEffect(() => {
    supabase.from('vendors').select('id,vendor_name').eq('is_active',true).order('vendor_name').then(({data})=>setVendors(data||[]))
    supabase.from('sites').select('id,site_name').eq('is_active',true).order('site_name').then(({data})=>setSites(data||[]))
  }, [])

  useEffect(() => { load() }, [search, filterStatus])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">발주관리</h1>
          <p className="text-sm text-gray-500">외주업체 발주 현황을 관리합니다</p>
        </div>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> 발주 등록
        </button>
      </div>

      {/* 필터 */}
      <div className="flex gap-3 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="발주번호 검색" className="input pl-9 w-48" />
        </div>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="select w-36">
          <option value="">전체 상태</option>
          {STATUS.map(s=><option key={s}>{s}</option>)}
        </select>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>발주번호</th><th>발주일</th><th>현장</th><th>외주업체</th>
              <th>품목</th><th>수량(매)</th><th>면적(㎡)</th><th>중량(kg)</th><th>예상단가</th><th>예상금액</th>
              <th>납기일</th><th>출고예정일</th><th>상태</th><th className="w-16">수정</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={14} className="text-center py-10 text-gray-400">로딩중...</td></tr>
              : rows.length === 0
              ? <tr><td colSpan={14} className="text-center py-10 text-gray-400">데이터가 없습니다</td></tr>
              : rows.map(r => {
                const estAmt = (r.order_weight||0) * (r.unit_price_est||0)
                return (
                  <tr key={r.id}>
                    <td className="font-mono text-xs">{r.po_number}</td>
                    <td>{r.po_date}</td>
                    <td>{sites.find(s=>s.id===r.site_id)?.site_name}</td>
                    <td>{vendors.find(v=>v.id===r.vendor_id)?.vendor_name}</td>
                    <td className="text-xs">{r.item_name || '-'}</td>
                    <td className="text-right">{r.quantity?.toLocaleString() ?? '-'}</td>
                    <td className="text-right">{r.area?.toLocaleString() ?? '-'}</td>
                    <td className="text-right">{r.order_weight?.toLocaleString() ?? '-'}</td>
                    <td className="text-right">{r.unit_price_est?.toLocaleString() ?? '-'}</td>
                    <td className="text-right font-medium text-blue-700">{estAmt > 0 ? estAmt.toLocaleString() : '-'}</td>
                    <td>{r.due_date}</td>
                    <td>{r.expected_delivery_date || '-'}</td>
                    <td><span className={BADGE[r.status]}>{r.status}</span></td>
                    <td>
                      <button onClick={()=>setModal(r)} className="text-blue-600 hover:underline text-xs">수정</button>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {modal !== null && (
        <Modal po={modal} vendors={vendors} sites={sites}
          onClose={()=>setModal(null)} onSaved={load} />
      )}
    </div>
  )
}
