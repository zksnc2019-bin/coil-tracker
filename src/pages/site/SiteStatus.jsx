import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Factory, ChevronDown, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'

const STATUS_BADGE = {
  '임시저장': 'badge-gray',
  '발주완료': 'badge-blue',
  '출고예정': 'badge-blue',
  '일부출고': 'badge-yellow',
  '출고완료': 'badge-green',
  '납기지연': 'badge-red',
  '취소':    'badge-gray',
}

const fmt = v => (v == null || v === '' ? '-' : Number(v).toLocaleString())
const fmtRate = v => (v == null ? '-' : v.toFixed(1) + '%')

export default function SiteStatus() {
  const [sites, setSites]     = useState([])
  const [posBySite, setPosBySite] = useState({})
  const [expanded, setExpanded]   = useState({})
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: siteData }, { data: poData }] = await Promise.all([
        supabase.from('sites').select('*').eq('is_active', true).order('site_name'),
        supabase
          .from('purchase_orders')
          .select(
            'id, po_number, po_date, due_date, status,' +
            'item_name, order_weight, area, unit_price_est, sale_unit_price, site_id'
          )
          .not('status', 'in', '("취소")')
          .order('due_date'),
      ])
      setSites(siteData || [])

      const grouped = {}
      ;(poData || []).forEach(po => {
        const key = po.site_id ?? 0
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(po)
      })
      setPosBySite(grouped)

      // 첫 로드 시 현장 전체 펼치기
      const initExpanded = {}
      ;(siteData || []).forEach(s => { initExpanded[s.id] = true })
      initExpanded[0] = true
      setExpanded(initExpanded)

      setLoading(false)
    }
    load()
  }, [])

  const toggle = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  // 현장 합계 계산
  const calcSummary = pos => {
    let totalWeight = 0, totalPurchase = 0, totalSale = 0
    pos.forEach(po => {
      const w = Number(po.order_weight) || 0
      totalWeight   += w
      totalPurchase += w * (Number(po.unit_price_est)   || 0)
      totalSale     += w * (Number(po.sale_unit_price)  || 0)
    })
    const margin = totalSale - totalPurchase
    const marginRate = totalSale > 0 ? (margin / totalSale) * 100 : null
    return { totalWeight, totalPurchase, totalSale, margin, marginRate }
  }

  const SiteCard = ({ site, pos }) => {
    const open = expanded[site.id]
    const sum  = calcSummary(pos)
    const hasSale = pos.some(p => p.sale_unit_price != null)

    return (
      <div className="card">
        {/* 헤더 */}
        <div
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => toggle(site.id)}
        >
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="w-4 h-4 text-blue-500" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            <Factory className="w-4 h-4 text-blue-500" />
            <span className="font-bold text-gray-800">{site.site_name}</span>
            {site.client_name && <span className="text-xs text-gray-400">({site.client_name})</span>}
          </div>
          <span className="text-xs text-gray-400">{pos.length}건</span>
        </div>

        {/* 현장 요약 (항상 표시) */}
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-gray-50 rounded p-2 text-center">
            <p className="text-xs text-gray-500">발주중량</p>
            <p className="text-sm font-bold text-gray-800">{fmt(Math.round(sum.totalWeight))} kg</p>
          </div>
          <div className="bg-blue-50 rounded p-2 text-center">
            <p className="text-xs text-blue-500">매입금액</p>
            <p className="text-sm font-bold text-blue-700">{fmt(Math.round(sum.totalPurchase))} 원</p>
          </div>
          <div className="bg-green-50 rounded p-2 text-center">
            <p className="text-xs text-green-600">판매금액</p>
            <p className="text-sm font-bold text-green-700">
              {hasSale ? fmt(Math.round(sum.totalSale)) + ' 원' : '미입력'}
            </p>
          </div>
          <div className={`rounded p-2 text-center ${sum.margin >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <p className={`text-xs ${sum.margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              마진 {hasSale && sum.marginRate != null ? `(${fmtRate(sum.marginRate)})` : ''}
            </p>
            {hasSale ? (
              <div className="flex items-center justify-center gap-1">
                {sum.margin >= 0
                  ? <TrendingUp className="w-3 h-3 text-emerald-600" />
                  : <TrendingDown className="w-3 h-3 text-red-500" />}
                <p className={`text-sm font-bold ${sum.margin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {fmt(Math.round(sum.margin))} 원
                </p>
              </div>
            ) : (
              <p className="text-sm font-bold text-gray-400">-</p>
            )}
          </div>
        </div>

        {/* 발주 상세 테이블 */}
        {open && pos.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="tbl text-xs">
              <thead>
                <tr>
                  <th>발주번호</th>
                  <th>품목</th>
                  <th>발주일</th>
                  <th>납기일</th>
                  <th className="text-right">중량(kg)</th>
                  <th className="text-right">매입단가</th>
                  <th className="text-right">매입금액</th>
                  <th className="text-right">판매단가</th>
                  <th className="text-right">판매금액</th>
                  <th className="text-right">마진</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {pos.map(po => {
                  const w  = Number(po.order_weight)  || 0
                  const bp = Number(po.unit_price_est) || 0
                  const sp = Number(po.sale_unit_price)
                  const buyAmt  = Math.round(w * bp)
                  const saleAmt = po.sale_unit_price != null ? Math.round(w * sp) : null
                  const margin  = saleAmt != null ? saleAmt - buyAmt : null
                  return (
                    <tr key={po.id}>
                      <td className="font-mono">{po.po_number}</td>
                      <td>{po.item_name || '-'}</td>
                      <td className="text-center">{po.po_date}</td>
                      <td className="text-center">{po.due_date}</td>
                      <td className="text-right">{fmt(w)}</td>
                      <td className="text-right">{fmt(bp)}</td>
                      <td className="text-right font-medium text-blue-700">{fmt(buyAmt)}</td>
                      <td className="text-right">{po.sale_unit_price != null ? fmt(sp) : <span className="text-gray-300">미입력</span>}</td>
                      <td className="text-right font-medium text-green-700">{saleAmt != null ? fmt(saleAmt) : '-'}</td>
                      <td className={`text-right font-medium ${margin == null ? '' : margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {margin != null ? fmt(margin) : '-'}
                      </td>
                      <td className="text-center">
                        <span className={STATUS_BADGE[po.status] || 'badge-gray'}>{po.status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {open && pos.length === 0 && (
          <p className="text-xs text-gray-400 py-2 mt-2">진행중인 발주가 없습니다.</p>
        )}
      </div>
    )
  }

  if (loading) return <p className="text-center py-20 text-gray-400">로딩중...</p>

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">현장현황</h1>
        <p className="text-sm text-gray-500">현장별 발주·출고 및 매입/판매 비교 현황</p>
      </div>

      {sites.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Factory className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p>등록된 현장이 없습니다.</p>
          <p className="text-xs mt-1 text-gray-300">기준정보 → 현장관리에서 현장을 등록하세요.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sites.map(site => {
            const pos = posBySite[site.id] || []
            return <SiteCard key={site.id} site={site} pos={pos} />
          })}

          {/* 현장 미지정 발주 */}
          {(posBySite[0] || []).length > 0 && (
            <div className="card border-dashed border-gray-300">
              <div
                className="flex items-center justify-between cursor-pointer select-none"
                onClick={() => toggle(0)}
              >
                <div className="flex items-center gap-2">
                  {expanded[0] ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <Factory className="w-4 h-4 text-gray-400" />
                  <span className="font-bold text-gray-500">현장 미지정</span>
                </div>
                <span className="text-xs text-gray-400">{(posBySite[0] || []).length}건</span>
              </div>
              {expanded[0] && (
                <div className="mt-3 overflow-x-auto">
                  <table className="tbl text-xs">
                    <thead>
                      <tr>
                        <th>발주번호</th><th>품목</th><th>발주일</th><th>납기일</th>
                        <th className="text-right">중량(kg)</th>
                        <th className="text-right">매입단가</th><th className="text-right">매입금액</th>
                        <th className="text-right">판매단가</th><th className="text-right">판매금액</th>
                        <th>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(posBySite[0] || []).map(po => {
                        const w  = Number(po.order_weight)  || 0
                        const bp = Number(po.unit_price_est) || 0
                        const sp = Number(po.sale_unit_price)
                        return (
                          <tr key={po.id}>
                            <td className="font-mono">{po.po_number}</td>
                            <td>{po.item_name || '-'}</td>
                            <td className="text-center">{po.po_date}</td>
                            <td className="text-center">{po.due_date}</td>
                            <td className="text-right">{fmt(w)}</td>
                            <td className="text-right">{fmt(bp)}</td>
                            <td className="text-right text-blue-700">{fmt(Math.round(w * bp))}</td>
                            <td className="text-right">{po.sale_unit_price != null ? fmt(sp) : <span className="text-gray-300">미입력</span>}</td>
                            <td className="text-right text-green-700">{po.sale_unit_price != null ? fmt(Math.round(w * sp)) : '-'}</td>
                            <td className="text-center"><span className={STATUS_BADGE[po.status] || 'badge-gray'}>{po.status}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
