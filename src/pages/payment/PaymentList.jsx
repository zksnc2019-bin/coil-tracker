import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { CheckCircle2 } from 'lucide-react'

export default function PaymentList() {
  const [rows, setRows] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(() => {
    const n = new Date(); n.setMonth(n.getMonth()+1)
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`
  })

  useEffect(()=>{
    supabase.from('vendors').select('id,vendor_name,payment_terms').eq('is_active',true).then(({data})=>setVendors(data||[]))
  },[])

  const getVendor = (vendor_id) => vendors.find(v=>v.id===vendor_id)

  const load = async () => {
    setLoading(true)
    const {data,error} = await supabase.from('purchases')
      .select('*')
      .eq('payment_due_month', month)
      .order('vendor_id')
    if (error) toast.error(error.message)
    else setRows(data)
    setLoading(false)
  }

  useEffect(()=>{ load() },[month])

  const markPaid = async (id) => {
    const {error} = await supabase.from('purchases').update({
      is_paid: true, paid_date: new Date().toISOString().slice(0,10),
    }).eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('지급완료 처리되었습니다.')
    load()
  }

  const markAllPaid = async () => {
    const unpaid = rows.filter(r=>!r.is_paid)
    if (!unpaid.length) return toast.error('미지급 항목이 없습니다.')
    const {error} = await supabase.from('purchases').update({
      is_paid: true, paid_date: new Date().toISOString().slice(0,10),
    }).in('id', unpaid.map(r=>r.id))
    if (error) return toast.error(error.message)
    toast.success(`${unpaid.length}건 일괄 지급완료 처리되었습니다.`)
    load()
  }

  // 업체별 집계
  const byVendor = rows.reduce((acc, r) => {
    const key = getVendor(r.vendor_id)?.vendor_name || '미상'
    if (!acc[key]) acc[key] = { total: 0, paid: 0, count: 0 }
    acc[key].total += r.total_amount || 0
    acc[key].paid  += r.is_paid ? (r.total_amount||0) : 0
    acc[key].count++
    return acc
  }, {})

  const grandTotal = rows.reduce((s,r)=>s+(r.total_amount||0),0)
  const paidTotal  = rows.filter(r=>r.is_paid).reduce((s,r)=>s+(r.total_amount||0),0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">지급관리</h1>
          <p className="text-sm text-gray-500">월별 지급예정 현황 및 처리</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="input w-40" />
          <button onClick={markAllPaid} className="btn-primary flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> 일괄 지급완료
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: '지급예정 합계', value: `${grandTotal.toLocaleString()}원`, color: 'text-blue-700' },
          { label: '지급완료', value: `${paidTotal.toLocaleString()}원`, color: 'text-green-600' },
          { label: '미지급', value: `${(grandTotal-paidTotal).toLocaleString()}원`, color: 'text-orange-500' },
        ].map(k=>(
          <div key={k.label} className="card">
            <p className="text-sm text-gray-500">{k.label}</p>
            <p className={`text-xl font-bold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* 업체별 요약 */}
      <div className="card mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">업체별 지급 현황</h3>
        <table className="tbl">
          <thead><tr><th>업체명</th><th>건수</th><th>합계금액</th><th>지급완료</th><th>미지급</th></tr></thead>
          <tbody>
            {Object.entries(byVendor).map(([name,v])=>(
              <tr key={name}>
                <td className="font-medium">{name}</td>
                <td className="text-right">{v.count}</td>
                <td className="text-right font-bold">{v.total.toLocaleString()}</td>
                <td className="text-right text-green-600">{v.paid.toLocaleString()}</td>
                <td className="text-right text-orange-500">{(v.total-v.paid).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 상세 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>소재번호</th><th>업체</th><th>매입일</th><th>세금계산서</th>
              <th>합계금액</th><th>지급예정월</th><th>지급여부</th><th>지급일</th><th>처리</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={9} className="text-center py-10 text-gray-400">로딩중...</td></tr>
              : rows.map(r=>(
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.coil_no}</td>
                  <td>{getVendor(r.vendor_id)?.vendor_name}</td>
                  <td>{r.purchase_date}</td>
                  <td className="text-xs">{r.tax_invoice_no}</td>
                  <td className="text-right font-bold">{r.total_amount?.toLocaleString()}</td>
                  <td>{r.payment_due_month}</td>
                  <td><span className={r.is_paid?'badge-green':'badge-yellow'}>{r.is_paid?'완료':'미지급'}</span></td>
                  <td className="text-sm">{r.paid_date||'-'}</td>
                  <td>
                    {!r.is_paid && (
                      <button onClick={()=>markPaid(r.id)} className="text-xs text-blue-600 hover:underline">
                        지급완료
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
