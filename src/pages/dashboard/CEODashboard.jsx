import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'
import { ClipboardList, Truck, Package, CreditCard, AlertTriangle } from 'lucide-react'

function KpiCard({ icon: Icon, label, value, sub, color='blue' }) {
  const colors = { blue:'bg-blue-50 text-blue-600', green:'bg-green-50 text-green-600', orange:'bg-orange-50 text-orange-600', red:'bg-red-50 text-red-600' }
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function CEODashboard() {
  const [kpi, setKpi] = useState({})
  const [poByStatus, setPoByStatus] = useState([])
  const [monthlyPurchase, setMonthlyPurchase] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    const load = async () => {
      const now = new Date()
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
      const nextMonth = `${now.getFullYear()}-${String(now.getMonth()+2).padStart(2,'0')}`

      const [
        { count: totalPO },
        { count: activePO },
        { count: overdueCount },
        { data: invAgg },
        { data: thisMonthAgg },
        { data: paymentAgg },
        { data: poStatus },
      ] = await Promise.all([
        supabase.from('purchase_orders').select('*',{count:'exact',head:true}),
        supabase.from('purchase_orders').select('*',{count:'exact',head:true}).not('status','in','("완료","취소")'),
        supabase.from('purchase_orders').select('*',{count:'exact',head:true}).lt('due_date',now.toISOString().slice(0,10)).not('status','in','("완료","취소")'),
        supabase.from('inventories').select('current_weight'),
        supabase.from('purchases').select('total_amount').eq('payment_due_month',thisMonth),
        supabase.from('purchases').select('total_amount').eq('payment_due_month',thisMonth).eq('is_paid',false),
        supabase.from('purchase_orders').select('status'),
      ])

      const totalInventory = (invAgg||[]).reduce((s,r)=>s+(r.current_weight||0),0)
      const monthAmount = (thisMonthAgg||[]).reduce((s,r)=>s+(r.total_amount||0),0)
      const paymentDue = (paymentAgg||[]).reduce((s,r)=>s+(r.total_amount||0),0)

      // 상태별 집계
      const statusMap = {}
      ;(poStatus||[]).forEach(r=>{ statusMap[r.status]=(statusMap[r.status]||0)+1 })
      setPoByStatus(Object.entries(statusMap).map(([status,count])=>({status,count})))

      // 최근 6개월 매입 추이
      const months = []
      for (let i=5; i>=0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth()-i, 1)
        const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
        const { data: mData } = await supabase.from('purchases').select('total_amount').eq('payment_due_month',m)
        months.push({ month: m.slice(5), amount: (mData||[]).reduce((s,r)=>s+(r.total_amount||0),0) })
      }
      setMonthlyPurchase(months)

      setKpi({ totalPO, activePO, overdueCount, totalInventory, monthAmount, paymentDue })
      setLoading(false)
    }
    load()
  },[])

  if (loading) return <div className="p-6 text-gray-400">로딩중...</div>

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800">대표 Dashboard</h1>
        <p className="text-sm text-gray-500">외주 판재 추적관리 종합 현황</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <KpiCard icon={ClipboardList} label="전체 발주" value={kpi.totalPO} sub={`진행중 ${kpi.activePO}건`} color="blue" />
        <KpiCard icon={AlertTriangle} label="납기 초과" value={kpi.overdueCount} sub="처리 필요" color="red" />
        <KpiCard icon={Package} label="전체 재고" value={`${(kpi.totalInventory||0).toLocaleString()} kg`} color="green" />
        <KpiCard icon={CreditCard} label="이번달 매입" value={`${(kpi.monthAmount||0).toLocaleString()}원`} color="blue" />
        <KpiCard icon={CreditCard} label="이번달 미지급" value={`${(kpi.paymentDue||0).toLocaleString()}원`} color="orange" />
        <KpiCard icon={Truck} label="진행중 발주" value={kpi.activePO} color="green" />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">발주 상태별 현황</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={poByStatus}>
              <XAxis dataKey="status" tick={{fontSize:12}} />
              <YAxis tick={{fontSize:12}} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">최근 6개월 매입 추이</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyPurchase}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{fontSize:12}} />
              <YAxis tick={{fontSize:10}} tickFormatter={v=>`${(v/10000).toFixed(0)}만`} />
              <Tooltip formatter={v=>`${v.toLocaleString()}원`} />
              <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} dot={{r:4}} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
