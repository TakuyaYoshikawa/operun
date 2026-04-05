import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ordersApi } from '../api/orders'
import { machinesApi } from '../api/machines'
import { processesApi } from '../api/machines'
import { customersApi } from '../api/customers'
import type { OrderCreate, Order, OrderStatus, Operation, OperationCreate } from '../api/orders'

const PRIORITY_LABEL: Record<number, string> = { 1: '特急', 2: '高', 3: '通常' }
const PRIORITY_COLOR: Record<number, string> = {
  1: 'bg-red-100 text-red-700',
  2: 'bg-yellow-100 text-yellow-700',
  3: 'bg-gray-100 text-gray-600',
}
const STATUS_LABEL: Record<string, string> = {
  pending: '未着手',
  in_progress: '進行中',
  done: '完了',
}

const emptyForm: OrderCreate = {
  order_number: '', product_name: '', product_code: '',
  quantity: 1, due_date: '', priority: 3, status: 'pending', note: '', customer_id: null,
}

const emptyOpForm: OperationCreate = {
  machine_id: 0, process_id: null, duration_hours: 1, is_urgent: false,
}

// ── 工程エディタ（受注詳細の下部に表示）─────────────────────────────────────

function OperationsEditor({ order }: { order: Order }) {
  const qc = useQueryClient()
  const [opForm, setOpForm] = useState<OperationCreate>(emptyOpForm)
  const [editOpId, setEditOpId] = useState<number | null>(null)

  const { data: machines } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.list({ is_active: true }).then(r => r.data),
  })
  const { data: processes } = useQuery({
    queryKey: ['processes'],
    queryFn: () => processesApi.list().then(r => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['orders'] })

  const addMut = useMutation({
    mutationFn: (data: OperationCreate) => ordersApi.operations.add(order.id, data),
    onSuccess: () => { invalidate(); setOpForm(emptyOpForm) },
  })
  const updateMut = useMutation({
    mutationFn: ({ opId, data }: { opId: number; data: Partial<OperationCreate> }) =>
      ordersApi.operations.update(order.id, opId, data),
    onSuccess: () => { invalidate(); setOpForm(emptyOpForm); setEditOpId(null) },
  })
  const deleteMut = useMutation({
    mutationFn: (opId: number) => ordersApi.operations.delete(order.id, opId),
    onSuccess: invalidate,
  })
  const startMut = useMutation({
    mutationFn: (opId: number) => ordersApi.operations.start(order.id, opId),
    onSuccess: invalidate,
  })
  const finishMut = useMutation({
    mutationFn: (opId: number) => ordersApi.operations.finish(order.id, opId),
    onSuccess: invalidate,
  })

  const machineName = (id: number) =>
    machines?.find(m => m.id === id)?.name ?? `設備#${id}`
  const processName = (id: number | null) =>
    id ? (processes?.find(p => p.id === id)?.name ?? `工程#${id}`) : '—'

  const handleOpSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (opForm.machine_id === 0) return
    if (editOpId) {
      updateMut.mutate({ opId: editOpId, data: opForm })
    } else {
      addMut.mutate(opForm)
    }
  }

  const startEdit = (op: Operation) => {
    setOpForm({
      machine_id: op.machine_id,
      process_id: op.process_id,
      duration_hours: op.duration_hours,
      is_urgent: op.is_urgent,
    })
    setEditOpId(op.id)
  }

  const cancelEdit = () => { setOpForm(emptyOpForm); setEditOpId(null) }

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        工程一覧
        <span className="ml-2 text-xs font-normal text-gray-400">
          {order.operations.length} 工程 — 上から順に加工します
        </span>
      </h3>

      {order.operations.length > 0 && (
        <div className="mb-3 space-y-1">
          {order.operations.map((op, i) => (
            <div
              key={op.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                editOpId === op.id ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-gray-300 text-white text-xs flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              {i < order.operations.length - 1 && (
                <span className="text-gray-300 text-xs">→</span>
              )}
              <span className="font-medium text-gray-700 flex-1">{machineName(op.machine_id)}</span>
              <span className="text-gray-400">{processName(op.process_id)}</span>
              <span className="text-gray-500">{op.duration_hours}h</span>
              {op.is_urgent && (
                <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded">特急</span>
              )}
              {op.planned_start && (
                <span className="text-xs text-gray-400">
                  {op.planned_start.slice(0, 10)}〜{op.planned_end?.slice(0, 10)}
                </span>
              )}
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                op.op_status === 'done' ? 'bg-green-100 text-green-700' :
                op.op_status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-500'
              }`}>
                {op.op_status === 'done' ? '完了' : op.op_status === 'in_progress' ? '作業中' : '未着手'}
              </span>
              {op.op_status === 'not_started' && (
                <button
                  onClick={() => startMut.mutate(op.id)}
                  disabled={startMut.isPending}
                  className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded hover:bg-blue-600 disabled:opacity-50"
                >開始</button>
              )}
              {op.op_status === 'in_progress' && (
                <button
                  onClick={() => finishMut.mutate(op.id)}
                  disabled={finishMut.isPending}
                  className="text-xs bg-green-500 text-white px-2 py-0.5 rounded hover:bg-green-600 disabled:opacity-50"
                >完了</button>
              )}
              {op.actual_hours && (
                <span className="text-xs text-gray-400">実績 {op.actual_hours}h</span>
              )}
              <button
                onClick={() => startEdit(op)}
                className="text-blue-400 hover:text-blue-600 text-xs"
              >編集</button>
              <button
                onClick={() => { if (confirm('この工程を削除しますか？')) deleteMut.mutate(op.id) }}
                className="text-red-300 hover:text-red-500 text-xs"
              >削除</button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleOpSubmit} className="flex gap-2 items-end flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">設備 *</label>
          <select
            required
            value={opForm.machine_id}
            onChange={e => setOpForm(f => ({ ...f, machine_id: Number(e.target.value) }))}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          >
            <option value={0} disabled>選択</option>
            {machines?.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">工程</label>
          <select
            value={opForm.process_id ?? ''}
            onChange={e => setOpForm(f => ({ ...f, process_id: e.target.value ? Number(e.target.value) : null }))}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="">未選択</option>
            {processes?.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">所要時間(h) *</label>
          <input
            required type="number" min={0.5} step={0.5}
            value={opForm.duration_hours}
            onChange={e => setOpForm(f => ({ ...f, duration_hours: Number(e.target.value) }))}
            className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 pb-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={opForm.is_urgent}
            onChange={e => setOpForm(f => ({ ...f, is_urgent: e.target.checked }))}
            className="accent-red-500"
          />
          特急
        </label>
        <button
          type="submit"
          disabled={addMut.isPending || updateMut.isPending}
          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60"
        >
          {editOpId ? '更新' : '＋ 工程追加'}
        </button>
        {editOpId && (
          <button type="button" onClick={cancelEdit} className="text-sm text-gray-500 hover:text-gray-700 pb-1.5">
            キャンセル
          </button>
        )}
      </form>
    </div>
  )
}

// ── メイン ────────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<OrderCreate>(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list().then(r => r.data),
  })
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customersApi.list().then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      reset()
      setExpandedId(res.data.id)
    },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<OrderCreate> }) =>
      ordersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); reset() },
  })
  const deleteMut = useMutation({
    mutationFn: ordersApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })

  const reset = () => { setForm(emptyForm); setEditId(null); setShowForm(false) }

  const handleEdit = (o: Order) => {
    setForm({
      order_number: o.order_number, product_name: o.product_name,
      product_code: o.product_code, quantity: o.quantity,
      due_date: o.due_date, priority: o.priority,
      status: o.status, note: o.note ?? '', customer_id: o.customer_id ?? null,
    })
    setEditId(o.id)
    setShowForm(true)
    setExpandedId(null)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (editId) {
      updateMut.mutate({ id: editId, data: form })
    } else {
      createMut.mutate(form)
    }
  }

  const toggleExpand = (id: number) =>
    setExpandedId(prev => (prev === id ? null : id))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">受注一覧</h1>
        <button
          onClick={() => { reset(); setShowForm(true) }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          ＋ 受注登録
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">{editId ? '受注編集' : '受注登録'}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">受注番号 *</label>
              <input
                required disabled={!!editId}
                value={form.order_number}
                onChange={e => setForm(f => ({ ...f, order_number: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                placeholder="ORD-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">品名 *</label>
              <input
                required value={form.product_name}
                onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="部品A"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">品番 *</label>
              <input
                required value={form.product_code}
                onChange={e => setForm(f => ({ ...f, product_code: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="ABC-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">数量 *</label>
              <input
                required type="number" min={1}
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">納期 *</label>
              <input
                required type="date" value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">優先度</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) as 1 | 2 | 3 }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value={1}>特急</option>
                <option value={2}>高</option>
                <option value={3}>通常</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as OrderStatus }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="pending">未着手</option>
                <option value="in_progress">進行中</option>
                <option value="done">完了</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">顧客</label>
              <select
                value={form.customer_id ?? ''}
                onChange={e => setForm(f => ({ ...f, customer_id: e.target.value ? Number(e.target.value) : null }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">未選択</option>
                {customers?.items?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
              <input
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2 flex gap-3 justify-end mt-2">
              <button type="button" onClick={reset} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                キャンセル
              </button>
              <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                {editId ? '更新' : '登録して工程を追加 →'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-500 text-sm">読み込み中...</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">受注番号</th>
                <th className="px-4 py-3 text-left">品名</th>
                <th className="px-4 py-3 text-left">品番</th>
                <th className="px-4 py-3 text-right">数量</th>
                <th className="px-4 py-3 text-left">納期</th>
                <th className="px-4 py-3 text-center">優先度</th>
                <th className="px-4 py-3 text-center">ステータス</th>
                <th className="px-4 py-3 text-center">工程</th>
                <th className="px-4 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    受注データがありません
                  </td>
                </tr>
              )}
              {data?.items.map(o => (
                <>
                  <tr
                    key={o.id}
                    className={`hover:bg-gray-50 cursor-pointer ${expandedId === o.id ? 'bg-blue-50' : ''}`}
                    onClick={() => toggleExpand(o.id)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">{o.order_number}</td>
                    <td className="px-4 py-3 text-gray-700">{o.product_name}</td>
                    <td className="px-4 py-3 text-gray-500">{o.product_code}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{o.quantity}</td>
                    <td className="px-4 py-3 text-gray-700">{o.due_date}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLOR[o.priority]}`}>
                        {PRIORITY_LABEL[o.priority]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{STATUS_LABEL[o.status]}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        o.operations.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {o.operations.length}工程
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleEdit(o)} className="text-blue-500 hover:text-blue-700 mr-3 text-xs">編集</button>
                      <button
                        onClick={() => { if (confirm('削除しますか？')) deleteMut.mutate(o.id) }}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >削除</button>
                    </td>
                  </tr>
                  {expandedId === o.id && (
                    <tr key={`${o.id}-ops`}>
                      <td colSpan={9} className="px-6 py-4 bg-blue-50 border-t border-blue-100">
                        <OperationsEditor order={o} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          {data && (
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              合計 {data.total} 件　※行をクリックすると工程を管理できます
            </div>
          )}
        </div>
      )}
    </div>
  )
}
