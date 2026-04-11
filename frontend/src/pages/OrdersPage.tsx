import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ordersApi } from '../api/orders'
import { machinesApi } from '../api/machines'
import { customersApi } from '../api/customers'
import { CustomerCreateModal } from '../components/CustomerCreateModal'
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
  machine_locked: false, wait_hours_after: 0, not_before_date: null,
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
  const machineType = (id: number) =>
    machines?.find(m => m.id === id)?.machine_type ?? null
  // 設備をグループ（machine_type）別に整理
  const machineGroups = (() => {
    if (!machines) return []
    const groups: { type: string | null; machines: typeof machines }[] = []
    const seen = new Map<string | null, typeof machines[0][]>()
    for (const m of machines) {
      const key = m.machine_type
      if (!seen.has(key)) seen.set(key, [])
      seen.get(key)!.push(m)
    }
    for (const [type, ms] of seen) {
      groups.push({ type, machines: ms })
    }
    return groups
  })()

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
      duration_hours: op.duration_hours,
      is_urgent: op.is_urgent,
      machine_locked: op.machine_locked,
      wait_hours_after: op.wait_hours_after ?? 0,
      not_before_date: op.not_before_date ?? null,
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
              <span className="font-medium text-gray-700 flex-1">
                {op.machine_locked
                  ? machineName(op.machine_id)
                  : (machineType(op.machine_id) ?? machineName(op.machine_id))}
              </span>
              {!op.machine_locked && machineType(op.machine_id) && (
                <span className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-500 rounded" title="グループ内の空き設備を自動選択">自動</span>
              )}
              {op.machine_locked && (
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded" title="指定した設備に固定">固定</span>
              )}
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
          <label className="block text-xs text-gray-500 mb-1">設備グループ *</label>
          <select
            required
            value={opForm.machine_id}
            onChange={e => setOpForm(f => ({ ...f, machine_id: Number(e.target.value) }))}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          >
            <option value={0} disabled>選択</option>
            {machineGroups.map(({ type, machines: ms }) => (
              type
                ? <optgroup key={type} label={type}>
                    {ms.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </optgroup>
                : ms.map(m => <option key={m.id} value={m.id}>{m.name}</option>)
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">設備割り当て</label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-2 py-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!(opForm.machine_locked ?? false)}
              onChange={e => setOpForm(f => ({ ...f, machine_locked: !e.target.checked }))}
              className="accent-indigo-600"
            />
            {opForm.machine_locked ? '設備固定' : 'グループ自動選択'}
          </label>
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
        <div>
          <label className="block text-xs text-gray-500 mb-1">完了後待機(h)</label>
          <input
            type="number" min={0} step={0.5}
            value={opForm.wait_hours_after ?? 0}
            onChange={e => setOpForm(f => ({ ...f, wait_hours_after: Number(e.target.value) }))}
            className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            title="次工程開始までの待機時間（冷却・乾燥等）"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">開始不可日</label>
          <input
            type="date"
            value={opForm.not_before_date ?? ''}
            onChange={e => setOpForm(f => ({ ...f, not_before_date: e.target.value || null }))}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            title="材料入荷待ち等、この日付以降に工程を開始"
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

// ── 受注詳細パネル（行クリックで展開）──────────────────────────────────────

function OrderDetailPanel({ order, customers, onDeleted }: {
  order: Order
  customers: { id: number; name: string }[]
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Omit<OrderCreate, 'order_number'>>({
    product_name: order.product_name,
    product_code: order.product_code,
    quantity: order.quantity,
    due_date: order.due_date,
    priority: order.priority,
    status: order.status,
    note: order.note ?? '',
    customer_id: order.customer_id ?? null,
  })
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [dirty, setDirty] = useState(false)

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) => {
    setForm(f => ({ ...f, [k]: v }))
    setDirty(true)
  }

  const updateMut = useMutation({
    mutationFn: (data: Partial<OrderCreate>) => ordersApi.update(order.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setDirty(false) },
  })
  const deleteMut = useMutation({
    mutationFn: () => ordersApi.delete(order.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); onDeleted() },
  })

  return (
    <div className="px-6 py-5 bg-gray-50 border-t border-gray-200">
      {/* 受注情報 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">受注番号</label>
          <div className="text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2">
            {order.order_number}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">品名 *</label>
          <input
            required value={form.product_name}
            onChange={e => update('product_name', e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">品番</label>
          <input
            value={form.product_code}
            onChange={e => update('product_code', e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">数量</label>
          <input
            type="number" min={1} value={form.quantity}
            onChange={e => update('quantity', Number(e.target.value))}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">納期 *</label>
          <input
            type="date" value={form.due_date}
            onChange={e => update('due_date', e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">優先度</label>
          <select
            value={form.priority}
            onChange={e => update('priority', Number(e.target.value) as 1 | 2 | 3)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
          >
            <option value={1}>特急</option>
            <option value={2}>高</option>
            <option value={3}>通常</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">ステータス</label>
          <select
            value={form.status}
            onChange={e => update('status', e.target.value as OrderStatus)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
          >
            <option value="pending">未着手</option>
            <option value="in_progress">進行中</option>
            <option value="done">完了</option>
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-500">取引先</label>
            <button
              type="button"
              onClick={() => setShowCustomerModal(true)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              ＋ 新規登録
            </button>
          </div>
          <select
            value={form.customer_id ?? ''}
            onChange={e => update('customer_id', e.target.value ? Number(e.target.value) : null)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
          >
            <option value="">未選択</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="col-span-2 md:col-span-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">備考</label>
          <input
            value={form.note ?? ''}
            onChange={e => update('note', e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
            placeholder="（任意）"
          />
        </div>
      </div>

      {/* 保存・削除ボタン */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => updateMut.mutate(form)}
          disabled={!dirty || updateMut.isPending}
          className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-opacity"
        >
          {updateMut.isPending ? '保存中...' : '変更を保存'}
        </button>
        <button
          onClick={() => { if (confirm('この受注を削除しますか？')) deleteMut.mutate() }}
          disabled={deleteMut.isPending}
          className="border border-red-300 text-red-500 px-4 py-1.5 rounded-lg text-sm hover:bg-red-50 disabled:opacity-40 ml-auto"
        >
          受注を削除
        </button>
      </div>

      {/* 工程一覧 */}
      <OperationsEditor order={order} />

      {showCustomerModal && (
        <CustomerCreateModal
          onClose={() => setShowCustomerModal(false)}
          onCreated={(id) => { update('customer_id', id); setShowCustomerModal(false) }}
        />
      )}
    </div>
  )
}

// ── メイン ────────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<OrderCreate>(emptyForm)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)

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
      setForm(emptyForm)
      setShowForm(false)
      setExpandedId(res.data.id)
    },
  })

  const toggleExpand = (id: number) =>
    setExpandedId(prev => (prev === id ? null : id))

  const customerItems = customers?.items ?? []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">受注一覧</h1>
        <button
          onClick={() => { setForm(emptyForm); setShowForm(v => !v) }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          {showForm ? 'キャンセル' : '＋ 受注登録'}
        </button>
      </div>

      {/* 新規受注登録フォーム */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-4">新規受注登録</h2>
          <form
            onSubmit={e => { e.preventDefault(); createMut.mutate(form) }}
            className="grid grid-cols-2 gap-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">受注番号 *</label>
              <input
                required value={form.order_number}
                onChange={e => setForm(f => ({ ...f, order_number: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">品番</label>
              <input
                value={form.product_code}
                onChange={e => setForm(f => ({ ...f, product_code: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="ABC-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">数量 *</label>
              <input
                required type="number" min={1} value={form.quantity}
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
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">取引先</label>
                <button type="button" onClick={() => setShowCustomerModal(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  ＋ 新規登録
                </button>
              </div>
              <select
                value={form.customer_id ?? ''}
                onChange={e => setForm(f => ({ ...f, customer_id: e.target.value ? Number(e.target.value) : null }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">未選択</option>
                {customerItems.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
            <div className="col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={createMut.isPending}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                {createMut.isPending ? '登録中...' : '登録して工程を追加 →'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showCustomerModal && (
        <CustomerCreateModal
          onClose={() => setShowCustomerModal(false)}
          onCreated={(id) => { setForm(f => ({ ...f, customer_id: id })); setShowCustomerModal(false) }}
        />
      )}

      {isLoading ? (
        <p className="text-gray-500 text-sm">読み込み中...</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left w-4"></th>
                <th className="px-4 py-3 text-left">受注番号</th>
                <th className="px-4 py-3 text-left">品名</th>
                <th className="px-4 py-3 text-left">取引先</th>
                <th className="px-4 py-3 text-left">納期</th>
                <th className="px-4 py-3 text-center">優先度</th>
                <th className="px-4 py-3 text-center">ステータス</th>
                <th className="px-4 py-3 text-center">工程</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    受注データがありません
                  </td>
                </tr>
              )}
              {data?.items.map(o => {
                const isExpanded = expandedId === o.id
                const customerName = customerItems.find(c => c.id === o.customer_id)?.name
                return (
                  <React.Fragment key={o.id}>
                    <tr
                      className={`border-t border-gray-100 cursor-pointer transition-colors ${
                        isExpanded ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => toggleExpand(o.id)}
                    >
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {isExpanded ? '▾' : '▸'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{o.order_number}</td>
                      <td className="px-4 py-3 text-gray-700">{o.product_name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{customerName ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{o.due_date}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLOR[o.priority]}`}>
                          {PRIORITY_LABEL[o.priority]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600 text-xs">{STATUS_LABEL[o.status]}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          o.operations.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-600'
                        }`}>
                          {o.operations.length === 0 ? '⚠ 工程なし' : `${o.operations.length}工程`}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="p-0">
                          <OrderDetailPanel
                            order={o}
                            customers={customerItems}
                            onDeleted={() => setExpandedId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
          {data && (
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              合計 {data.total} 件　クリックで詳細・工程を編集できます
            </div>
          )}
        </div>
      )}
    </div>
  )
}
