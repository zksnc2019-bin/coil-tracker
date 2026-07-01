import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { Search, CheckCircle2, Circle } from 'lucide-react'

function Step({ num, label, done, children }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold
          ${done ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
          {done ? <CheckCircle2 className="w-5 h-5" /> : num}
        </div>
        {num < 6 && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
      </div>
      <div className="pb-6 flex-1">
        <p className={`font-semibold mb-2 ${done ? 'text-blue-700' : 'text-gray-400'}`}>{label}</p>
        {done && children}
      </div>
    </div>
  )
}

function KV({ label, value }) {
  return value ? (
    <div className="flex gap-2 text-sm mb-1">
      <span className="text-gray-500 w-28 shrink-0">{label}</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  ) : null
}

export default function CoilTrace() {
  const [q, setQ] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const search = async () => {
    if (!q.trim()) return
    setLoading(true)
    setData(null)

    // 작업내역
    const { data: wo } = await supabase.from('work_orders')
      .select(`*, vendors(vendor_name), purchase_orders(*, sites(site_name))`)
      .eq('coil_no', q.trim().toUpperCase())
      .single()

    if (!wo) { toast.error(`소재번호 '${q}'를 찾을 수 없습니다.`); setLoading(false); return }

    // 출고
    const { data: deliveries } = await supabase.from('deliveries')
      .select(`*, sites(site_name)`).eq('coil_no', wo.coil_no).order('delivery_date')

    // 재고
    const { data: inventory } = await supabase.from('inventories')
      .select('*').eq('coil_no', wo.coil_no).single()

    // 매입
    const { data: purchases } = await supabase.from('purchases')
      .select('*').eq('coil_no', wo.coil_no)

    // 지급
    const purchaseIds = (purchases||[]).map(p=>p.id)
    const { data: payItems } = purchaseIds.length
      ? await supabase.from('payment_items').select(`*, payments(*)`).in('purchase_id', purchaseIds)
      : { data: [] }

    setData({ wo, deliveries, inventory, purchases, payItems })
    setLoading(false)
  }

  const po = data?.wo?.purchase_orders
  const dlist = data?.deliveries || []
  const plist = data?.purchases || []
  const pilist = data?.payItems || []

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">소재 추적</h1>
        <p className="text-sm text-gray-500">소재번호로 발주~지급까지 전 이력 조회</p>
      </div>

      <div className="flex gap-2 mb-8">
        <input
          value={q} onChange={e=>setQ(e.target.value.toUpperCase())}
          onKeyDown={e=>e.key==='Enter'&&search()}
          placeholder="소재번호 입력 (예: CGZ1420B)"
          className="input font-mono w-72"
        />
        <button onClick={search} disabled={loading} className="btn-primary flex items-center gap-2">
          <Search className="w-4 h-4" />
          {loading ? '검색중...' : '추적'}
        </button>
      </div>

      {data && (
        <div className="card">
          <div className="mb-6 pb-4 border-b">
            <span className="text-2xl font-bold font-mono text-blue-700">{data.wo.coil_no}</span>
            <span className="ml-3 text-gray-500 text-sm">{data.wo.material} | T{data.wo.thickness} × W{data.wo.width}</span>
          </div>

          <Step num={1} label="발주" done={!!po}>
            <div className="bg-gray-50 rounded-lg p-4">
              <KV label="발주번호" value={po?.po_number} />
              <KV label="현장" value={po?.sites?.site_name} />
              <KV label="외주업체" value={data.wo.vendors?.vendor_name} />
              <KV label="발주일" value={po?.po_date} />
              <KV label="납기일" value={po?.due_date} />
              <KV label="상태" value={po?.status} />
            </div>
          </Step>

          <Step num={2} label="작업" done={true}>
            <div className="bg-gray-50 rounded-lg p-4">
              <KV label="작업일" value={data.wo.work_date} />
              <KV label="코일중량" value={`${data.wo.coil_weight?.toLocaleString()} kg`} />
              <KV label="작업중량" value={`${data.wo.work_weight?.toLocaleString()} kg`} />
              <KV label="작업규격" value={data.wo.work_spec} />
            </div>
          </Step>

          <Step num={3} label={`출고 (${dlist.length}건)`} done={dlist.length > 0}>
            <div className="space-y-2">
              {dlist.map(d=>(
                <div key={d.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{d.delivery_date}</span>
                    <span className="text-blue-700 font-bold">{d.delivery_weight?.toLocaleString()} kg</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {d.packing_no} | {d.sites?.site_name} | {d.delivery_qty}매
                  </div>
                </div>
              ))}
            </div>
          </Step>

          <Step num={4} label="재고" done={!!data.inventory}>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className={`text-2xl font-bold ${(data.inventory?.current_weight||0)<=0?'text-red-500':'text-green-600'}`}>
                {data.inventory?.current_weight?.toLocaleString() ?? 0} kg
              </div>
              <p className="text-xs text-gray-500 mt-1">잔량</p>
            </div>
          </Step>

          <Step num={5} label={`매입 (${plist.length}건)`} done={plist.length > 0}>
            <div className="space-y-2">
              {plist.map(p=>(
                <div key={p.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="flex justify-between">
                    <span>{p.purchase_date}</span>
                    <span className="font-bold">{p.total_amount?.toLocaleString()}원</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {p.tax_invoice_no} | 지급예정: {p.payment_due_month} |
                    <span className={p.is_paid?'text-green-600':'text-orange-500'}> {p.is_paid?'지급완료':'미지급'}</span>
                  </div>
                </div>
              ))}
            </div>
          </Step>

          <Step num={6} label={`지급 (${pilist.length}건)`} done={pilist.length > 0}>
            <div className="space-y-2">
              {pilist.map(pi=>(
                <div key={pi.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="flex justify-between">
                    <span>{pi.payments?.payment_month}</span>
                    <span className="font-bold">{pi.amount?.toLocaleString()}원</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    상태: {pi.payments?.status} | {pi.payments?.paid_date || '-'}
                  </div>
                </div>
              ))}
            </div>
          </Step>
        </div>
      )}
    </div>
  )
}
