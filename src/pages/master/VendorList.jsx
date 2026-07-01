import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { Plus, X, Pencil } from 'lucide-react'

function Modal({ row, onClose, onSaved }) {
  const isNew = !row?.id
  const [form, setForm] = useState({
    vendor_name:'', vendor_code:'', contact_name:'', contact_phone:'', contact_email:'',
    biz_no:'', address:'', payment_terms:'', is_active:true, memo:'',
    ...row,
  })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const save = async () => {
    if (!form.vendor_name) return toast.error('업체명은 필수입니다.')
    const payload = {
      vendor_name: form.vendor_name.trim(),
      vendor_code: form.vendor_code?.trim()||null,
      contact_name: form.contact_name||null,
      contact_phone: form.contact_phone||null,
      contact_email: form.contact_email||null,
      biz_no: form.biz_no||null,
      address: form.address||null,
      payment_terms: form.payment_terms||null,
      is_active: form.is_active,
      memo: form.memo||null,
    }
    const fn = isNew
      ? supabase.from('vendors').insert(payload)
      : supabase.from('vendors').update(payload).eq('id', row.id)
    const {error} = await fn
    if (error) return toast.error(error.message)
    toast.success(isNew ? '업체가 등록되었습니다.' : '수정되었습니다.')
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-800">{isNew ? '업체 등록' : '업체 수정'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">업체명 *</label>
              <input value={form.vendor_name} onChange={e=>set('vendor_name',e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">업체코드</label>
              <input value={form.vendor_code||''} onChange={e=>set('vendor_code',e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">사업자번호</label>
            <input value={form.biz_no||''} onChange={e=>set('biz_no',e.target.value)} placeholder="000-00-00000" className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">담당자</label>
              <input value={form.contact_name||''} onChange={e=>set('contact_name',e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">연락처</label>
              <input value={form.contact_phone||''} onChange={e=>set('contact_phone',e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">이메일</label>
            <input type="email" value={form.contact_email||''} onChange={e=>set('contact_email',e.target.value)} className="input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">주소</label>
            <input value={form.address||''} onChange={e=>set('address',e.target.value)} className="input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">결제조건</label>
            <input value={form.payment_terms||''} onChange={e=>set('payment_terms',e.target.value)} placeholder="예: 익월 말일" className="input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">메모</label>
            <textarea value={form.memo||''} onChange={e=>set('memo',e.target.value)} className="input resize-none" rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e=>set('is_active',e.target.checked)} />
            활성 업체
          </label>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="btn-secondary">취소</button>
          <button onClick={save} className="btn-primary">저장</button>
        </div>
      </div>
    </div>
  )
}

export default function VendorList() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  const load = async () => {
    setLoading(true)
    let q = supabase.from('vendors').select('*').order('vendor_name')
    if (!showInactive) q = q.eq('is_active', true)
    const {data,error} = await q
    if (error) toast.error(error.message)
    else setRows(data)
    setLoading(false)
  }

  useEffect(()=>{ load() },[showInactive])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">외주업체 관리</h1>
          <p className="text-sm text-gray-500">코일 외주 가공 및 공급 업체</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)} />
            비활성 포함
          </label>
          <button onClick={()=>setModal({})} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> 업체 등록
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>업체코드</th><th>업체명</th><th>사업자번호</th><th>담당자</th>
              <th>연락처</th><th>결제조건</th><th>상태</th><th>수정</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">로딩중...</td></tr>
              : rows.length === 0
              ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">등록된 업체가 없습니다.</td></tr>
              : rows.map(r=>(
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.vendor_code||'-'}</td>
                  <td className="font-semibold">{r.vendor_name}</td>
                  <td className="text-sm">{r.biz_no||'-'}</td>
                  <td>{r.contact_name||'-'}</td>
                  <td className="text-sm">{r.contact_phone||'-'}</td>
                  <td className="text-sm">{r.payment_terms||'-'}</td>
                  <td><span className={r.is_active?'badge-green':'badge-red'}>{r.is_active?'활성':'비활성'}</span></td>
                  <td>
                    <button onClick={()=>setModal(r)} className="text-blue-600 hover:text-blue-800">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {modal !== null && (
        <Modal row={modal} onClose={()=>setModal(null)} onSaved={load} />
      )}
    </div>
  )
}
