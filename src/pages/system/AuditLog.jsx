import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { RefreshCw, Search } from 'lucide-react'

const ACTION_LABEL = {
  INSERT: { label: '등록', cls: 'badge-green' },
  UPDATE: { label: '수정', cls: 'badge-yellow' },
  DELETE: { label: '삭제', cls: 'badge-red' },
}

const TABLE_LABEL = {
  purchase_orders: '발주',
  work_orders: '작업내역',
  deliveries: '출고',
  inventories: '재고',
  purchases: '매입',
  vendors: '업체',
  sites: '현장',
}

export default function AuditLog() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tableFilter, setTableFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  const load = async () => {
    setLoading(true)
    let q = supabase.from('audit_logs')
      .select('*')
      .order('created_at', {ascending:false})
      .limit(200)
    if (tableFilter) q = q.eq('table_name', tableFilter)
    if (actionFilter) q = q.eq('action', actionFilter)
    if (search) q = q.ilike('record_id', `%${search}%`)
    const {data,error} = await q
    if (error) toast.error(error.message)
    else setRows(data)
    setLoading(false)
  }

  useEffect(()=>{ load() },[tableFilter, actionFilter, search])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">감사 로그</h1>
          <p className="text-sm text-gray-500">데이터 변경 이력 (최근 200건)</p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> 새로고침
        </button>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="레코드 ID 검색" className="input pl-9 w-48" />
        </div>
        <select value={tableFilter} onChange={e=>setTableFilter(e.target.value)} className="select w-36">
          <option value="">전체 테이블</option>
          {Object.entries(TABLE_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
        <select value={actionFilter} onChange={e=>setActionFilter(e.target.value)} className="select w-28">
          <option value="">전체 작업</option>
          <option value="INSERT">등록</option>
          <option value="UPDATE">수정</option>
          <option value="DELETE">삭제</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>일시</th><th>테이블</th><th>작업</th><th>레코드 ID</th>
              <th>소재번호</th><th>사용자</th><th>변경 내용</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={7} className="text-center py-10 text-gray-400">로딩중...</td></tr>
              : rows.length === 0
              ? <tr><td colSpan={7} className="text-center py-10 text-gray-400">감사 로그가 없습니다.</td></tr>
              : rows.map(r=>{
                const act = ACTION_LABEL[r.action] || {label:r.action, cls:'badge-blue'}
                return (
                  <tr key={r.id}>
                    <td className="text-xs text-gray-500 whitespace-nowrap">{r.created_at?.slice(0,19).replace('T',' ')}</td>
                    <td className="text-xs">{TABLE_LABEL[r.table_name]||r.table_name}</td>
                    <td><span className={act.cls}>{act.label}</span></td>
                    <td className="font-mono text-xs">{r.record_id}</td>
                    <td className="font-mono text-xs text-blue-700">{r.coil_no||'-'}</td>
                    <td className="text-xs">{r.user_email||r.user_id||'-'}</td>
                    <td className="text-xs text-gray-500 max-w-xs truncate">
                      {r.changed_fields ? JSON.stringify(r.changed_fields) : '-'}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-gray-400">
        * 감사 로그는 Supabase Database Trigger 설정 시 자동으로 기록됩니다.
      </div>
    </div>
  )
}
