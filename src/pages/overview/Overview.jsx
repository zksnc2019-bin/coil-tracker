import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BarChart3, Package, Truck, ClipboardList, TrendingUp } from 'lucide-react'

const fmt = (n, d = 0) =>
  n != null ? parseFloat(n).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-'

function StatCard({ label, value, sub, icon: Icon, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600 border-blue-200',
    green:  'bg-green-50 text-green-600 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    red:    'bg-red-50 text-red-600 border-red-200',
  }
  return (
    <div className={`card border ${colors[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <Icon className="w-4 h-4 opacity-60" />
      </div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function Overview() {
  const [stats, setStats] = useState(null)
  const [recentPos, setRecentPos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: pos }, { data: items }] = await Promise.all([
        supabase.from('purchase_orders').select('id, status, po_date, due_date'),
        supabase.from('purchase_order_items').select('est_weight, est_amount, est_qty'),
      ])

      const totalPos   = pos?.length ?? 0
      const activePos  = pos?.filter(p => !['완료','입고완료','취소'].includes(p.status)).length ?? 0
      const latePos    = pos?.filter(p => p.status === '납기지연').length ?? 0
      const totalWt    = items?.reduce((s, it) => s + (parseFloat(it.est_weight) || 0), 0) ?? 0
      const totalAmt   = items?.reduce((s, it) => s + (parseFloat(it.est_amount) || 0), 0) ?? 0

      setStats({ totalPos, activePos, latePos, totalWt, totalAmt })

      // 최근 발주 5건
      const { data: recent } = await supabase
        .from('purchase_orders')
        .select('id, po_number, po_date, status, vendor_id, site_id')
        .order('created_at', { ascending: false })
        .limit(5)
      setRecentPos(recent || [])
      setLoading(false)
    }
    load()
  }, [])

  const BADGE = {
    '임시저장': 'badge-gray', '발주완료': 'badge-blue', '입고예정': 'badge-blue',
    '일부입고': 'badge-yellow', '입고완료': 'badge-green', '납기지연': 'badge-red', '취소': 'badge-gray',
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">통합현황</h1>
        <p className="text-sm text-gray-500">판재·원자재 발주 종합 현황</p>
      </div>

      {loading ? (
        <p className="text-center py-20 text-gray-400">로딩중...</p>
      ) : (
        <>
          {/* 통계 카드 */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard label="전체 발주" value={fmt(stats.totalPos)} sub="건" icon={ClipboardList} color="blue" />
            <StatCard label="진행중 발주" value={fmt(stats.activePos)} sub="건" icon={TrendingUp} color="yellow" />
            <StatCard label="납기지연" value={fmt(stats.latePos)} sub="건" icon={Truck} color="red" />
            <StatCard label="예상 총금액"
              value={stats.totalAmt > 0 ? Math.round(stats.totalAmt / 10000).toLocaleString() + '만' : '-'}
              sub="원" icon={Package} color="green" />
          </div>

          {/* 최근 발주 */}
          <div className="card">
            <h2 className="text-sm font-bold text-gray-700 mb-3">최근 발주 5건</h2>
            {recentPos.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">발주 내역이 없습니다.</p>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>발주번호</th><th>발주일</th><th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPos.map(r => (
                    <tr key={r.id}>
                      <td className="font-mono text-xs">{r.po_number}</td>
                      <td className="text-xs text-center">{r.po_date}</td>
                      <td className="text-center"><span className={BADGE[r.status]}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-600">
            <BarChart3 className="w-4 h-4 inline mr-1.5 mb-0.5" />
            상세 차트 및 월별 집계는 추후 구현 예정입니다.
          </div>
        </>
      )}
    </div>
  )
}
