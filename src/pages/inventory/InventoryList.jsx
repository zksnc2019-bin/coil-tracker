import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { Search, RefreshCw } from 'lucide-react'

export default function InventoryList() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterEmpty, setFilterEmpty] = useState(false)

  const [workOrderMap, setWorkOrderMap] = useState({})

  const load = async () => {
    setLoading(true)
    let q = supabase.from('inventories')
      .select('*')
      .order('last_updated',{ascending:false})
    if (search) q = q.ilike('coil_no',`%${search}%`)
    if (filterEmpty) q = q.gt('current_weight',0)
    const {data,error} = await q
    if (error) { toast.error(error.message); setLoading(false); return }
    setRows(data || [])
    // load work_orders for coil details
    if (data?.length) {
      const coilNos = data.map(r => r.coil_no)
      const { data: wos } = await supabase.from('work_orders').select('coil_no,material,thickness,width,work_weight,vendor_id').in('coil_no', coilNos)
      const m = {}
      wos?.forEach(w => { m[w.coil_no] = w })
      setWorkOrderMap(m)
    }
    setLoading(false)
  }

  useEffect(()=>{ load() },[search,filterEmpty])

  const totalWeight = rows.reduce((s,r)=>s+(r.current_weight||0),0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">재고현황</h1>
          <p className="text-sm text-gray-500">소재번호별 잔량 현황 (자동 계산)</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="card py-2 px-4">
            <p className="text-xs text-gray-500">전체 잔량</p>
            <p className="text-lg font-bold text-blue-700">{totalWeight.toLocaleString()} kg</p>
          </div>
          <button onClick={load} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> 새로고침
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="소재번호 검색" className="input pl-9 w-52" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filterEmpty} onChange={e=>setFilterEmpty(e.target.checked)} />
          잔량 있는 것만
        </label>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>소재번호</th><th>재질</th><th>두께</th><th>폭</th>
              <th>작업중량(kg)</th><th>잔량(kg)</th><th>소진율</th>
              <th>보관업체</th><th>최종수정일</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={9} className="text-center py-10 text-gray-400">로딩중...</td></tr>
              : rows.map(r=>{
                const wo = workOrderMap[r.coil_no] || {}
                const workWeight = wo.work_weight || 0
                const consumed = workWeight > 0 ? ((workWeight - r.current_weight) / workWeight * 100).toFixed(1) : 0
                return (
                  <tr key={r.id}>
                    <td className="font-mono text-xs font-semibold text-blue-700">{r.coil_no}</td>
                    <td>{wo.material || '-'}</td>
                    <td className="text-right">{wo.thickness || '-'}</td>
                    <td className="text-right">{wo.width || '-'}</td>
                    <td className="text-right">{workWeight.toLocaleString()}</td>
                    <td className={`text-right font-bold ${r.current_weight<=0?'text-red-500':r.current_weight<100?'text-orange-500':'text-green-600'}`}>
                      {r.current_weight?.toLocaleString()}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{width:`${Math.min(consumed,100)}%`}} />
                        </div>
                        <span className="text-xs text-gray-500 w-10">{consumed}%</span>
                      </div>
                    </td>
                    <td>-</td>
                    <td className="text-xs text-gray-500">{r.last_updated?.slice(0,10)}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
