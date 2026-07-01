import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { Plus, Search, X, Upload } from 'lucide-react'

function Modal({ row, vendors, orders, onClose, onSaved }) {
  const isNew = !row?.id
  const [form, setForm] = useState({
    coil_no: '', po_id: '', vendor_id: '', material: 'SGHC',
    thickness: '', width: '', coil_weight: '', work_spec: '',
    work_weight: '', work_date: new Date().toISOString().slice(0,10), memo: '',
    ...row,
    po_id: row?.po_id ?? '',
    vendor_id: row?.vendor_id ?? '',
  })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const save = async () => {
    if (!form.coil_no || !form.thickness || !form.width || !form.work_weight) {
      return toast.error('소재번호, 두께, 폭, 작업중량은 필수입니다.')
    }
    if (isNew) {
      const { data: ex } = await supabase.from('work_orders').select('id').eq('coil_no', form.coil_no).single()
      if (ex) return toast.error(`소재번호 '${form.coil_no}'가 이미 존재합니다.`)
    }
    const payload = {
      coil_no: form.coil_no.trim().toUpperCase(),
      po_id: form.po_id ? parseInt(form.po_id) : null,
      vendor_id: form.vendor_id ? parseInt(form.vendor_id) : null,
      material: form.material, thickness: parseFloat(form.thickness),
      width: parseFloat(form.width), coil_weight: parseFloat(form.coil_weight||0),
      work_spec: form.work_spec, work_weight: parseFloat(form.work_weight),
      work_date: form.work_date, memo: form.memo,
    }
    let err
    if (isNew) {
      ;({ error: err } = await supabase.from('work_orders').insert(payload))
      if (!err) {
        // 재고 자동 생성
        await supabase.from('inventories').upsert({
          coil_no: payload.coil_no, current_weight: payload.work_weight,
        }, { onConflict: 'coil_no' })
      }
    } else {
      ;({ error: err } = await supabase.from('work_orders').update(payload).eq('id', row.id))
    }
    if (err) return toast.error(err.message)
    toast.success(isNew ? '작업내역이 등록되었습니다.' : '수정되었습니다.')
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-800">{isNew ? '작업내역 등록' : '작업내역 수정'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">소재번호 (Coil No.) *</label>
            <input value={form.coil_no} onChange={e=>set('coil_no',e.target.value.toUpperCase())}
              className="input font-mono" placeholder="예) CGZ1420B" disabled={!isNew} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">발주</label>
              <select value={form.po_id} onChange={e=>set('po_id',e.target.value)} className="select">
                <option value="">선택</option>
                {orders.map(o=><option key={o.id} value={o.id}>{o.po_number}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">외주업체</label>
              <select value={form.vendor_id} onChange={e=>set('vendor_id',e.target.value)} className="select">
                <option value="">선택</option>
                {vendors.map(v=><option key={v.id} value={v.id}>{v.vendor_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">재질</label>
              <input value={form.material} onChange={e=>set('material',e.target.value)} className="input" placeholder="SGHC" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">두께(mm) *</label>
              <input type="number" value={form.thickness} onChange={e=>set('thickness',e.target.value)} className="input" step="0.01" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">폭(mm) *</label>
              <input type="number" value={form.width} onChange={e=>set('width',e.target.value)} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">코일중량(kg)</label>
              <input type="number" value={form.coil_weight} onChange={e=>set('coil_weight',e.target.value)} className="input" step="0.001" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">작업규격</label>
              <input value={form.work_spec||''} onChange={e=>set('work_spec',e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">작업중량(kg) *</label>
              <input type="number" value={form.work_weight} onChange={e=>set('work_weight',e.target.value)} className="input" step="0.001" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">작업일</label>
            <input type="date" value={form.work_date} onChange={e=>set('work_date',e.target.value)} className="input" />
          </div>
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

export default function WorkOrderList() {
  const [rows, setRows] = useState([])
  const [vendors, setVendors] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)

  const [invMap, setInvMap] = useState({})

  const load = async () => {
    setLoading(true)
    let q = supabase.from('work_orders')
      .select('*')
      .order('work_date', { ascending: false })
    if (search) q = q.ilike('coil_no', `%${search}%`)
    const { data, error } = await q
    if (error) toast.error(error.message)
    else {
      setRows(data)
      // 재고 별도 조회
      if (data?.length) {
        const coilNos = data.map(r=>r.coil_no)
        const { data: invs } = await supabase.from('inventories').select('coil_no,current_weight').in('coil_no', coilNos)
        const m = {}
        invs?.forEach(i => { m[i.coil_no] = i.current_weight })
        setInvMap(m)
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    supabase.from('vendors').select('id,vendor_name').eq('is_active',true).then(({data})=>setVendors(data||[]))
    supabase.from('purchase_orders').select('id,po_number').order('po_number',{ascending:false}).limit(50).then(({data})=>setOrders(data||[]))
  }, [])

  useEffect(() => { load() }, [search])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">작업내역</h1>
          <p className="text-sm text-gray-500">소재번호(Coil No.) 기준 작업 이력</p>
        </div>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> 작업 등록
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="소재번호 검색" className="input pl-9 w-52" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>소재번호</th><th>재질</th><th>두께</th><th>폭</th>
              <th>코일중량</th><th>작업중량</th><th>잔량</th>
              <th>작업일</th><th>업체</th><th>발주번호</th><th className="w-16">수정</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={11} className="text-center py-10 text-gray-400">로딩중...</td></tr>
              : rows.map(r=>(
                <tr key={r.id}>
                  <td className="font-mono text-xs font-semibold text-blue-700">{r.coil_no}</td>
                  <td>{r.material}</td>
                  <td className="text-right">{r.thickness}</td>
                  <td className="text-right">{r.width}</td>
                  <td className="text-right">{r.coil_weight?.toLocaleString()}</td>
                  <td className="text-right font-medium">{r.work_weight?.toLocaleString()}</td>
                  <td className={`text-right font-bold ${(invMap[r.coil_no]||0)<=0?'text-red-500':'text-green-600'}`}>
                    {invMap[r.coil_no]?.toLocaleString() ?? '-'}
                  </td>
                  <td>{r.work_date}</td>
                  <td>{vendors.find(v=>v.id===r.vendor_id)?.vendor_name}</td>
                  <td className="text-xs text-gray-500">{orders.find(o=>o.id===r.po_id)?.po_number}</td>
                  <td>
                    <button onClick={()=>setModal(r)} className="text-blue-600 hover:underline text-xs">수정</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {modal !== null && (
        <Modal row={modal} vendors={vendors} orders={orders}
          onClose={()=>setModal(null)} onSaved={load} />
      )}
    </div>
  )
}
