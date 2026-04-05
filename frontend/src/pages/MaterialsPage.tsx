import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialsApi } from '../api/materials'
import type { Material } from '../api/materials'
import { purchaseOrdersApi } from '../api/purchaseOrders'
import type { PurchaseOrder } from '../api/purchaseOrders'

type SubTab = 'stock' | 'orders' | 'schedule'

export default function MaterialsPage() {
  const qc = useQueryClient()
  const today = new Date().toISOString().split('T')[0]
  const [subTab, setSubTab] = useState<SubTab>('stock')

  // ── 材料マスタ ────────────────────────────────────────────────────────────
  const { data: materials } = useQuery({
    queryKey: ['materials'],
    queryFn: () => materialsApi.list().then(r => r.data),
  })
  const [matForm, setMatForm] = useState({ material_code: '', material_name: '', unit: '個', stock_quantity: 0, reorder_point: 0, unit_price: 0, supplier_name: '', lead_days: 0, note: '' })
  const [matEditId, setMatEditId] = useState<number | null>(null)
  const [stockAction, setStockAction] = useState<{ id: number; type: 'receive' | 'issue' } | null>(null)
  const [stockQty, setStockQty] = useState(1)

  const createMat = useMutation({ mutationFn: () => materialsApi.create({ ...matForm, supplier_name: matForm.supplier_name || undefined, note: matForm.note || undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['materials'] }); resetMat() } })
  const updateMat = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<Material> }) => materialsApi.update(id, data as Parameters<typeof materialsApi.update>[1]), onSuccess: () => { qc.invalidateQueries({ queryKey: ['materials'] }); resetMat() } })
  const deleteMat = useMutation({ mutationFn: materialsApi.delete, onSuccess: () => qc.invalidateQueries({ queryKey: ['materials'] }) })
  const stockMut = useMutation({
    mutationFn: () => stockAction?.type === 'receive'
      ? materialsApi.receive(stockAction.id, stockQty)
      : materialsApi.issue(stockAction!.id, stockQty),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['materials'] }); setStockAction(null); setStockQty(1) },
  })
  const resetMat = () => { setMatForm({ material_code: '', material_name: '', unit: '個', stock_quantity: 0, reorder_point: 0, unit_price: 0, supplier_name: '', lead_days: 0, note: '' }); setMatEditId(null) }

  // ── 発注管理 ──────────────────────────────────────────────────────────────
  const { data: purchaseOrders } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => purchaseOrdersApi.list().then(r => r.data),
  })
  const { data: poSchedule } = useQuery({
    queryKey: ['po-schedule'],
    queryFn: () => purchaseOrdersApi.schedule(60).then(r => r.data),
  })
  const [poForm, setPoForm] = useState({ material_id: 0, supplier_name: '', quantity: 1, unit_price: 0, order_date: today, expected_delivery_date: today, note: '' })
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null)
  const [receiveForm, setReceiveForm] = useState({ received_quantity: 0, actual_delivery_date: today, note: '' })

  const createPo = useMutation({
    mutationFn: () => purchaseOrdersApi.create({ ...poForm, unit_price: poForm.unit_price || undefined, note: poForm.note || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['po-schedule'] }); setPoForm({ material_id: 0, supplier_name: '', quantity: 1, unit_price: 0, order_date: today, expected_delivery_date: today, note: '' }) },
  })
  const receivePo = useMutation({
    mutationFn: () => purchaseOrdersApi.receive(receiveTarget!.id, receiveForm.received_quantity, receiveForm.actual_delivery_date, receiveForm.note || undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['po-schedule'] }); qc.invalidateQueries({ queryKey: ['materials'] }); setReceiveTarget(null) },
  })
  const cancelPo = useMutation({
    mutationFn: purchaseOrdersApi.cancel,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['po-schedule'] }) },
  })

  const overdueCount = purchaseOrders?.filter(p => p.is_overdue).length ?? 0

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">材料在庫管理</h1>

      {/* 入出庫モーダル */}
      {stockAction && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-80 shadow-xl">
            <h3 className="font-semibold text-gray-800 mb-4">{stockAction.type === 'receive' ? '入庫登録' : '払出登録'}</h3>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">数量</label>
              <input type="number" min={0.1} step={0.1} value={stockQty} onChange={e => setStockQty(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setStockAction(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">キャンセル</button>
              <button onClick={() => stockMut.mutate()}
                className={`text-white px-5 py-2 rounded-lg text-sm font-medium ${stockAction.type === 'receive' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-500 hover:bg-orange-600'}`}>
                {stockAction.type === 'receive' ? '入庫' : '払出'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 入荷確認モーダル */}
      {receiveTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h3 className="font-semibold text-gray-800 mb-1">入荷確認</h3>
            <p className="text-xs text-gray-500 mb-4">{receiveTarget.po_number} — {receiveTarget.material_name}</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">受入数量（発注: {receiveTarget.quantity} {receiveTarget.unit}）</label>
                <input type="number" min={0.1} step={0.1} value={receiveForm.received_quantity}
                  onChange={e => setReceiveForm(f => ({ ...f, received_quantity: Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">実際の入荷日</label>
                <input type="date" value={receiveForm.actual_delivery_date}
                  onChange={e => setReceiveForm(f => ({ ...f, actual_delivery_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
                <input value={receiveForm.note} onChange={e => setReceiveForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="品質問題など" />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setReceiveTarget(null)} className="px-4 py-2 text-sm text-gray-500">キャンセル</button>
              <button onClick={() => receivePo.mutate()} disabled={receivePo.isPending}
                className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                入荷確認・在庫反映
              </button>
            </div>
          </div>
        </div>
      )}

      {/* サブタブ */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {([['stock', '在庫管理'], ['orders', '発注管理'], ['schedule', '納入スケジュール']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${subTab === id ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
            {id === 'orders' && overdueCount > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5">{overdueCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* 在庫管理 */}
      {subTab === 'stock' && (
        <>
          <form
            onSubmit={e => { e.preventDefault(); matEditId ? updateMat.mutate({ id: matEditId, data: matForm }) : createMat.mutate() }}
            className="bg-white border border-gray-200 rounded-xl p-5 mb-5 shadow-sm grid grid-cols-3 gap-4"
          >
            <h2 className="col-span-3 text-base font-semibold text-gray-700">{matEditId ? '材料編集' : '材料追加'}</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">材料コード *</label>
              <input required value={matForm.material_code} onChange={e => setMatForm(f => ({ ...f, material_code: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="MAT-001" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">材料名 *</label>
              <input required value={matForm.material_name} onChange={e => setMatForm(f => ({ ...f, material_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="S45C丸棒 φ50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">単位</label>
              <select value={matForm.unit} onChange={e => setMatForm(f => ({ ...f, unit: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {['個', 'kg', 'm', '本', '枚'].map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">現在庫</label>
              <input type="number" min={0} step={0.1} value={matForm.stock_quantity}
                onChange={e => setMatForm(f => ({ ...f, stock_quantity: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">発注点</label>
              <input type="number" min={0} step={0.1} value={matForm.reorder_point}
                onChange={e => setMatForm(f => ({ ...f, reorder_point: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">単価（円）</label>
              <input type="number" min={0} value={matForm.unit_price}
                onChange={e => setMatForm(f => ({ ...f, unit_price: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">仕入先</label>
              <input value={matForm.supplier_name} onChange={e => setMatForm(f => ({ ...f, supplier_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">調達リードタイム（日）</label>
              <input type="number" min={0} value={matForm.lead_days}
                onChange={e => setMatForm(f => ({ ...f, lead_days: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
              <input value={matForm.note} onChange={e => setMatForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-3 flex gap-3 justify-end">
              {matEditId && <button type="button" onClick={resetMat} className="px-4 py-2 text-sm text-gray-500">キャンセル</button>}
              <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                {matEditId ? '更新' : '追加'}
              </button>
            </div>
          </form>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">コード</th>
                  <th className="px-4 py-3 text-left">材料名</th>
                  <th className="px-4 py-3 text-right">在庫</th>
                  <th className="px-4 py-3 text-right">発注点</th>
                  <th className="px-4 py-3 text-right">単価</th>
                  <th className="px-4 py-3 text-left">仕入先</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materials?.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">材料データがありません</td></tr>
                )}
                {materials?.map((m: Material) => (
                  <tr key={m.id} className={`hover:bg-gray-50 ${m.is_low_stock ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3 font-mono text-gray-600">{m.material_code}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {m.is_low_stock && <span className="mr-1 text-red-500 text-xs font-bold">要発注</span>}
                      {m.material_name}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">{m.stock_quantity} {m.unit}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{m.reorder_point} {m.unit}</td>
                    <td className="px-4 py-3 text-right text-gray-600">¥{m.unit_price.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-600">{m.supplier_name ?? '—'}</td>
                    <td className="px-4 py-3 text-center flex gap-2 justify-center">
                      <button onClick={() => { setStockAction({ id: m.id, type: 'receive' }); setStockQty(1) }} className="text-green-600 hover:text-green-800 text-xs font-medium">入庫</button>
                      <button onClick={() => { setStockAction({ id: m.id, type: 'issue' }); setStockQty(1) }} className="text-orange-500 hover:text-orange-700 text-xs font-medium">払出</button>
                      <button onClick={() => { setMatForm({ material_code: m.material_code, material_name: m.material_name, unit: m.unit, stock_quantity: m.stock_quantity, reorder_point: m.reorder_point, unit_price: m.unit_price, supplier_name: m.supplier_name ?? '', lead_days: m.lead_days, note: m.note ?? '' }); setMatEditId(m.id) }} className="text-blue-500 hover:text-blue-700 text-xs">編集</button>
                      <button onClick={() => { if (confirm('削除しますか？')) deleteMat.mutate(m.id) }} className="text-red-400 hover:text-red-600 text-xs">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 発注管理 */}
      {subTab === 'orders' && (
        <>
          <form
            onSubmit={e => { e.preventDefault(); if (!poForm.material_id) return; createPo.mutate() }}
            className="bg-white border border-gray-200 rounded-xl p-5 mb-5 shadow-sm"
          >
            <h2 className="text-base font-semibold text-gray-700 mb-4">発注登録</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">材料 *</label>
                <select required value={poForm.material_id} onChange={e => setPoForm(f => ({ ...f, material_id: Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value={0}>選択してください</option>
                  {materials?.map(m => <option key={m.id} value={m.id}>[{m.material_code}] {m.material_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">仕入先 *</label>
                <input required value={poForm.supplier_name} onChange={e => setPoForm(f => ({ ...f, supplier_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="○○商会" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">発注数量 *</label>
                <input required type="number" min={0.1} step={0.1} value={poForm.quantity}
                  onChange={e => setPoForm(f => ({ ...f, quantity: Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">発注単価（円）</label>
                <input type="number" min={0} value={poForm.unit_price}
                  onChange={e => setPoForm(f => ({ ...f, unit_price: Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">発注日 *</label>
                <input required type="date" value={poForm.order_date}
                  onChange={e => setPoForm(f => ({ ...f, order_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">納入予定日 *</label>
                <input required type="date" value={poForm.expected_delivery_date}
                  onChange={e => setPoForm(f => ({ ...f, expected_delivery_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
                <input value={poForm.note} onChange={e => setPoForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={createPo.isPending}
                  className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 w-full">
                  発注登録
                </button>
              </div>
            </div>
          </form>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">発注番号</th>
                  <th className="px-4 py-3 text-left">材料</th>
                  <th className="px-4 py-3 text-left">仕入先</th>
                  <th className="px-4 py-3 text-right">数量</th>
                  <th className="px-4 py-3 text-center">発注日</th>
                  <th className="px-4 py-3 text-center">納入予定日</th>
                  <th className="px-4 py-3 text-center">状態</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {purchaseOrders?.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">発注データがありません</td></tr>
                )}
                {purchaseOrders?.map((po: PurchaseOrder) => (
                  <tr key={po.id} className={`hover:bg-gray-50 ${po.is_overdue ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{po.po_number}</td>
                    <td className="px-4 py-3 text-gray-800">{po.material_name}</td>
                    <td className="px-4 py-3 text-gray-600">{po.supplier_name}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{po.quantity} {po.unit}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{po.order_date}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={po.is_overdue ? 'text-red-600 font-semibold' : 'text-gray-600'}>{po.expected_delivery_date}</span>
                      {po.is_overdue && <span className="ml-1 text-xs text-red-500">遅延</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {po.status === 'ordered' && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">発注済</span>}
                      {po.status === 'partial' && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs">一部入荷</span>}
                      {po.status === 'received' && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">入荷済</span>}
                      {po.status === 'cancelled' && <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">キャンセル</span>}
                    </td>
                    <td className="px-4 py-3 text-center flex gap-2 justify-center">
                      {(po.status === 'ordered' || po.status === 'partial') && (
                        <button onClick={() => { setReceiveTarget(po); setReceiveForm({ received_quantity: po.quantity, actual_delivery_date: today, note: '' }) }}
                          className="text-green-600 hover:text-green-800 text-xs font-medium">入荷確認</button>
                      )}
                      {po.status === 'ordered' && (
                        <button onClick={() => { if (confirm('キャンセルしますか？')) cancelPo.mutate(po.id) }}
                          className="text-red-400 hover:text-red-600 text-xs">取消</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 納入スケジュール */}
      {subTab === 'schedule' && (
        <>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5 text-sm text-blue-700">
            今後60日以内の納入予定（未入荷・一部入荷のみ表示）
          </div>
          {poSchedule?.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
              今後60日以内に予定されている納入はありません
            </div>
          )}
          <div className="space-y-3">
            {poSchedule?.map((po: PurchaseOrder) => (
              <div key={po.id} className={`bg-white border rounded-xl p-4 flex items-center gap-4 shadow-sm ${po.is_overdue ? 'border-red-200' : 'border-gray-200'}`}>
                <div className={`w-14 text-center rounded-lg py-2 flex-shrink-0 ${po.is_overdue ? 'bg-red-100' : 'bg-blue-50'}`}>
                  <div className={`text-xs font-medium ${po.is_overdue ? 'text-red-500' : 'text-blue-500'}`}>
                    {new Date(po.expected_delivery_date).toLocaleDateString('ja-JP', { month: 'short' })}
                  </div>
                  <div className={`text-xl font-bold ${po.is_overdue ? 'text-red-700' : 'text-blue-700'}`}>
                    {new Date(po.expected_delivery_date).getDate()}
                  </div>
                  {po.is_overdue && <div className="text-xs text-red-500">遅延</div>}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800">{po.material_name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{po.po_number} · {po.supplier_name} · {po.quantity} {po.unit}</div>
                  {po.note && <div className="text-xs text-gray-400 mt-0.5">{po.note}</div>}
                </div>
                <div>
                  {po.status === 'ordered' && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">発注済</span>}
                  {po.status === 'partial' && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">一部入荷</span>}
                </div>
                <button onClick={() => { setReceiveTarget(po); setReceiveForm({ received_quantity: po.quantity, actual_delivery_date: today, note: '' }) }}
                  className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 flex-shrink-0">
                  入荷確認
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
