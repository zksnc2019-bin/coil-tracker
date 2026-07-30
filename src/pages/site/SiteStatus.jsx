import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Factory } from 'lucide-react'

const BADGE = {
  '임시저장': 'badge-gray', '발주완료': 'badge-blue', '입고예정': 'badge-blue',
  '일부입고': 'badge-yellow', '입고완료': 'badge-green', '납기지연': 'badge-red', '취소': 'badge-gray',
}

export default function SiteStatus() {
  const [sites, setSites] = useState([])
  const [posBySite, setPosBySite] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: siteData }, { data: poData }] = await Promise.all([
        supabase.from('sites').select('*').eq('is_active', true).order('site_name'),
        supabase.from('purchase_orders').select('id, po_number, site_id, status, due_date, po_date')
          .not('status', 'in', '("취소")')
          .order('due_date'),
      ])
      setSites(siteData || [])

      // 현장별 발주 그룹핑
      const grouped = {}
      ;(poData || []).forEach(po => {
        const key = po.site_id ?? 0
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(po)
      })
      setPosBySite(grouped)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">현장현황</h1>
        <p className="text-sm text-gray-500">현장별 발주·입고 현황</p>
      </div>

      {loading ? (
        <p className="text-center py-20 text-gray-400">로딩중...</p>
      ) : sites.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Factory className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p>등록된 현장이 없습니다.</p>
          <p className="text-xs mt-1 text-gray-300">기준정보 → 현장관리에서 현장을 등록하세요.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sites.map(site => {
            const pos = posBySite[site.id] || []
            return (
              <div key={site.id} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Factory className="w-4 h-4 text-blue-500" />
                    <span className="font-bold text-gray-800">{site.site_name}</span>
                    {site.client_name && <span className="text-xs text-gray-400">({site.client_name})</span>}
                  </div>
                  <span className="text-xs text-gray-400">{pos.length}건 진행중</span>
                </div>

                {pos.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">진행중인 발주가 없습니다.</p>
                ) : (
                  <table className="tbl text-xs">
                    <thead>
                      <tr>
                        <th>발주번호</th><th>발주일</th><th>납기일</th><th>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pos.map(po => (
                        <tr key={po.id}>
                          <td className="font-mono">{po.po_number}</td>
                          <td className="text-center">{po.po_date}</td>
                          <td className="text-center">{po.due_date}</td>
                          <td className="text-center"><span className={BADGE[po.status]}>{po.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}

          {/* 현장 미지정 발주 */}
          {(posBySite[0] || []).length > 0 && (
            <div className="card border-dashed border-gray-300">
              <div className="flex items-center gap-2 mb-3">
                <Factory className="w-4 h-4 text-gray-400" />
                <span className="font-bold text-gray-500">현장 미지정</span>
              </div>
              <table className="tbl text-xs">
                <thead>
                  <tr><th>발주번호</th><th>발주일</th><th>납기일</th><th>상태</th></tr>
                </thead>
                <tbody>
                  {(posBySite[0] || []).map(po => (
                    <tr key={po.id}>
                      <td className="font-mono">{po.po_number}</td>
                      <td className="text-center">{po.po_date}</td>
                      <td className="text-center">{po.due_date}</td>
                      <td className="text-center"><span className={BADGE[po.status]}>{po.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
