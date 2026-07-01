import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { CreditCard, CheckCircle2, Clock, TrendingUp } from 'lucide-react'

const COLORS = ['#3b82f6','#ef4444','#f59e0b','#10b981']

export default function FinanceDashboard() {
  const [kpi, setKpi] = useState({})
  const [monthlyData, setMonthlyData] = useState([])
  const [vendorShare, setVendorShare] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    const load = async () => {
      const now = new Date()
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
      const nextMonth = `${now.getFullYear()}-${String(now.getMonth()+2).padStart(2,'0')}`

      const [
        { data: allPurchases },
        { data: thisMonthPurchases },
        { data: nextMonthPurchases },
        { data: vendorData },
      ] = await Promise.all([
        supabase.from('purchases').select('total_amount,is_paid,payment_due_month'),
        supabase.from('purchases').select('total_amount,is_paid').eq('payment_due_month',thisMonth),
        supabase.from('purchases').select('total_amount,is_paid').eq('payment_due_month',nextMonth),
        supabase.from('purchases').select('total_amount,vendors(vendor_name)'),
      ])

      const totalAll = (allPurchases||[]).reduce((s,r)=>s+(r.total_amount||0),0)
      const totalPaid = (allPurchases||[]).filter(r=>r.is_paid).reduce((s,r)=>s+(r.total_amount||0),0)
      const thisTotal = (thisMonthPurchases||[]).reduce((s,r)=>s+(r.total_amount||0),0)
      const thisPaid = (thisMonthPurchases||[]).filter(r=>r.is_paid).reduce((s,r)=>s+(r.total_amount||0),0)
      const nextTotal = (nextMonthPurchases||[]).reduce((s,r)=>s+(r.total_amount||0),0)

      setKpi({ totalAll, totalPaid, totalUnpaid: totalAll-totalPaid, thisTotal, thisPaid, thisUnpaid: thisTotal-thisPaid, nextTotal })

      // 최근 6개월 지급/미지급
      const months = []
      for (let i=5; i>=0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth()-i, 1)
        const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
        const { data: mData } = await supabase.from('purchases').select('total_amount,is_paid').eq('payment_due_month',m)
        const total = (mData||[]).reduce((s,r)=>s+(r.total_amount||0),0)
        const paid = (mData||[]).filter(r=>r.is_paid).reduce((s,r)=>s+(r.total_amount||0),0)
        months.push({ month: m.slice(5), 지급완료: paid, 미지급: total-paid })
      }
      setMonthlyData(months)

      // 업체별 매입 비율
      const vMap = {}
      ;(vendorData||[]).forEach(r=>{ const n=r.vendors?.vendor_name||'기타'; vMap[n]=(vMap[n]||0)+(r.total_amount||0) })
      setVendorShare(Object.entries(vMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,value])=>({name,value})))

      setLoading(false)
    }
    load()
  },[])

  if (loading) return <div className="p-6 text-gray-400">로딩중...</div>

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const nextMonth = `${now.getFullYear()}-${String(now.getMonth()+2).padStart(2,'0')}`

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800">재무 Dashboard</h1>
        <p className="text-sm text-gray-500">매입·지급 현황 종합 분석</p>
      </div>

      {/* 이번달 / 다음달 요약 */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: `${thisMonth} 지급예정`, value: kpi.thisTotal, color:'blue' },
          { label: `${thisMonth} 지급완료`, value: kpi.thisPaid, color:'green' },
          { label: `${thisMonth} 미지급`, value: kpi.thisUnpaid, color:'orange' },
        ].map(k=>(
          <div key={k.label} className="card">
            <p className="text-sm text-gray-500">{k.label}</p>
            <p className={`text-xl font-bold mt-1 ${k.color==='green'?'text-green-600':k.color==='orange'?'text-orange-500':'text-blue-700'}`}>
              {(k.value||0).toLocaleString()}원
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card col-span-2 flex items-center gap-6">
          <div className="flex-1">
            <p className="text-sm text-gray-500">누계 매입 총액</p>
            <p className="text-2xl font-bold text-gray-800">{(kpi.totalAll||0).toLocaleString()}원</p>
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-500">누계 지급완료</p>
            <p className="text-xl font-bold text-green-600">{(kpi.totalPaid||0).toLocaleString()}원</p>
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-500">누계 미지급</p>
            <p className="text-xl font-bold text-red-500">{(kpi.totalUnpaid||0).toLocaleString()}원</p>
          </div>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">{nextMonth} 예정 지급액</p>
          <p className="text-xl font-bold text-purple-600 mt-1">{(kpi.nextTotal||0).toLocaleString()}원</p>
          <p className="text-xs text-gray-400 mt-1">다음달 예상 지급</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">월별 지급 현황 (6개월)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <XAxis dataKey="month" tick={{fontSize:12}} />
              <YAxis tick={{fontSize:10}} tickFormatter={v=>`${(v/10000).toFixed(0)}만`} />
              <Tooltip formatter={v=>`${v.toLocaleString()}원`} />
              <Bar dataKey="지급완료" stackId="a" fill="#10b981" radius={[0,0,0,0]} />
              <Bar dataKey="미지급" stackId="a" fill="#f59e0b" radius={[4,4,0,0]} />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">업체별 매입 비율 (TOP 5)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={vendorShare} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                {vendorShare.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v=>`${v.toLocaleString()}원`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
