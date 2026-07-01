import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { Plus, Search, X } from 'lucide-react'

function Modal({ row, vendors, onClose, onSaved }) {
  const isNew = !row?.id
  const [form, setForm] = useState({
    coil_no:'', vendor_id:'', purchase_date: new Date().toISOString().slice(0,10),
    unit_price:'', supply_amount:'', tax_amount:'', total_amount:'',
    tax_invoice_no:'', memo:'',
    ...row, vendor_id: row?.vendor_id??'',
  })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  // 공급가액 변경 시 세액/합계 자동 계산
  const onSupplyChange = (v) => {
    const supply = parseFloat(v)||0
    const tax = Math.round(supply*0.1)
    setForm(f=>({...f, supply_amount:v, tax_amount:String(tax), total_amount:String(supply+tax)}))
  }

  // 지급예정월: 매입월 익월
  const paymentDueMonth = (date) => {
    const d = new Date(date)
    d.setMonth(d.getMonth()+1)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  }

  const save = async () => {
    if (!form.coil_no || !form.vendor_id || !form.total_amount) return toast.error('소재번호, 업체, 금액은 필수입니다.')
    const payload = {
      coil_no: form.coil_no.trim().toUpperCase(),
      vendor_id: parseInt(form.vendor_id),
      purchase_date: form.purchase_date,
      unit_price: parseFloat(form.unit_price||0),
      supply_amount: parseFloat(form.supply_amount||0),
      tax_amount: parseFloat(form.tax_amount||0),
      total_amount: parseFloat(form.total_amount),
      tax_invoice_no: form.tax_invoice_no,
      payment_due_month: paymentDueMonth(form.purchase_date),
      memo: form.memo,
    }
    const fn = isNew
      ? supabase.from('purchases').insert(payload)
      : supabase.from('purchases').update(payload).eq('id', row.id)
    const {error} = await fn
    if (error) return toast.error(error.message)
    toast.success(isNew ? '매입이 등록되었습니다.' : '수정되었습니다.')
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-800">{isNew ? '매입 등록' : '매입 수정'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">소재번호 *</label>
            <input value={form.coil_no} onChange={e=>set('coil_no',e.target.value.toUpperCase())} className="input font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">매입일 *</label>
              <input type="date" value={form.purchase_date} onChange={e=>set('purchase_date',e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">지급예정월 (자동)</label>
              <input value={paymentDueMonth(form.purchase_date)} readOnly className="input bg-gray-50 text-gray-500" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">외주업체 *</label>
            <select value={form.vendor_id} onChange={e=>set('vendor_id',e.target.value)} className="select">
              <option value="">선택</option>
              {vendors.map(v=><option key={v.id} value={v.id}>{v.vendor_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">단가(원/kg)</label>
              <input type="number" value={form.unit_price} onChange={e=>set('unit_price',e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">공급가액 *</label>
              <input type="number" value={form.supply_amount} onChange={e=>onSupplyChange(e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">세액 (자동)</label>
              <input type="number" value={form.tax_amount} onChange={e=>set('tax_amount',e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">합계금액 *</label>
            <input type="number" value={form.total_amount} onChange={e=>set('total_amount',e.target.value)} className="input font-bold" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">세금계산서 번호</label>
            <input value={form.tax_invoice_no||''} onChange={e=>set('tax_invoice_no',e.target.value)} className="input" />
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

export default function PurchaseList() {
  const [rows, setRows] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState('')
  const [modal, setModal] = useState(null)

  const load = async () => {
    setLoading(true)
    let q = supabase.from('purchases')
      .select('*')
      .order('purchase_date',{ascending:false})
    if (search) q = q.ilike('coil_no',`%${search}%`)
    if (month) q = q.eq('payment_due_month', month)
    const {data,error} = await q
    if (error) toast.error(error.message)
    else setRows(data)
    setLoading(false)
  }

  useEffect(()=>{
    supabase.from('vendors').select('id,vendor_name').eq('is_active',true).then(({data})=>setVendors(data||[]))
  },[])
  useEffect(()=>{ load() },[search,month])

  const totalAmount = rows.reduce((s,r)=>s+(r.total_amount||0),0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">매입관리</h1>
          <p className="text-sm text-gray-500">세금계산서 및 지급예정 관리</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="card py-2 px-4">
            <p className="text-xs text-gray-500">조회 합계</p>
            <p className="text-lg font-bold text-blue-700">{totalAmount.toLocaleString()}원</p>
          </div>
          <button onClick={()=>setModal({})} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> 매입 등록
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="소재번호 검색" className="input pl-9 w-48" />
        </div>
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="input w-40" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>소재번호</th><th>매입일</th><th>업체</th><th>단가</th>
              <th>공급가액</th><th>세액</th><th>합계</th>
              <th>세금계산서</th><th>지급예정월</th><th>지급여부</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={10} className="text-center py-10 text-gray-400">로딩중...</td></tr>
              : rows.map(r=>(
                <tr key={r.id}>
                  <td className="font-mono text-xs font-semibold text-blue-700 cursor-pointer" onClick={()=>setModal(r)}>{r.coil_no}</td>
                  <td>{r.purchase_date}</td>
                  <td>{vendors.find(v=>v.id===r.vendor_id)?.vendor_name}</td>
                  <td className="text-right">{r.unit_price?.toLocaleString()}</td>
                  <td className="text-right">{r.supply_amount?.toLocaleString()}</td>
                  <td className="text-right">{r.tax_amount?.toLocaleString()}</td>
                  <td className="text-right font-bold">{r.total_amount?.toLocaleString()}</td>
                  <td className="text-xs">{r.tax_invoice_no}</td>
                  <td>{r.payment_due_month}</td>
                  <td>
                    <span className={r.is_paid ? 'badge-green' : 'badge-yellow'}>
                      {r.is_paid ? '완료' : '미지급'}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {modal !== null && (
        <Modal row={modal} vendors={vendors} onClose={()=>setModal(null)} onSaved={load} />
      )}
    </div>
  )
}
