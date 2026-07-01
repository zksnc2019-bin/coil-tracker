import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { Plus, Search, X } from 'lucide-react'

function Modal({ row, sites, onClose, onSaved }) {
  const isNew = !row?.id
  const [form, setForm] = useState({
    coil_no:'', site_id:'', delivery_date: new Date().toISOString().slice(0,10),
    delivery_weight:'', delivery_qty:'',
    carrier_name:'', vehicle_no:'', driver_name:'', driver_phone:'', memo:'',
    ...row, site_id: row?.site_id??'',
  })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const save = async () => {
    if (!form.coil_no || !form.delivery_weight || !form.site_id) return toast.error('소재번호, 현장, 출고중량은 필수입니다.')
    const coilNo = form.coil_no.trim().toUpperCase()

    // 재고 확인
    const { data: inv } = await supabase.from('inventories').select('current_weight').eq('coil_no', coilNo).single()
    const available = inv?.current_weight ?? 0
    if (parseFloat(form.delivery_weight) > available) {
      return toast.error(`재고 부족 (잔량: ${available.toLocaleString()} kg)`)
    }

    // packing_no 채번
    const prefix = `PK-${form.delivery_date.slice(0,7).replace('-','')}-`
    const { data: last } = await supabase.from('deliveries').select('packing_no')
      .like('packing_no', `${prefix}*`).order('packing_no',{ascending:false}).limit(1)
    const seq = last?.length ? parseInt(last[0].packing_no.split('-')[2])+1 : 1
    const packingNo = `${prefix}${String(seq).padStart(3,'0')}`

    const payload = {
      packing_no: packingNo, coil_no: coilNo, site_id: parseInt(form.site_id),
      delivery_date: form.delivery_date, delivery_weight: parseFloat(form.delivery_weight),
      delivery_qty: parseInt(form.delivery_qty||1),
      carrier_name: form.carrier_name, vehicle_no: form.vehicle_no,
      driver_name: form.driver_name, driver_phone: form.driver_phone, memo: form.memo,
    }
    const { error } = await supabase.from('deliveries').insert(payload)
    if (error) return toast.error(error.message)

    // 재고 차감
    await supabase.from('inventories').update({
      current_weight: available - parseFloat(form.delivery_weight),
      last_updated: new Date().toISOString(),
    }).eq('coil_no', coilNo)

    toast.success('출고가 등록되었습니다.')
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-800">출고 등록</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">소재번호 *</label>
            <input value={form.coil_no} onChange={e=>set('coil_no',e.target.value.toUpperCase())} className="input font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">출고일 *</label>
              <input type="date" value={form.delivery_date} onChange={e=>set('delivery_date',e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">현장 *</label>
              <select value={form.site_id} onChange={e=>set('site_id',e.target.value)} className="select">
                <option value="">선택</option>
                {sites.map(s=><option key={s.id} value={s.id}>{s.site_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">출고중량(kg) *</label>
              <input type="number" value={form.delivery_weight} onChange={e=>set('delivery_weight',e.target.value)} className="input" step="0.001" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">출고수량(매)</label>
              <input type="number" value={form.delivery_qty} onChange={e=>set('delivery_qty',e.target.value)} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">운송사</label>
              <input value={form.carrier_name||''} onChange={e=>set('carrier_name',e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">차량번호</label>
              <input value={form.vehicle_no||''} onChange={e=>set('vehicle_no',e.target.value)} className="input" />
            </div>
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

export default function DeliveryList() {
  const [rows, setRows] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)

  const load = async () => {
    setLoading(true)
    let q = supabase.from('deliveries')
      .select('*')
      .order('delivery_date',{ascending:false})
    if (search) q = q.ilike('coil_no',`%${search}%`)
    const { data, error } = await q
    if (error) toast.error(error.message)
    else setRows(data)
    setLoading(false)
  }

  useEffect(()=>{
    supabase.from('sites').select('id,site_name').eq('is_active',true).then(({data})=>setSites(data||[]))
  },[])

  useEffect(()=>{ load() },[search])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">출고관리</h1>
          <p className="text-sm text-gray-500">현장별 판재 출고 이력</p>
        </div>
        <button onClick={()=>setModal({})} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> 출고 등록
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
              <th>Packing No.</th><th>소재번호</th><th>출고일</th><th>현장</th>
              <th>출고중량(kg)</th><th>수량</th><th>운송사</th><th>차량번호</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">로딩중...</td></tr>
              : rows.map(r=>(
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.packing_no}</td>
                  <td className="font-mono text-xs font-semibold text-blue-700">{r.coil_no}</td>
                  <td>{r.delivery_date}</td>
                  <td>{sites.find(s=>s.id===r.site_id)?.site_name}</td>
                  <td className="text-right font-medium">{r.delivery_weight?.toLocaleString()}</td>
                  <td className="text-right">{r.delivery_qty}</td>
                  <td>{r.carrier_name}</td>
                  <td>{r.vehicle_no}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {modal !== null && (
        <Modal row={modal} sites={sites} onClose={()=>setModal(null)} onSaved={load} />
      )}
    </div>
  )
}
