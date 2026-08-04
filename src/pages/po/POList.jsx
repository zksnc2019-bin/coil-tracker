import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  Building2, ChevronRight, Copy, History, MapPin,
  Package, Plus, Search, Truck, X,
} from 'lucide-react'

// ──────────────────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────────────────
const STATUS_LIST = ['임시저장','발주완료','입고예정','일부입고','입고완료','납기지연','취소']

const STATUS_BADGE = {
  '임시저장': 'badge-gray',
  '발주완료': 'badge-blue',
  '입고예정': 'badge-blue',
  '일부입고': 'badge-yellow',
  '입고완료': 'badge-green',
  '납기지연': 'badge-red',
  '취소':    'badge-gray',
}

const STATUS_BORDER = {
  '임시저장': 'border-l-gray-300',
  '발주완료': 'border-l-blue-400',
  '입고예정': 'border-l-blue-500',
  '일부입고': 'border-l-yellow-400',
  '입고완료': 'border-l-green-500',
  '납기지연': 'border-l-red-500',
  '취소':    'border-l-gray-300',
}

const DENSITY = 7.85  // kg/(m²·mm) for steel

// ──────────────────────────────────────────────────────────
// 유틸
// ──────────────────────────────────────────────────────────
const fmt = (n, d = 0) =>
  n != null && n !== '' ? parseFloat(n).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-'

function calcItem(item) {
  const w = parseFloat(item.width) || 0
  const l = parseFloat(item.length_mm) || 0
  const t = parseFloat(item.thickness) || 0
  const qty = parseInt(item.est_qty) || 0
  const price = parseFloat(item.unit_price_est) || 0
  const area_per = w * l / 1_000_000
  const est_area   = parseFloat((area_per * qty).toFixed(4))
  const est_weight = parseFloat((est_area * t * DENSITY).toFixed(3))
  const est_amount = parseFloat((est_weight * price).toFixed(2))
  return {
    est_area:   est_area   > 0 ? est_area   : null,
    est_weight: est_weight > 0 ? est_weight : null,
    est_amount: est_amount > 0 ? est_amount : null,
  }
}

function newItem(seq = 1) {
  return {
    _key: `${Date.now()}-${seq}`,
    item_seq: seq,
    item_name: '', material: '', thickness: '', width: '', length_mm: '',
    est_qty: '', unit_price_est: '',
    est_area: null, est_weight: null, est_amount: null,
    site_id: '', memo: '',
  }
}

async function genPoNumber(poDate) {
  const prefix = `PO-${poDate.slice(0, 7).replace('-', '')}-`
  const { data } = await supabase
    .from('purchase_orders')
    .select('po_number')
    .like('po_number', `${prefix}%`)
    .order('po_number', { ascending: false })
    .limit(1)
  const seq = data?.length ? parseInt(data[0].po_number.split('-')[2]) + 1 : 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

// ──────────────────────────────────────────────────────────
// Label 공통 (index.css에 없는 클래스 인라인 처리)
// ──────────────────────────────────────────────────────────
const LBL = 'text-xs font-medium text-gray-600 mb-0.5 block'

// ──────────────────────────────────────────────────────────
// ItemRow — 모달 내 품목 입력 행
// ──────────────────────────────────────────────────────────
function ItemRow({ item, idx, sites, onChange, onRemove, canRemove }) {
  const set = (k, v) => {
    const next = { ...item, [k]: v }
    onChange(idx, { ...next, ...calcItem(next) })
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 mb-2 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">품목 {idx + 1}</span>
        {canRemove && (
          <button onClick={() => onRemove(idx)} className="text-red-400 hover:text-red-600 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className={LBL}>품목명</label>
          <input value={item.item_name} onChange={e => set('item_name', e.target.value)}
            className="input text-xs" placeholder="예) HGI판재" />
        </div>
        <div>
          <label className={LBL}>재질</label>
          <input value={item.material} onChange={e => set('material', e.target.value)}
            className="input text-xs" placeholder="SGHC / GI / STS" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-2">
        <div>
          <label className={LBL}>두께(mm)</label>
          <input type="number" value={item.thickness} onChange={e => set('thickness', e.target.value)}
            className="input text-xs" step="0.01" min="0" />
        </div>
        <div>
          <label className={LBL}>폭(mm)</label>
          <input type="number" value={item.width} onChange={e => set('width', e.target.value)}
            className="input text-xs" step="1" min="0" />
        </div>
        <div>
          <label className={LBL}>길이(mm)</label>
          <input type="number" value={item.length_mm} onChange={e => set('length_mm', e.target.value)}
            className="input text-xs" step="1" min="0" />
        </div>
        <div>
          <label className={LBL}>수량(매)</label>
          <input type="number" value={item.est_qty} onChange={e => set('est_qty', e.target.value)}
            className="input text-xs" min="0" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className={LBL}>예상단가(원/kg)</label>
          <input type="number" value={item.unit_price_est} onChange={e => set('unit_price_est', e.target.value)}
            className="input text-xs" step="1" min="0" />
        </div>
        <div>
          <label className={LBL}>적용현장</label>
          <select value={item.site_id || ''} onChange={e => set('site_id', e.target.value)} className="select text-xs">
            <option value="">발주와 동일</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
        </div>
      </div>

      {item.est_weight > 0 && (
        <div className="bg-blue-50 rounded px-3 py-1.5 flex gap-4 text-xs text-blue-700">
          <span>면적: <b>{fmt(item.est_area, 2)} ㎡</b></span>
          <span>중량: <b>{fmt(item.est_weight, 1)} kg</b></span>
          <span>금액: <b>{item.est_amount ? Math.round(item.est_amount).toLocaleString() : '-'} 원</b></span>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// POModal — 신규 / 수정 / 복사
// ──────────────────────────────────────────────────────────
function POModal({ po, copyMode, vendors, sites, onClose, onSaved }) {
  const isNew = !po?.id || copyMode

  const [form, setForm] = useState(() => {
    const base = {
      po_date: new Date().toISOString().slice(0, 10),
      site_id: '', vendor_id: '',
      due_date: '',
      expected_delivery_date: '',
      shipped_date: '',
      po_purpose: '',
      delivery_place: '',
      manager_name: '',
      manager_phone: '',
      payment_terms: '익월말',
      memo: '',
    }
    if (po) { Object.assign(base, po); base.site_id = po.site_id ?? ''; base.vendor_id = po.vendor_id ?? '' }
    if (copyMode) {
      delete base.id
      delete base.po_number
      base.status = '임시저장'
      base.po_date = new Date().toISOString().slice(0, 10)
      base.shipped_date = ''
    }
    return base
  })

  const [items, setItems] = useState([newItem(1)])
  const [loadingItems, setLoadingItems] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!po?.id) return
    setLoadingItems(true)
    supabase.from('purchase_order_items').select('*').eq('po_id', po.id).order('item_seq')
      .then(({ data }) => {
        if (data?.length) {
          const mapped = data.map((d, i) => ({
            ...d,
            _key: copyMode ? `${Date.now()}-${i}` : `${d.id}`,
            ...(copyMode ? { id: undefined } : {}),
          }))
          setItems(mapped)
        }
        setLoadingItems(false)
      })
  }, [po?.id])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const changeItem = (idx, next) => setItems(prev => prev.map((it, i) => i === idx ? next : it))
  const addItem = () => setItems(prev => [...prev, newItem(prev.length + 1)])
  const removeItem = idx => setItems(prev =>
    prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, item_seq: i + 1 }))
  )

  const totalWeight = items.reduce((s, it) => s + (parseFloat(it.est_weight) || 0), 0)
  const totalAmount = items.reduce((s, it) => s + (parseFloat(it.est_amount) || 0), 0)

  const save = async (status) => {
    if (!form.vendor_id || !form.due_date) return toast.error('업체와 납기일은 필수입니다.')
    if (items.length === 0) return toast.error('품목을 1개 이상 입력하세요.')
    setSaving(true)

    const payload = {
      po_date: form.po_date,
      site_id: form.site_id ? parseInt(form.site_id) : null,
      vendor_id: parseInt(form.vendor_id),
      due_date: form.due_date,
      expected_delivery_date: form.expected_delivery_date || null,
      shipped_date: form.shipped_date || null,
      po_purpose: form.po_purpose || null,
      delivery_place: form.delivery_place || null,
      manager_name: form.manager_name || null,
      manager_phone: form.manager_phone || null,
      payment_terms: form.payment_terms || '익월말',
      memo: form.memo || null,
      status,
    }

    let poId, err

    if (isNew) {
      payload.po_number = await genPoNumber(form.po_date)
      const { data, error } = await supabase.from('purchase_orders').insert(payload).select('id').single()
      err = error; poId = data?.id
    } else {
      const { error } = await supabase.from('purchase_orders').update(payload).eq('id', po.id)
      err = error; poId = po.id
    }

    if (err) { setSaving(false); return toast.error(err.message) }

    // 품목 저장: 기존 삭제 후 재삽입
    if (!isNew) await supabase.from('purchase_order_items').delete().eq('po_id', poId)

    const itemsPayload = items.map((it, i) => ({
      po_id: poId,
      item_seq: i + 1,
      item_name: it.item_name || null,
      material: it.material || null,
      thickness: it.thickness !== '' ? parseFloat(it.thickness) : null,
      width: it.width !== '' ? parseFloat(it.width) : null,
      length_mm: it.length_mm !== '' ? parseFloat(it.length_mm) : null,
      est_qty: it.est_qty !== '' ? parseInt(it.est_qty) : null,
      est_area: it.est_area ?? null,
      est_weight: it.est_weight ?? null,
      unit_price_est: it.unit_price_est !== '' ? parseFloat(it.unit_price_est) : null,
      est_amount: it.est_amount ?? null,
      site_id: it.site_id ? parseInt(it.site_id) : null,
      memo: it.memo || null,
    }))

    const { error: itemErr } = await supabase.from('purchase_order_items').insert(itemsPayload)
    setSaving(false)
    if (itemErr) return toast.error('품목 저장 오류: ' + itemErr.message)
    toast.success(isNew ? '발주가 등록되었습니다.' : '수정되었습니다.')
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-lg font-bold text-gray-800">
            {copyMode ? '발주 복사 등록' : isNew ? '발주 신규 등록' : `발주 수정 — ${po?.po_number}`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 입력 영역 */}
        <div className="overflow-y-auto px-6 py-4 space-y-3 flex-1">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className={LBL}>발주일 *</label>
              <input type="date" value={form.po_date} onChange={e => setF('po_date', e.target.value)} className="input" />
            </div>
            <div>
              <label className={LBL}>상차예정일</label>
              <input type="date" value={form.expected_delivery_date || ''} onChange={e => setF('expected_delivery_date', e.target.value)} className="input" />
            </div>
            <div>
              <label className={LBL}>출고일</label>
              <input type="date" value={form.shipped_date || ''} onChange={e => setF('shipped_date', e.target.value)} className="input" />
            </div>
            <div>
              <label className={LBL}>납기일 *</label>
              <input type="date" value={form.due_date} onChange={e => setF('due_date', e.target.value)} className="input" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LBL}>매입거래처 *</label>
              <select value={form.vendor_id} onChange={e => setF('vendor_id', e.target.value)} className="select">
                <option value="">선택</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LBL}>납품현장</label>
              <select value={form.site_id} onChange={e => setF('site_id', e.target.value)} className="select">
                <option value="">미지정</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LBL}>결제조건</label>
              <select value={form.payment_terms} onChange={e => setF('payment_terms', e.target.value)} className="select">
                {['현금', '익월말', '60일', '90일', '어음'].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LBL}>발주목적</label>
              <input value={form.po_purpose || ''} onChange={e => setF('po_purpose', e.target.value)}
                className="input" placeholder="신규 / 추가 / 교체" />
            </div>
            <div>
              <label className={LBL}>납품장소</label>
              <input value={form.delivery_place || ''} onChange={e => setF('delivery_place', e.target.value)}
                className="input" placeholder="주소 또는 현장명" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LBL}>담당자</label>
              <input value={form.manager_name || ''} onChange={e => setF('manager_name', e.target.value)} className="input" />
            </div>
            <div>
              <label className={LBL}>담당자 연락처</label>
              <input value={form.manager_phone || ''} onChange={e => setF('manager_phone', e.target.value)} className="input" />
            </div>
          </div>

          <div>
            <label className={LBL}>메모</label>
            <textarea value={form.memo || ''} onChange={e => setF('memo', e.target.value)}
              className="input resize-none" rows={2} />
          </div>

          {/* 발주품목 */}
          <div>
            <div className="flex items-center justify-between mb-2 pt-1">
              <h3 className="text-sm font-bold text-gray-700">발주품목</h3>
              <button onClick={addItem}
                className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1 font-medium">
                <Plus className="w-3.5 h-3.5" /> 품목 추가
              </button>
            </div>
            {loadingItems
              ? <p className="text-xs text-gray-400 py-4 text-center">품목 로딩중...</p>
              : items.map((it, idx) => (
                <ItemRow key={it._key || idx} item={it} idx={idx} sites={sites}
                  onChange={changeItem} onRemove={removeItem} canRemove={items.length > 1} />
              ))
            }
          </div>

          {/* 합계 */}
          {(totalWeight > 0 || totalAmount > 0) && (
            <div className="bg-gray-100 rounded-lg px-4 py-2.5 flex gap-6 text-sm font-medium text-gray-700">
              <span>총 예상중량: <b>{fmt(totalWeight, 1)} kg</b></span>
              <span>총 예상금액: <b>{Math.round(totalAmount).toLocaleString()} 원</b></span>
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="flex gap-2 px-6 py-4 border-t shrink-0 justify-end bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="btn-secondary">취소</button>
          <button onClick={() => save('임시저장')} disabled={saving} className="btn-secondary">
            임시저장
          </button>
          <button onClick={() => save('발주완료')} disabled={saving} className="btn-primary">
            {saving ? '저장중...' : '발주확정'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// DetailPanel — 우측 상세패널 (3탭)
// ──────────────────────────────────────────────────────────
function DetailPanel({ po, vendors, sites, onClose, onEdit, onCopy }) {
  const [tab, setTab] = useState('items')
  const [items, setItems] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [planForm, setPlanForm] = useState({
    po_item_id: '', planned_date: '', expected_month: '',
    plan_qty: '', plan_weight: '', unit_price_est: '', memo: '',
  })

  const loadDetails = () => {
    if (!po?.id) return
    setLoading(true)
    Promise.all([
      supabase.from('purchase_order_items').select('*').eq('po_id', po.id).order('item_seq'),
      supabase.from('purchase_delivery_plans').select('*').eq('po_id', po.id).order('plan_seq'),
    ]).then(([{ data: iData }, { data: pData }]) => {
      setItems(iData || [])
      setPlans(pData || [])
      setLoading(false)
    })
  }

  useEffect(() => {
    loadDetails()
  }, [po?.id])

  if (!po) return null

  const vendor = vendors.find(v => v.id === po.vendor_id)
  const site = sites.find(s => s.id === po.site_id)
  const totalAmt = items.reduce((s, it) => s + (parseFloat(it.est_amount) || 0), 0)
  const totalWt  = items.reduce((s, it) => s + (parseFloat(it.est_weight) || 0), 0)
  const plannedWt = plans.reduce((s, plan) => s + (parseFloat(plan.plan_weight) || 0), 0)
  const plannedAmt = plans.reduce((s, plan) => s + (parseFloat(plan.est_amount) || 0), 0)

  const savePlan = async () => {
    if (!planForm.planned_date || !planForm.expected_month || !planForm.plan_weight) {
      return toast.error('입고예정일, 예상 매입월, 예정중량은 필수입니다.')
    }
    setSavingPlan(true)
    const weight = parseFloat(planForm.plan_weight) || 0
    const price = parseFloat(planForm.unit_price_est) || 0
    const { error } = await supabase.from('purchase_delivery_plans').insert({
      po_id: po.id,
      po_item_id: planForm.po_item_id ? parseInt(planForm.po_item_id) : null,
      plan_seq: plans.length + 1,
      planned_date: planForm.planned_date,
      expected_month: planForm.expected_month,
      plan_qty: planForm.plan_qty ? parseInt(planForm.plan_qty) : null,
      plan_weight: weight,
      unit_price_est: price || null,
      est_amount: price ? weight * price : null,
      status: '입고예정',
      memo: planForm.memo || null,
    })
    setSavingPlan(false)
    if (error) return toast.error(error.message)
    toast.success('분할입고 계획을 등록했습니다.')
    setPlanForm({
      po_item_id: '', planned_date: '', expected_month: '',
      plan_qty: '', plan_weight: '', unit_price_est: '', memo: '',
    })
    setShowPlanForm(false)
    loadDetails()
  }

  const TABS = [
    { key: 'items',    label: '발주품목',    icon: Package,  badge: items.length },
    { key: 'receipts', label: '입고매입연결', icon: Truck,    badge: plans.length },
    { key: 'history',  label: '변경이력',    icon: History,  badge: 0 },
  ]

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 패널 헤더 */}
      <div className={`px-4 py-3 border-b border-l-4 ${STATUS_BORDER[po.status] || 'border-l-gray-300'} shrink-0`}>
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-sm font-bold text-gray-800 truncate">{po.po_number}</span>
              <span className={`${STATUS_BADGE[po.status]} shrink-0`}>{po.status}</span>
            </div>
            <p className="text-xs text-gray-500 truncate">{vendor?.vendor_name} · {site?.site_name || '현장미지정'}</p>
            <p className="text-xs text-[#334155]">발주 {po.po_date} · 상차예정 {po.expected_delivery_date || '-'}</p>
            <p className="text-xs text-[#334155]">출고 {po.shipped_date || '-'} · 납기 {po.due_date}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button onClick={onCopy} title="복사"
              className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors">
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={onEdit} className="btn-primary text-xs py-1 px-3">수정</button>
            <button onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex border-b shrink-0">
        {TABS.map(({ key, label, icon: Icon, badge }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
            {badge > 0 && (
              <span className={`rounded-full px-1.5 text-xs ${tab === key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-center text-gray-400 py-10 text-sm">로딩중...</p>
        ) : tab === 'items' ? (
          <div className="space-y-2">
            {items.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-10">등록된 품목이 없습니다.</p>
            ) : (
              <>
                {items.map(it => (
                  <div key={it.id} className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-gray-400">품목 {it.item_seq}</span>
                      {it.material && <span className="badge-gray">{it.material}</span>}
                    </div>
                    <p className="text-sm font-medium text-gray-800 mb-2">{it.item_name || '품목명 미입력'}</p>
                    <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs text-gray-600">
                      <div>두께: <b className="text-gray-800">{it.thickness ?? '-'} mm</b></div>
                      <div>폭: <b className="text-gray-800">{it.width ?? '-'} mm</b></div>
                      <div>길이: <b className="text-gray-800">{it.length_mm ?? '-'} mm</b></div>
                      <div>수량: <b className="text-gray-800">{it.est_qty ?? '-'} 매</b></div>
                      <div>중량: <b className="text-gray-800">{it.est_weight != null ? fmt(it.est_weight, 1) + ' kg' : '-'}</b></div>
                      <div>단가: <b className="text-gray-800">{it.unit_price_est != null ? fmt(it.unit_price_est) + '원' : '-'}</b></div>
                    </div>
                    {it.est_amount > 0 && (
                      <div className="mt-2 bg-blue-50 rounded px-2 py-1 text-xs text-blue-700 font-medium">
                        예상금액: {Math.round(it.est_amount).toLocaleString()} 원
                      </div>
                    )}
                  </div>
                ))}
                {(totalWt > 0 || totalAmt > 0) && (
                  <div className="bg-gray-100 rounded-lg px-3 py-2 flex justify-between text-sm">
                    <span className="text-gray-600">합계</span>
                    <span className="font-bold text-gray-800">
                      {fmt(totalWt, 1)} kg · {Math.round(totalAmt).toLocaleString()} 원
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        ) : tab === 'receipts' ? (
          <div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
                계획중량 <b>{fmt(plannedWt, 1)} kg</b>
              </div>
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
                계획금액 <b>{Math.round(plannedAmt).toLocaleString()} 원</b>
              </div>
            </div>
            <button onClick={() => setShowPlanForm(value => !value)}
              className="btn-secondary w-full mb-3 flex items-center justify-center gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" />
              {showPlanForm ? '분할입고 입력 닫기' : '분할입고 계획 추가'}
            </button>

            {showPlanForm && (
              <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-3 mb-3 space-y-2">
                <div>
                  <label className={LBL}>대상 품목</label>
                  <select value={planForm.po_item_id}
                    onChange={e => setPlanForm(form => ({ ...form, po_item_id: e.target.value }))}
                    className="select text-xs">
                    <option value="">발주 전체</option>
                    {items.map(item => (
                      <option key={item.id} value={item.id}>
                        품목 {item.item_seq} · {item.item_name || item.material || '미입력'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={LBL}>입고예정일 *</label>
                    <input type="date" value={planForm.planned_date}
                      onChange={e => setPlanForm(form => ({
                        ...form,
                        planned_date: e.target.value,
                        expected_month: form.expected_month || e.target.value.slice(0, 7),
                      }))}
                      className="input text-xs" />
                  </div>
                  <div>
                    <label className={LBL}>예상 매입월 *</label>
                    <input type="month" value={planForm.expected_month}
                      onChange={e => setPlanForm(form => ({ ...form, expected_month: e.target.value }))}
                      className="input text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={LBL}>예정수량</label>
                    <input type="number" min="0" value={planForm.plan_qty}
                      onChange={e => setPlanForm(form => ({ ...form, plan_qty: e.target.value }))}
                      className="input text-xs" />
                  </div>
                  <div>
                    <label className={LBL}>예정중량(kg) *</label>
                    <input type="number" min="0" step="0.001" value={planForm.plan_weight}
                      onChange={e => setPlanForm(form => ({ ...form, plan_weight: e.target.value }))}
                      className="input text-xs" />
                  </div>
                  <div>
                    <label className={LBL}>예상단가(원/kg)</label>
                    <input type="number" min="0" step="0.01" value={planForm.unit_price_est}
                      onChange={e => setPlanForm(form => ({ ...form, unit_price_est: e.target.value }))}
                      className="input text-xs" />
                  </div>
                </div>
                {planForm.plan_weight && planForm.unit_price_est && (
                  <p className="text-xs text-blue-700">
                    예상금액: <b>{Math.round(Number(planForm.plan_weight) * Number(planForm.unit_price_est)).toLocaleString()}원</b>
                  </p>
                )}
                <input value={planForm.memo}
                  onChange={e => setPlanForm(form => ({ ...form, memo: e.target.value }))}
                  className="input text-xs" placeholder="분할입고 메모" />
                <button onClick={savePlan} disabled={savingPlan} className="btn-primary w-full text-xs">
                  {savingPlan ? '저장중...' : '입고계획 저장'}
                </button>
              </div>
            )}

            {plans.length === 0 ? (
              <div className="text-center py-10">
                <Truck className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">등록된 입고 계획이 없습니다.</p>
                <p className="text-xs text-gray-300 mt-1">분할입고 계획을 등록해 주세요.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {plans.map(p => (
                  <div key={p.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-500">입고 {p.plan_seq}차</span>
                      <span className={
                        p.status === '입고완료' ? 'badge-green' :
                        p.status === '취소' ? 'badge-gray' : 'badge-blue'
                      }>{p.status}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div>예정일: <b>{p.planned_date || '-'}</b></div>
                      <div>예정월: <b>{p.expected_month || '-'}</b></div>
                      <div>예정중량: <b>{p.plan_weight != null ? fmt(p.plan_weight, 1) + ' kg' : '-'}</b></div>
                      <div>실제중량: <b>{p.actual_weight != null ? fmt(p.actual_weight, 1) + ' kg' : '-'}</b></div>
                      <div>예상단가: <b>{p.unit_price_est != null ? fmt(p.unit_price_est) + '원/kg' : '-'}</b></div>
                      <div>예상금액: <b>{p.est_amount != null ? fmt(p.est_amount) + '원' : '-'}</b></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-10">
            <History className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">변경이력</p>
            <p className="text-xs text-gray-300 mt-1">추후 구현 예정</p>
          </div>
        )}
      </div>

      {/* 기본정보 요약 (패널 하단) */}
      {po.memo && (
        <div className="border-t px-4 py-2.5 shrink-0 bg-gray-50">
          <p className="text-xs text-gray-400">메모</p>
          <p className="text-xs text-gray-600 mt-0.5">{po.memo}</p>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// POList — 메인 컴포넌트
// ──────────────────────────────────────────────────────────
export default function POList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [vendors, setVendors] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selected, setSelected] = useState(null)
  const [modal, setModal] = useState(null)   // null | { po, copyMode }
  const [summary, setSummary] = useState({}) // po_id → { count, total_weight, total_amount }

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('purchase_orders').select('*').order('created_at', { ascending: false })
    if (filterStatus) q = q.eq('status', filterStatus)
    if (search) q = q.ilike('po_number', `%${search}%`)
    const { data, error } = await q
    if (error) { toast.error(error.message); setLoading(false); return }

    setRows(data || [])

    // 품목 요약 (별도 쿼리)
    if (data?.length) {
      const ids = data.map(r => r.id)
      const { data: items } = await supabase
        .from('purchase_order_items')
        .select('po_id, est_weight, est_amount')
        .in('po_id', ids)
      if (items) {
        const s = {}
        items.forEach(it => {
          if (!s[it.po_id]) s[it.po_id] = { count: 0, total_weight: 0, total_amount: 0 }
          s[it.po_id].count++
          s[it.po_id].total_weight += parseFloat(it.est_weight || 0)
          s[it.po_id].total_amount += parseFloat(it.est_amount || 0)
        })
        setSummary(s)
      }
    } else {
      setSummary({})
    }
    setLoading(false)
  }, [search, filterStatus])

  useEffect(() => {
    supabase.from('vendors').select('id,vendor_name').eq('is_active', true).order('vendor_name').then(({ data }) => setVendors(data || []))
    supabase.from('sites').select('id,site_name').eq('is_active', true).order('site_name').then(({ data }) => setSites(data || []))
  }, [])

  useEffect(() => { load() }, [load])

  const openModal = (po = null, copyMode = false) => setModal({ po, copyMode })

  const handleRowClick = row =>
    setSelected(prev => prev?.id === row.id ? null : row)

  const handleSaved = () => {
    load()
    // 수정 시 선택 초기화 (새로 로드 후 재선택하려면 복잡해지므로 닫기)
    if (modal?.po && !modal?.copyMode) setSelected(null)
  }

  return (
    <div className="flex flex-col" style={{ height: '100vh' }}>
      {/* 페이지 헤더 */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-800">발주관리</h1>
          <p className="text-sm text-gray-500">판재·원자재 발주 현황</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/vendors')} className="border border-blue-600 bg-white text-blue-800 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-50 flex items-center gap-1.5">
            <Building2 className="w-4 h-4" /> 매입거래처 관리
          </button>
          <button onClick={() => navigate('/sites')} className="border border-blue-600 bg-white text-blue-800 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-50 flex items-center gap-1.5">
            <MapPin className="w-4 h-4" /> 현장 관리
          </button>
          {selected && (
            <button onClick={() => openModal(selected, true)}
              className="btn-secondary flex items-center gap-1.5">
              <Copy className="w-4 h-4" /> 복사
            </button>
          )}
          <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> 신규 발주
          </button>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="bg-white border-b px-6 py-2.5 flex gap-3 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="발주번호 검색" className="input pl-9 w-48" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="select w-36">
          <option value="">전체 상태</option>
          {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
        </select>
        <button onClick={load} className="btn-secondary px-3">새로고침</button>
        {rows.length > 0 && (
          <span className="self-center text-xs text-gray-400">{rows.length}건</span>
        )}
      </div>

      {/* 목록 + 상세패널 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 목록 */}
        <div className={`${selected ? 'w-[56%]' : 'w-full'} overflow-auto transition-all duration-200`}>
          <table className="tbl">
            <thead className="sticky top-0 z-10">
              <tr>
                <th>발주번호</th>
                <th>발주일</th>
                <th>상차예정일</th>
                <th>출고일</th>
                <th>납기일</th>
                <th>매입거래처</th>
                <th>현장</th>
                <th>품목</th>
                <th>중량(kg)</th>
                <th>예상금액</th>
                <th>상태</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="text-center py-16 text-gray-700">로딩중...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-16 text-gray-700">발주 내역이 없습니다.</td></tr>
              ) : rows.map(r => {
                const s = summary[r.id] || {}
                const isSelected = selected?.id === r.id
                return (
                  <tr key={r.id}
                    onClick={() => handleRowClick(r)}
                    className={`cursor-pointer select-none ${isSelected ? '!bg-blue-100 hover:!bg-blue-100' : ''}`}>
                    <td className="font-mono text-xs font-medium">{r.po_number}</td>
                    <td className="text-xs text-center">{r.po_date}</td>
                    <td className="text-xs text-center">{r.expected_delivery_date || '-'}</td>
                    <td className="text-xs text-center">{r.shipped_date || '-'}</td>
                    <td className="text-xs text-center">{r.due_date}</td>
                    <td className="text-xs">{vendors.find(v => v.id === r.vendor_id)?.vendor_name || '-'}</td>
                    <td className="text-xs">{sites.find(s => s.id === r.site_id)?.site_name || '-'}</td>
                    <td className="text-center text-xs">{s.count ?? 0}</td>
                    <td className="text-right text-xs">{s.total_weight > 0 ? fmt(s.total_weight, 1) : '-'}</td>
                    <td className="text-right text-xs font-medium text-blue-700">
                      {s.total_amount > 0 ? Math.round(s.total_amount).toLocaleString() : '-'}
                    </td>
                    <td className="text-center">
                      <span className={STATUS_BADGE[r.status]}>{r.status}</span>
                    </td>
                    <td className="text-center">
                      <ChevronRight className={`w-3.5 h-3.5 text-gray-400 mx-auto transition-transform duration-200 ${isSelected ? 'rotate-90 text-blue-500' : ''}`} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 상세 패널 */}
        {selected && (
          <div className="w-[44%] border-l border-gray-200 overflow-hidden shrink-0">
            <DetailPanel
              po={selected}
              vendors={vendors}
              sites={sites}
              onClose={() => setSelected(null)}
              onEdit={() => openModal(selected, false)}
              onCopy={() => openModal(selected, true)}
            />
          </div>
        )}
      </div>

      {/* 모달 */}
      {modal !== null && (
        <POModal
          po={modal.po}
          copyMode={modal.copyMode}
          vendors={vendors}
          sites={sites}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
