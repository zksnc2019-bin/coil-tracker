import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { Plus, X, Pencil } from 'lucide-react'

function Modal({ row, onClose, onSaved }) {
  const isNew = !row?.id
  const [form, setForm] = useState({
    site_name:'', site_code:'', client_name:'', manager_name:'', manager_phone:'',
    address:'', is_active:true, memo:'',
    ...row,
  })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const save = async () => {
    if (!form.site_name) return toast.error('현장명은 필수입니다.')
    const payload = {
      site_name: form.site_name.trim(),
      site_code: form.site_code?.trim()||null,
      client_name: form.client_name||null,
      manager_name: form.manager_name||null,
      manager_phone: form.manager_phone||null,
      address: form.address||null,
      is_active: form.is_active,
      memo: form.memo||null,
    }
    const fn = isNew
      ? supabase.from('sites').insert(payload)
      : supabase.from('sites').update(payload).eq('id', row.id)
    const {error} = await fn
    if (error) return toast.error(error.message)
    toast.success(isNew ? '현장이 등록되었습니다.' : '수정되었습니다.')
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-800">{isNew ? '현장 등록' : '현장 수정'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">현장명 *</label>
              <input value={form.site_name} onChange={e=>set('site_name',e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">현장코드</label>
              <input value={form.site_code||''} onChange={e=>set('site_code',e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">발주처(건설사)</label>
            <input value={form.client_name||''} onChange={e=>set('client_name',e.target.value)} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">현장 담당자</label>
              <input value={form.manager_name||''} onChange={e=>set('manager_name',e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">연락처</label>
              <input value={form.manager_phone||''} onChange={e=>set('manager_phone',e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">현장 주소</label>
            <input value={form.address||''} onChange={e=>set('address',e.target.value)} className="input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">메모</label>
            <textarea value={form.memo||''} onChange={e=>set('memo',e.target.value)} className="input resize-none" rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e=>set('is_active',e.target.checked)} />
            활성 현장
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

export default function SiteList() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  const load = async () => {
    setLoading(true)
    let q = supabase.from('sites').select('*').order('site_name')
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
          <h1 className="text-xl font-bold text-gray-800">납품현장 관리</h1>
          <p className="text-sm text-gray-500">판재 납품 현장(납품처) 마스터</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)} />
            비활성 포함
          </label>
          <button onClick={()=>setModal({})} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> 현장 등록
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>현장코드</th><th>현장명</th><th>발주처</th><th>담당자</th>
              <th>연락처</th><th>주소</th><th>상태</th><th>수정</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">로딩중...</td></tr>
              : rows.length === 0
              ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">등록된 현장이 없습니다.</td></tr>
              : rows.map(r=>(
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.site_code||'-'}</td>
                  <td className="font-semibold">{r.site_name}</td>
                  <td>{r.client_name||'-'}</td>
                  <td>{r.manager_name||'-'}</td>
                  <td className="text-sm">{r.manager_phone||'-'}</td>
                  <td className="text-xs text-gray-500 max-w-[200px] truncate">{r.address||'-'}</td>
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
