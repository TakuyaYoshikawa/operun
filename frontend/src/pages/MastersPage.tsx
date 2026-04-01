import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { machinesApi, processesApi } from '../api/machines'
import type { Machine, Process } from '../api/machines'

export default function MastersPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'machines' | 'processes'>('machines')

  // 設備
  const { data: machines } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.list().then(r => r.data),
  })
  const [mForm, setMForm] = useState({ name: '', code: '', daily_capacity_hours: 8, setup_time_minutes: 30, is_active: true })
  const [mEditId, setMEditId] = useState<number | null>(null)
  const createM = useMutation({ mutationFn: machinesApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['machines'] }); resetM() } })
  const updateM = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<Machine> }) => machinesApi.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['machines'] }); resetM() } })
  const deleteM = useMutation({ mutationFn: machinesApi.delete, onSuccess: () => qc.invalidateQueries({ queryKey: ['machines'] }) })
  const resetM = () => { setMForm({ name: '', code: '', daily_capacity_hours: 8, setup_time_minutes: 30, is_active: true }); setMEditId(null) }

  // 工程
  const { data: processes } = useQuery({
    queryKey: ['processes'],
    queryFn: () => processesApi.list().then(r => r.data),
  })
  const [pForm, setPForm] = useState({ name: '', code: '', standard_time_per_unit: 10 })
  const [pEditId, setPEditId] = useState<number | null>(null)
  const createP = useMutation({ mutationFn: processesApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['processes'] }); resetP() } })
  const updateP = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<Process> }) => processesApi.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['processes'] }); resetP() } })
  const deleteP = useMutation({ mutationFn: processesApi.delete, onSuccess: () => qc.invalidateQueries({ queryKey: ['processes'] }) })
  const resetP = () => { setPForm({ name: '', code: '', standard_time_per_unit: 10 }); setPEditId(null) }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">マスタ管理</h1>

      {/* タブ */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {(['machines', 'processes'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'machines' ? '設備マスタ' : '工程マスタ'}
          </button>
        ))}
      </div>

      {/* 設備マスタ */}
      {tab === 'machines' && (
        <div>
          <form
            onSubmit={e => { e.preventDefault(); mEditId ? updateM.mutate({ id: mEditId, data: mForm }) : createM.mutate(mForm) }}
            className="bg-white border border-gray-200 rounded-xl p-5 mb-5 shadow-sm grid grid-cols-2 gap-4"
          >
            <h2 className="col-span-2 text-base font-semibold text-gray-700">{mEditId ? '設備編集' : '設備追加'}</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">設備コード *</label>
              <input required value={mForm.code} disabled={!!mEditId} onChange={e => setMForm(f => ({ ...f, code: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" placeholder="M01" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">設備名 *</label>
              <input required value={mForm.name} onChange={e => setMForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="旋盤1号機" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">1日稼働時間（時間）</label>
              <input type="number" min={1} max={24} step={0.5} value={mForm.daily_capacity_hours}
                onChange={e => setMForm(f => ({ ...f, daily_capacity_hours: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">段取り時間（分）</label>
              <input type="number" min={0} value={mForm.setup_time_minutes}
                onChange={e => setMForm(f => ({ ...f, setup_time_minutes: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              {mEditId && <button type="button" onClick={resetM} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">キャンセル</button>}
              <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                {mEditId ? '更新' : '追加'}
              </button>
            </div>
          </form>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">コード</th>
                  <th className="px-4 py-3 text-left">設備名</th>
                  <th className="px-4 py-3 text-right">稼働時間</th>
                  <th className="px-4 py-3 text-right">段取り(分)</th>
                  <th className="px-4 py-3 text-center">状態</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {machines?.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">設備データがありません</td></tr>
                )}
                {machines?.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-600">{m.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{m.name}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{m.daily_capacity_hours}h</td>
                    <td className="px-4 py-3 text-right text-gray-600">{m.setup_time_minutes}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {m.is_active ? '稼働中' : '停止'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => { setMForm({ name: m.name, code: m.code, daily_capacity_hours: m.daily_capacity_hours, setup_time_minutes: m.setup_time_minutes, is_active: m.is_active }); setMEditId(m.id) }} className="text-blue-500 hover:text-blue-700 mr-3 text-xs">編集</button>
                      <button onClick={() => { if (confirm('削除しますか？')) deleteM.mutate(m.id) }} className="text-red-400 hover:text-red-600 text-xs">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 工程マスタ */}
      {tab === 'processes' && (
        <div>
          <form
            onSubmit={e => { e.preventDefault(); pEditId ? updateP.mutate({ id: pEditId, data: pForm }) : createP.mutate(pForm) }}
            className="bg-white border border-gray-200 rounded-xl p-5 mb-5 shadow-sm grid grid-cols-3 gap-4"
          >
            <h2 className="col-span-3 text-base font-semibold text-gray-700">{pEditId ? '工程編集' : '工程追加'}</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">工程コード *</label>
              <input required value={pForm.code} disabled={!!pEditId} onChange={e => setPForm(f => ({ ...f, code: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" placeholder="P01" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">工程名 *</label>
              <input required value={pForm.name} onChange={e => setPForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="旋削" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">標準時間（分/個）</label>
              <input type="number" min={0.1} step={0.1} value={pForm.standard_time_per_unit}
                onChange={e => setPForm(f => ({ ...f, standard_time_per_unit: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-3 flex gap-3 justify-end">
              {pEditId && <button type="button" onClick={resetP} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">キャンセル</button>}
              <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                {pEditId ? '更新' : '追加'}
              </button>
            </div>
          </form>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">コード</th>
                  <th className="px-4 py-3 text-left">工程名</th>
                  <th className="px-4 py-3 text-right">標準時間（分/個）</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {processes?.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">工程データがありません</td></tr>
                )}
                {processes?.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-600">{p.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p.standard_time_per_unit}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => { setPForm({ name: p.name, code: p.code, standard_time_per_unit: p.standard_time_per_unit }); setPEditId(p.id) }} className="text-blue-500 hover:text-blue-700 mr-3 text-xs">編集</button>
                      <button onClick={() => { if (confirm('削除しますか？')) deleteP.mutate(p.id) }} className="text-red-400 hover:text-red-600 text-xs">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
