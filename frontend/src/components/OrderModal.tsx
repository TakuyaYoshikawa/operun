import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ordersApi } from '../api/orders'
import { machinesApi } from '../api/machines'
import { customersApi } from '../api/customers'
import { scheduleApi } from '../api/schedule'
import { operationsApi } from '../api/operations'
import { productTemplatesApi } from '../api/productTemplates'
import { CustomerCreateModal } from './CustomerCreateModal'
import type { Order, OrderCreate, OrderStatus, Operation, OperationCreate } from '../api/orders'
import type { ProductTemplate } from '../api/productTemplates'

const PRIORITY_COLOR: Record<number, string> = {
  1: 'bg-red-100 text-red-700',
  2: 'bg-yellow-100 text-yellow-700',
  3: 'bg-gray-100 text-gray-600',
}
const STATUS_LABEL: Record<string, string> = {
  pending: '未着手', in_progress: '進行中', done: '完了',
}
const OP_STATUS_CLS: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
}
const OP_STATUS_LABEL: Record<string, string> = {
  not_started: '未着手', in_progress: '作業中', done: '完了',
}

const emptyOpForm: OperationCreate = {
  machine_id: 0, duration_hours: 1, is_urgent: false,
  machine_locked: false, wait_hours_after: 0, not_before_date: null,
}

// ── 工程エディタ ─────────────────────────────────────────────────────────────

function OpsEditor({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const qc = useQueryClient()
  const [opForm, setOpForm] = useState<OperationCreate>(emptyOpForm)
  const [editOpId, setEditOpId] = useState<number | null>(null)

  const { data: machines } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.list({ is_active: true }).then(r => r.data),
  })

  const inv = () => { qc.invalidateQueries({ queryKey: ['orders'] }); onChanged() }

  const addMut    = useMutation({ mutationFn: (d: OperationCreate) => ordersApi.operations.add(order.id, d), onSuccess: () => { inv(); setOpForm(emptyOpForm) } })
  const updateMut = useMutation({ mutationFn: ({ opId, d }: { opId: number; d: Partial<OperationCreate> }) => ordersApi.operations.update(order.id, opId, d), onSuccess: () => { inv(); setOpForm(emptyOpForm); setEditOpId(null) } })
  const deleteMut = useMutation({ mutationFn: (opId: number) => ordersApi.operations.delete(order.id, opId), onSuccess: inv })
  const startMut  = useMutation({ mutationFn: (opId: number) => operationsApi.start(opId), onSuccess: inv })
  const finishMut = useMutation({ mutationFn: (opId: number) => operationsApi.complete(opId), onSuccess: inv })
  const lockMut   = useMutation({ mutationFn: (opId: number) => scheduleApi.toggleLock(opId), onSuccess: inv })

  const machineName = (id: number) => machines?.find(m => m.id === id)?.name ?? `設備#${id}`
  const machineType = (id: number) => machines?.find(m => m.id === id)?.machine_type ?? null

  const machineGroups = (() => {
    if (!machines) return []
    const seen = new Map<string | null, typeof machines>()
    for (const m of machines) {
      if (!seen.has(m.machine_type)) seen.set(m.machine_type, [])
      seen.get(m.machine_type)!.push(m)
    }
    return Array.from(seen.entries()).map(([type, ms]) => ({ type, machines: ms }))
  })()

  const startEdit = (op: Operation) => {
    setOpForm({ machine_id: op.machine_id, duration_hours: op.duration_hours, is_urgent: op.is_urgent, machine_locked: op.machine_locked, wait_hours_after: op.wait_hours_after ?? 0, not_before_date: op.not_before_date ?? null })
    setEditOpId(op.id)
  }

  const handleOpSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (opForm.machine_id === 0) return
    if (editOpId) updateMut.mutate({ opId: editOpId, d: opForm })
    else addMut.mutate(opForm)
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">
        工程一覧
        <span className="ml-2 text-xs font-normal text-gray-400">{order.operations.length} 工程 — 上から順に加工</span>
      </h3>

      {order.operations.length > 0 && (
        <div className="space-y-1 mb-3">
          {order.operations.map((op, i) => (
            <div key={op.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${editOpId === op.id ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
              <span className="w-5 h-5 rounded-full bg-gray-300 text-white text-[10px] flex items-center justify-center flex-shrink-0">{i + 1}</span>
              <span className="font-medium text-gray-700 flex-1 min-w-0 truncate">
                {op.machine_locked ? machineName(op.machine_id) : (machineType(op.machine_id) ?? machineName(op.machine_id))}
              </span>
              {!op.machine_locked && machineType(op.machine_id) && (
                <span className="text-[10px] px-1 py-0.5 bg-indigo-50 text-indigo-500 rounded flex-shrink-0">自動</span>
              )}
              <span className="text-gray-500 flex-shrink-0">{op.duration_hours}h</span>
              {op.planned_start && (
                <span className="text-[10px] text-gray-400 flex-shrink-0 hidden sm:block">
                  {op.planned_start.slice(5, 10)}〜{op.planned_end?.slice(5, 10)}
                </span>
              )}
              <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${OP_STATUS_CLS[op.op_status ?? 'not_started']}`}>
                {OP_STATUS_LABEL[op.op_status ?? 'not_started']}
              </span>
              {op.is_urgent && <span className="text-[10px] px-1 py-0.5 bg-red-100 text-red-600 rounded flex-shrink-0">特急</span>}
              {/* アクション */}
              <button onClick={() => lockMut.mutate(op.id)} disabled={lockMut.isPending} title="ロック切替" className="text-sm flex-shrink-0 opacity-60 hover:opacity-100">
                🔒
              </button>
              {op.op_status === 'not_started' && (
                <button onClick={() => startMut.mutate(op.id)} disabled={startMut.isPending} className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded hover:bg-blue-600 disabled:opacity-50 flex-shrink-0">着手</button>
              )}
              {op.op_status === 'in_progress' && (
                <button onClick={() => finishMut.mutate(op.id)} disabled={finishMut.isPending} className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded hover:bg-green-600 disabled:opacity-50 flex-shrink-0">完了</button>
              )}
              <button onClick={() => startEdit(op)} className="text-[10px] text-blue-400 hover:text-blue-600 flex-shrink-0">編集</button>
              <button onClick={() => { if (confirm('削除しますか？')) deleteMut.mutate(op.id) }} className="text-[10px] text-red-300 hover:text-red-500 flex-shrink-0">削除</button>
            </div>
          ))}
        </div>
      )}

      {/* 工程追加フォーム */}
      <form onSubmit={handleOpSubmit} className="flex gap-2 items-end flex-wrap bg-gray-50 rounded-lg px-3 py-2">
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">設備 *</label>
          <select required value={opForm.machine_id} onChange={e => setOpForm(f => ({ ...f, machine_id: Number(e.target.value) }))} className="border border-gray-300 rounded px-2 py-1 text-xs">
            <option value={0} disabled>選択</option>
            {machineGroups.map(({ type, machines: ms }) => (
              type ? <optgroup key={type} label={type}>{ms.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>
                   : ms.map(m => <option key={m.id} value={m.id}>{m.name}</option>)
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={!opForm.machine_locked} onChange={e => setOpForm(f => ({ ...f, machine_locked: !e.target.checked }))} className="accent-indigo-600" />
          自動選択
        </label>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">時間(h)</label>
          <input required type="number" min={0.5} step={0.5} value={opForm.duration_hours} onChange={e => setOpForm(f => ({ ...f, duration_hours: Number(e.target.value) }))} className="w-16 border border-gray-300 rounded px-2 py-1 text-xs" />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">完了後待機(h)</label>
          <input type="number" min={0} step={0.5} value={opForm.wait_hours_after ?? 0} onChange={e => setOpForm(f => ({ ...f, wait_hours_after: Number(e.target.value) }))} className="w-14 border border-gray-300 rounded px-2 py-1 text-xs" />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">開始不可日</label>
          <input type="date" value={opForm.not_before_date ?? ''} onChange={e => setOpForm(f => ({ ...f, not_before_date: e.target.value || null }))} className="border border-gray-300 rounded px-2 py-1 text-xs" />
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={opForm.is_urgent} onChange={e => setOpForm(f => ({ ...f, is_urgent: e.target.checked }))} className="accent-red-500" />
          特急
        </label>
        <button type="submit" disabled={addMut.isPending || updateMut.isPending} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-60">
          {editOpId ? '更新' : '＋ 追加'}
        </button>
        {editOpId && (
          <button type="button" onClick={() => { setOpForm(emptyOpForm); setEditOpId(null) }} className="text-xs text-gray-400 hover:text-gray-600">キャンセル</button>
        )}
      </form>
    </div>
  )
}

// ── OrderModal 本体 ───────────────────────────────────────────────────────────

interface Props {
  /** 既存受注IDを渡すと編集モード。省略すると新規作成モード */
  orderId?: number
  onClose: () => void
  /** 受注データが変更されたときに呼ぶ（ガントのリフレッシュ等） */
  onChanged?: () => void
}

export function OrderModal({ orderId, onClose, onChanged }: Props) {
  const qc = useQueryClient()
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<ProductTemplate | null>(null)

  // 編集対象のID（作成後は createdId を使う）
  const targetId = createdId ?? orderId

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', targetId],
    queryFn: () => ordersApi.get(targetId!).then(r => r.data),
    enabled: !!targetId,
  })
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customersApi.list().then(r => r.data),
  })
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => productTemplatesApi.list().then(r => r.data),
  })

  // ── 新規作成フォーム ──
  const [newForm, setNewForm] = useState<OrderCreate>({
    order_number: '', product_name: '', product_code: '',
    quantity: 1, due_date: '', priority: 3, status: 'pending', note: '', customer_id: null,
  })

  const applyTemplate = (t: ProductTemplate) => {
    setSelectedTemplate(t)
    setNewForm(f => ({ ...f, product_name: t.product_name, product_code: t.product_code }))
  }

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await ordersApi.create(newForm)
      const orderId = res.data.id
      if (selectedTemplate && selectedTemplate.operations.length > 0) {
        for (const op of selectedTemplate.operations) {
          await ordersApi.operations.add(orderId, {
            machine_id: op.machine_id,
            duration_hours: op.hours_per_unit,
            machine_locked: false,
            is_urgent: false,
            wait_hours_after: 0,
            not_before_date: null,
          })
        }
      }
      return res
    },
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      onChanged?.()
      setCreatedId(res.data.id)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg ?? '登録に失敗しました')
    },
  })

  // ── 既存受注編集フォーム ──
  const [editForm, setEditForm] = useState<Partial<OrderCreate>>({})
  const [dirty, setDirty] = useState(false)

  // order が取得できたら editForm を初期化
  React.useEffect(() => {
    if (order) {
      setEditForm({
        product_name: order.product_name, product_code: order.product_code,
        quantity: order.quantity, due_date: order.due_date,
        priority: order.priority, status: order.status,
        note: order.note ?? '', customer_id: order.customer_id ?? null,
      })
      setDirty(false)
    }
  }, [order?.id])

  const updateField = <K extends keyof OrderCreate>(k: K, v: OrderCreate[K]) => {
    setEditForm(f => ({ ...f, [k]: v }))
    setDirty(true)
  }

  const updateMut = useMutation({
    mutationFn: () => ordersApi.update(targetId!, editForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['order', targetId] })
      onChanged?.()
      setDirty(false)
    },
  })
  const deleteMut = useMutation({
    mutationFn: () => ordersApi.delete(targetId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      onChanged?.()
      onClose()
    },
  })

  const isCreateMode = !targetId

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-800">
              {isCreateMode ? '新規受注登録' : `受注：${order?.order_number ?? '…'}`}
            </h2>
            {order && (
              <p className="text-xs text-gray-400 mt-0.5">{order.product_name}
                <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${PRIORITY_COLOR[order.priority]}`}>
                  {['', '特急', '高', '通常'][order.priority]}
                </span>
                <span className="ml-1 text-gray-400">{STATUS_LABEL[order.status]}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* ボディ（スクロール可） */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* ── 新規作成フォーム ── */}
          {isCreateMode && (
            <form onSubmit={e => { e.preventDefault(); createMut.mutate() }} className="space-y-4">
              {/* テンプレート選択 */}
              {templates && templates.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <label className="block text-xs font-medium text-blue-700 mb-1.5">品番テンプレートから選択</label>
                  <select
                    value={selectedTemplate?.id ?? ''}
                    onChange={e => {
                      const t = templates.find(t => t.id === Number(e.target.value))
                      if (t) applyTemplate(t)
                      else { setSelectedTemplate(null); setNewForm(f => ({ ...f, product_name: '', product_code: '' })) }
                    }}
                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="">テンプレートを選択（任意）</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.product_code ? `[${t.product_code}] ` : ''}{t.product_name}</option>
                    ))}
                  </select>
                  {selectedTemplate && selectedTemplate.operations.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] font-medium text-blue-600">登録後に自動追加される工程：</p>
                      {selectedTemplate.operations.map((op, i) => (
                        <div key={i} className="text-[10px] text-blue-500 flex gap-2 pl-2">
                          <span>{i + 1}.</span>
                          <span>{op.machine_name}</span>
                          <span className="text-blue-400">{op.hours_per_unit}h</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">受注番号 *</label>
                  <input required value={newForm.order_number} onChange={e => setNewForm(f => ({ ...f, order_number: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="ORD-001" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">品名 *</label>
                  <input required value={newForm.product_name} onChange={e => setNewForm(f => ({ ...f, product_name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="部品A" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">品番</label>
                  <input value={newForm.product_code} onChange={e => setNewForm(f => ({ ...f, product_code: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="ABC-001" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">数量 *</label>
                  <input required type="number" min={1} value={newForm.quantity} onChange={e => setNewForm(f => ({ ...f, quantity: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">納期 *</label>
                  <input required type="date" value={newForm.due_date} onChange={e => setNewForm(f => ({ ...f, due_date: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">優先度</label>
                  <select value={newForm.priority} onChange={e => setNewForm(f => ({ ...f, priority: Number(e.target.value) as 1|2|3 }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value={1}>特急</option><option value={2}>高</option><option value={3}>通常</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-gray-500">取引先</label>
                    <button type="button" onClick={() => setShowCustomerModal(true)} className="text-xs text-blue-600 hover:text-blue-800">＋ 新規登録</button>
                  </div>
                  <select value={newForm.customer_id ?? ''} onChange={e => setNewForm(f => ({ ...f, customer_id: e.target.value ? Number(e.target.value) : null }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">未選択</option>
                    {customers?.items?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">備考</label>
                  <input value={newForm.note ?? ''} onChange={e => setNewForm(f => ({ ...f, note: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <button type="submit" disabled={createMut.isPending} className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                {createMut.isPending ? '登録中...' : '登録して工程を追加 →'}
              </button>
            </form>
          )}

          {/* ── 既存受注：ローディング ── */}
          {!isCreateMode && isLoading && (
            <p className="text-sm text-gray-400 text-center py-8">読み込み中...</p>
          )}

          {/* ── 既存受注：詳細 ── */}
          {!isCreateMode && order && (
            <>
              {/* 受注情報編集 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">受注情報</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">受注番号</label>
                    <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{order.order_number}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">品名 *</label>
                    <input value={editForm.product_name ?? ''} onChange={e => updateField('product_name', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">品番</label>
                    <input value={editForm.product_code ?? ''} onChange={e => updateField('product_code', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">数量</label>
                    <input type="number" min={1} value={editForm.quantity ?? 1} onChange={e => updateField('quantity', Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">納期 *</label>
                    <input type="date" value={editForm.due_date ?? ''} onChange={e => updateField('due_date', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">優先度</label>
                    <select value={editForm.priority ?? 3} onChange={e => updateField('priority', Number(e.target.value) as 1|2|3)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value={1}>特急</option><option value={2}>高</option><option value={3}>通常</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">ステータス</label>
                    <select value={editForm.status ?? 'pending'} onChange={e => updateField('status', e.target.value as OrderStatus)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="pending">未着手</option><option value="in_progress">進行中</option><option value="done">完了</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-500">取引先</label>
                      <button type="button" onClick={() => setShowCustomerModal(true)} className="text-xs text-blue-600 hover:text-blue-800">＋ 新規登録</button>
                    </div>
                    <select value={editForm.customer_id ?? ''} onChange={e => updateField('customer_id', e.target.value ? Number(e.target.value) : null)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="">未選択</option>
                      {customers?.items?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">備考</label>
                    <input value={editForm.note ?? ''} onChange={e => updateField('note', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => updateMut.mutate()} disabled={!dirty || updateMut.isPending} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
                    {updateMut.isPending ? '保存中...' : '変更を保存'}
                  </button>
                  <button onClick={() => { if (confirm('この受注を削除しますか？')) deleteMut.mutate() }} disabled={deleteMut.isPending} className="ml-auto border border-red-300 text-red-500 px-4 py-1.5 rounded-lg text-sm hover:bg-red-50 disabled:opacity-40">
                    受注を削除
                  </button>
                </div>
              </div>

              {/* 工程一覧 */}
              <div className="border-t border-gray-100 pt-4">
                <OpsEditor order={order} onChanged={() => {
                  qc.invalidateQueries({ queryKey: ['order', targetId] })
                  onChanged?.()
                }} />
              </div>
            </>
          )}
        </div>

        {/* フッター（閉じるボタン） */}
        <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="w-full border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">閉じる</button>
        </div>
      </div>

      {showCustomerModal && (
        <CustomerCreateModal
          onClose={() => setShowCustomerModal(false)}
          onCreated={(id) => {
            if (isCreateMode) setNewForm(f => ({ ...f, customer_id: id }))
            else updateField('customer_id', id)
            setShowCustomerModal(false)
          }}
        />
      )}
    </div>
  )
}
