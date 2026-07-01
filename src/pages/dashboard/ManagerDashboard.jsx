import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Package, Truck, ClipboardCheck, AlertCircle } from 'lucide-react'

export default function ManagerDashboard() {
  const [kpi, setKpi] = useState({})
  const [inventoryTop, setInventoryTop] = useState([])
  const [siteDelivery, setSiteDelivery] = useState([])
  const [recentDeliveries, setRecentDeliveries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    const load = async () => {
      const [
        { count: totalCoils },
        { count: activeInv },
        { count: pendingPO },
        { count: todayDeliveries },
        { data: invTop },
        { data: deliveries },
        { data: recent },
      ] = await Promise.all([
        supabase.from('inventories').select('*',{count:'exact',head:true}),
        supabase.from('inventories').select('*',{count:'exact',head:true}).gt('current_weight',0),
        supabase.from('purchase_orders').select('*',{count:'exact',head:true}).not('status','in','("완료","취소")'),
        supabase.from('deliveries').select('*',{count:'exact',head:true}).eq('delivery_date', new Date().toISOString().slice(0,10)),
        supabase.from('inventories').select('coil_no,current_weight').gt('current_weight',0).order('current_weight',{ascending:false}).limit(10),
        supabase.from('deliveries').select('sites(site_name),delivery_weight').not('site_id','is',null),
        supabase.from('deliveries').select('packing_no,coil_no,delivery_date,delivery_weight,sites(site_name)').order('delivery_date',{ascending:false}).limit(10),
      ])

      // 현장별 출고 집계
      const siteMap = {}
      ;(deliveries||[]).forEach(r=>{ const n=r.sites?.site_name||'미상'; siteMap[n]=(siteMap[n]||0)+(r.delivery_weight||0) })
      setSiteDelivery(Object.entries(siteMap).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,weight])=>({name,weight})))

      setKpi({ totalCoils, activeInv, pendingPO, todayDeliveries })
      setInventoryTop(invTop||[])
      setRecentDeliveries(recent||[])
      setLoading(false)
    }
    load()
  },[])

  if (loading) return <div className="p-6 text-gray-400">로딩중...</div>

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800">관리자 Dashboard</h1>
        <p className="text-sm text-gray-500">재고·출고·발주 운영 현황</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { icon: Package, label: '전체 코일 수', value: kpi.totalCoils, sub: `잔량 보유 ${kpi.activeInv}개`, color:'blue' },
          { icon: ClipboardCheck, label: '진행중 발주', value: kpi.pendingPO, sub: '처리 필요', color:'orange' },
          { icon: Truck, label: '오늘 출고', value: kpi.todayDeliveries, sub: '건', color:'green' },
          { icon: AlertCircle, label: '재고 소진', value: (kpi.totalCoils||0)-(kpi.activeInv||0), sub: '코일', color:'red' },
        ].map(k=>(
          <div key={k.label} className="card flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              k.color==='blue'?'bg-blue-50 text-blue-600':
              k.color==='green'?'bg-green-50 text-green-600':
              k.color==='orange'?'bg-orange-50 text-orange-500':
              'bg-red-50 text-red-500'
            }`}>
              <k.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500">{k.label}</p>
              <p className="text-2xl font-bold text-gray-800">{k.value}</p>
              <p className="text-xs text-gray-400">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5 mb-5">
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">현장별 출고 중량 (kg)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={siteDelivery} layout="vertical">
              <XAxis type="number" tick={{fontSize:11}} tickFormatter={v=>v.toLocaleString()} />
              <YAxis type="category" dataKey="name" tick={{fontSize:12}} width={80} />
              <Tooltip formatter={v=>`${v.toLocaleString()} kg`} />
              <Bar dataKey="weight" fill="#3b82f6" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">잔량 TOP 10 코일</h3>
          <div className="space-y-2">
            {inventoryTop.map((r,i)=>(
              <div key={r.coil_no} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-4">{i+1}</span>
                <span className="font-mono text-xs text-blue-700 flex-1">{r.coil_no}</span>
                <div className="w-24 bg-gray-100 rounded-full h-1.5">
                  <div className="bg-green-500 h-1.5 rounded-full" style={{width:`${Math.min((r.current_weight/inventoryTop[0]?.current_weight)*100,100)}%`}} />
                </div>
                <span className="text-xs font-semibold text-gray-700 w-20 text-right">{r.current_weight?.toLocaleString()} kg</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">최근 출고 이력</h3>
        <table className="tbl">
          <thead><tr><th>Packing No.</th><th>소재번호</th><th>출고일</th><th>현장</th><th>출고중량</th></tr></thead>
          <tbody>
            {recentDeliveries.map(r=>(
              <tr key={r.packing_no}>
                <td className="font-mono text-xs">{r.packing_no}</td>
                <td className="font-mono text-xs text-blue-700">{r.coil_no}</td>
                <td>{r.delivery_date}</td>
                <td>{r.sites?.site_name}</td>
                <td className="text-right font-medium">{r.delivery_weight?.toLocaleString()} kg</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
