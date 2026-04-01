import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ordersApi } from '../api/orders'
import type { OrderCreate, Order } from '../api/orders'

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
  order_number: '',
  product_name: '',
  product_code: '',
  quantity: 1,
  due_date: '',
  priority: 3,
  status: 'pending',
  note: '',
}

export default function OrdersPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<OrderCreate>(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list().then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); reset() },
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
      order_number: o.order_number,
      product_name: o.product_name,
      product_code: o.product_code,
      quantity: o.quantity,
      due_date: o.due_date,
      priority: o.priority,
      status: o.status,
      note: o.note ?? '',
    })
    setEditId(o.id)
    setShowForm(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editId) {
      updateMut.mutate({ id: editId, data: form })
    } else {
      createMut.mutate(form)
    }
  }

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

      {/* フォーム */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">{editId ? '受注編集' : '受注登録'}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">受注番号 *</label>
              <input
                required
                disabled={!!editId}
                value={form.order_number}
                onChange={e => setForm(f => ({ ...f, order_number: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                placeholder="ORD-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">品名 *</label>
              <input
                required
                value={form.product_name}
                onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="部品A"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">品番 *</label>
              <input
                required
                value={form.product_code}
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
                required type="date"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">優先度</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) as 1|2|3 }))}
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
                onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="pending">未着手</option>
                <option value="in_progress">進行中</option>
                <option value="done">完了</option>
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
                {editId ? '更新' : '登録'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* テーブル */}
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
                <th className="px-4 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    受注データがありません
                  </td>
                </tr>
              )}
              {data?.items.map(o => (
                <tr key={o.id} className="hover:bg-gray-50">
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
                    <button onClick={() => handleEdit(o)} className="text-blue-500 hover:text-blue-700 mr-3 text-xs">編集</button>
                    <button
                      onClick={() => { if (confirm('削除しますか？')) deleteMut.mutate(o.id) }}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && (
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              合計 {data.total} 件
            </div>
          )}
        </div>
      )}
    </div>
  )
}
