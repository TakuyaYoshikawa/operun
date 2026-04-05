import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { machinesApi, processesApi } from '../api/machines'
import type { Machine, Process } from '../api/machines'
import { customersApi } from '../api/customers'
import type { Customer } from '../api/customers'
import { calendarApi } from '../api/calendar'
import type { CalendarHoliday } from '../api/calendar'
import { productTemplatesApi } from '../api/productTemplates'
import type { ProductTemplate, TemplateOperationIn } from '../api/productTemplates'
import { materialsApi } from '../api/materials'
import type { Material } from '../api/materials'
import { purchaseOrdersApi } from '../api/purchaseOrders'
import type { PurchaseOrder } from '../api/purchaseOrders'

type Tab = 'machines' | 'processes' | 'customers' | 'calendar' | 'templates' | 'materials'

const TABS: { id: Tab; label: string }[] = [
  { id: 'machines', label: '設備マスタ' },
  { id: 'processes', label: '工程マスタ' },
  { id: 'customers', label: '顧客マスタ' },
  { id: 'calendar', label: 'カレンダー' },
  { id: 'templates', label: '品番テンプレート' },
  { id: 'materials', label: '材料在庫' },
]

export default function MastersPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('machines')

  // ── 設備 ──────────────────────────────────────────────────────────────────
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

  // ── 工程 ──────────────────────────────────────────────────────────────────
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

  // ── 顧客 ──────────────────────────────────────────────────────────────────
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customersApi.list().then(r => r.data),
  })
  const [cForm, setCForm] = useState({ code: '', name: '', contact_name: '', phone: '', email: '', note: '' })
  const [cEditId, setCEditId] = useState<number | null>(null)
  const createC = useMutation({ mutationFn: customersApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); resetC() } })
  const updateC = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<Customer> }) => customersApi.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); resetC() } })
  const deleteC = useMutation({ mutationFn: customersApi.delete, onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }) })
  const resetC = () => { setCForm({ code: '', name: '', contact_name: '', phone: '', email: '', note: '' }); setCEditId(null) }

  // ── 品番テンプレート ────────────────────────────────────────────────────────
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => productTemplatesApi.list().then(r => r.data),
  })
  const [tForm, setTForm] = useState({ product_code: '', product_name: '', note: '' })
  const [tOps, setTOps] = useState<TemplateOperationIn[]>([])
  const [tEditId, setTEditId] = useState<number | null>(null)
  const createT = useMutation({
    mutationFn: () => productTemplatesApi.create({ ...tForm, note: tForm.note || undefined, operations: tOps }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); resetT() },
  })
  const deleteT = useMutation({ mutationFn: productTemplatesApi.delete, onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }) })
  const resetT = () => { setTForm({ product_code: '', product_name: '', note: '' }); setTOps([]); setTEditId(null) }
  const addTOp = () => setTOps(ops => [...ops, { sequence: ops.length + 1, machine_id: machines?.[0]?.id ?? 0, process_id: null, hours_per_unit: 1.0 }])
  const removeTOp = (i: number) => setTOps(ops => ops.filter((_, idx) => idx !== i).map((op, idx) => ({ ...op, sequence: idx + 1 })))

  // ── 材料在庫 ─────────────────────────────────────────────────────────────
  const { data: materials } = useQuery({
    queryKey: ['materials'],
    queryFn: () => materialsApi.list().then(r => r.data),
  })
  const [matForm, setMatForm] = useState({ material_code: '', material_name: '', unit: '個', stock_quantity: 0, reorder_point: 0, unit_price: 0, supplier_name: '', lead_days: 0, note: '' })
  const [matEditId, setMatEditId] = useState<number | null>(null)
  const [stockAction, setStockAction] = useState<{ id: number; type: 'receive' | 'issue' } | null>(null)
  const [stockQty, setStockQty] = useState(1)
  const createMat = useMutation({ mutationFn: () => materialsApi.create({ ...matForm, supplier_name: matForm.supplier_name || undefined, note: matForm.note || undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['materials'] }); resetMat() } })
  const updateMat = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<Material> }) => materialsApi.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['materials'] }); resetMat() } })
  const deleteMat = useMutation({ mutationFn: materialsApi.delete, onSuccess: () => qc.invalidateQueries({ queryKey: ['materials'] }) })
  const stockMut = useMutation({
    mutationFn: () => stockAction?.type === 'receive'
      ? materialsApi.receive(stockAction.id, stockQty)
      : materialsApi.issue(stockAction!.id, stockQty),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['materials'] }); setStockAction(null); setStockQty(1) },
  })
  const resetMat = () => { setMatForm({ material_code: '', material_name: '', unit: '個', stock_quantity: 0, reorder_point: 0, unit_price: 0, supplier_name: '', lead_days: 0, note: '' }); setMatEditId(null) }

  // ── 発注管理 ─────────────────────────────────────────────────────────────
  const [matSubTab, setMatSubTab] = useState<'stock' | 'orders' | 'schedule'>('stock')
  const { data: purchaseOrders } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => purchaseOrdersApi.list().then(r => r.data),
  })
  const { data: poSchedule } = useQuery({
    queryKey: ['po-schedule'],
    queryFn: () => purchaseOrdersApi.schedule(60).then(r => r.data),
  })
  const today = new Date().toISOString().split('T')[0]
  const [poForm, setPoForm] = useState({ material_id: 0, supplier_name: '', quantity: 1, unit_price: 0, order_date: today, expected_delivery_date: today, note: '' })
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null)
  const [receiveForm, setReceiveForm] = useState({ received_quantity: 0, actual_delivery_date: today, note: '' })
  const createPo = useMutation({
    mutationFn: () => purchaseOrdersApi.create({ ...poForm, supplier_name: poForm.supplier_name, unit_price: poForm.unit_price || undefined, note: poForm.note || undefined }),
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

  // ── カレンダー ─────────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear()
  const [calYear, setCalYear] = useState(currentYear)
  const { data: holidays } = useQuery({
    queryKey: ['calendar', calYear],
    queryFn: () => calendarApi.list(calYear).then(r => r.data),
  })
  const [hForm, setHForm] = useState({ date: '', holiday_name: '', working_hours: 0 })
  const addHoliday = useMutation({
    mutationFn: calendarApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calendar'] }); setHForm({ date: '', holiday_name: '', working_hours: 0 }) },
  })
  const deleteHoliday = useMutation({
    mutationFn: calendarApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  })
  const generateHolidays = useMutation({
    mutationFn: calendarApi.generate,
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['calendar'] }); alert(res.data.message) },
  })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">マスタ管理</h1>

      {/* タブ */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t.id ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
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

      {/* 顧客マスタ */}
      {tab === 'customers' && (
        <div>
          <form
            onSubmit={e => {
              e.preventDefault()
              const payload = {
                code: cForm.code,
                name: cForm.name,
                contact_name: cForm.contact_name || undefined,
                phone: cForm.phone || undefined,
                email: cForm.email || undefined,
                note: cForm.note || undefined,
              }
              cEditId ? updateC.mutate({ id: cEditId, data: payload }) : createC.mutate(payload)
            }}
            className="bg-white border border-gray-200 rounded-xl p-5 mb-5 shadow-sm grid grid-cols-2 gap-4"
          >
            <h2 className="col-span-2 text-base font-semibold text-gray-700">{cEditId ? '顧客編集' : '顧客追加'}</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">顧客コード *</label>
              <input required value={cForm.code} disabled={!!cEditId} onChange={e => setCForm(f => ({ ...f, code: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" placeholder="C001" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">会社名 *</label>
              <input required value={cForm.name} onChange={e => setCForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="鈴木商事" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">担当者名</label>
              <input value={cForm.contact_name} onChange={e => setCForm(f => ({ ...f, contact_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="鈴木一郎" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">電話番号</label>
              <input value={cForm.phone} onChange={e => setCForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="03-1234-5678" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">メールアドレス</label>
              <input type="email" value={cForm.email} onChange={e => setCForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="info@example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
              <input value={cForm.note} onChange={e => setCForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              {cEditId && <button type="button" onClick={resetC} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">キャンセル</button>}
              <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                {cEditId ? '更新' : '追加'}
              </button>
            </div>
          </form>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">コード</th>
                  <th className="px-4 py-3 text-left">会社名</th>
                  <th className="px-4 py-3 text-left">担当者</th>
                  <th className="px-4 py-3 text-left">電話</th>
                  <th className="px-4 py-3 text-left">メール</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers?.items?.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">顧客データがありません</td></tr>
                )}
                {customers?.items?.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-600">{c.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.contact_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => {
                          setCForm({ code: c.code, name: c.name, contact_name: c.contact_name ?? '', phone: c.phone ?? '', email: c.email ?? '', note: c.note ?? '' })
                          setCEditId(c.id)
                        }}
                        className="text-blue-500 hover:text-blue-700 mr-3 text-xs"
                      >編集</button>
                      <button onClick={() => { if (confirm('削除しますか？')) deleteC.mutate(c.id) }} className="text-red-400 hover:text-red-600 text-xs">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 品番テンプレート */}
      {tab === 'templates' && (
        <div>
          {/* 登録フォーム */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-700 mb-4">{tEditId ? 'テンプレート編集' : 'テンプレート追加'}</h2>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">品番 *</label>
                <input required value={tForm.product_code} onChange={e => setTForm(f => ({ ...f, product_code: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="ABC-001" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">品名 *</label>
                <input required value={tForm.product_name} onChange={e => setTForm(f => ({ ...f, product_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="シャフトA" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
                <input value={tForm.note} onChange={e => setTForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">標準工程</span>
                <button type="button" onClick={addTOp} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ 工程追加</button>
              </div>
              {tOps.length === 0 && <p className="text-xs text-gray-400">工程を追加してください</p>}
              {tOps.map((op, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 mb-2 items-center">
                  <span className="text-xs text-gray-500">工程{op.sequence}</span>
                  <select value={op.machine_id} onChange={e => setTOps(ops => ops.map((o, idx) => idx === i ? { ...o, machine_id: Number(e.target.value) } : o))}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm">
                    {machines?.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0.1} step={0.1} value={op.hours_per_unit}
                      onChange={e => setTOps(ops => ops.map((o, idx) => idx === i ? { ...o, hours_per_unit: Number(e.target.value) } : o))}
                      className="border border-gray-300 rounded px-2 py-1.5 text-sm w-20" />
                    <span className="text-xs text-gray-400">h/個</span>
                  </div>
                  <button type="button" onClick={() => removeTOp(i)} className="text-red-400 hover:text-red-600 text-xs text-left">削除</button>
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-end">
              {tEditId && <button type="button" onClick={resetT} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">キャンセル</button>}
              <button
                onClick={() => createT.mutate()}
                disabled={!tForm.product_code || !tForm.product_name}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {tEditId ? '更新' : '追加'}
              </button>
            </div>
          </div>

          {/* テンプレート一覧 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">品番</th>
                  <th className="px-4 py-3 text-left">品名</th>
                  <th className="px-4 py-3 text-left">標準工程</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {templates?.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">テンプレートがありません</td></tr>
                )}
                {templates?.map((t: ProductTemplate) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-600">{t.product_code}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{t.product_name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {t.operations.length === 0 ? '—' : t.operations.map(op => `${op.machine_name}(${op.hours_per_unit}h/個)`).join(' → ')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => { if (confirm('削除しますか？')) deleteT.mutate(t.id) }} className="text-red-400 hover:text-red-600 text-xs">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 材料在庫 */}
      {tab === 'materials' && (
        <div>
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
          <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-lg w-fit">
            {([['stock', '在庫管理'], ['orders', '発注管理'], ['schedule', '納入スケジュール']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setMatSubTab(id)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${matSubTab === id ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                {label}
                {id === 'orders' && purchaseOrders?.filter(p => p.is_overdue).length ? (
                  <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5">{purchaseOrders.filter(p => p.is_overdue).length}</span>
                ) : null}
              </button>
            ))}
          </div>

          {/* 在庫管理 */}
          {matSubTab === 'stock' && <>
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
              <input type="number" min={0} step={0.1} value={matForm.stock_quantity} onChange={e => setMatForm(f => ({ ...f, stock_quantity: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">発注点</label>
              <input type="number" min={0} step={0.1} value={matForm.reorder_point} onChange={e => setMatForm(f => ({ ...f, reorder_point: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">単価（円）</label>
              <input type="number" min={0} value={matForm.unit_price} onChange={e => setMatForm(f => ({ ...f, unit_price: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">仕入先</label>
              <input value={matForm.supplier_name} onChange={e => setMatForm(f => ({ ...f, supplier_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">調達リードタイム（日）</label>
              <input type="number" min={0} value={matForm.lead_days} onChange={e => setMatForm(f => ({ ...f, lead_days: Number(e.target.value) }))}
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
          </>}

          {/* 発注管理 */}
          {matSubTab === 'orders' && <>
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
                  <input type="number" min={0} value={poForm.unit_price} onChange={e => setPoForm(f => ({ ...f, unit_price: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">発注日 *</label>
                  <input required type="date" value={poForm.order_date} onChange={e => setPoForm(f => ({ ...f, order_date: e.target.value }))}
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
                <div className="flex items-end justify-end">
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
          </>}

          {/* 納入スケジュール */}
          {matSubTab === 'schedule' && <>
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
          </>}
        </div>
      )}

      {/* カレンダー管理 */}
      {tab === 'calendar' && (
        <div>
          {/* 年選択 + 祝日自動生成 */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex items-center gap-2">
              <button onClick={() => setCalYear(y => y - 1)} className="px-2 py-1 border rounded text-sm hover:bg-gray-50">◀</button>
              <span className="font-semibold text-gray-700 w-16 text-center">{calYear}年</span>
              <button onClick={() => setCalYear(y => y + 1)} className="px-2 py-1 border rounded text-sm hover:bg-gray-50">▶</button>
            </div>
            <button
              onClick={() => { if (confirm(`${calYear}年の日本の祝日を自動登録しますか？`)) generateHolidays.mutate(calYear) }}
              disabled={generateHolidays.isPending}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {generateHolidays.isPending ? '生成中...' : '祝日を自動生成'}
            </button>
          </div>

          {/* 休日追加フォーム */}
          <form
            onSubmit={e => { e.preventDefault(); addHoliday.mutate({ date: hForm.date, holiday_name: hForm.holiday_name || undefined, working_hours: hForm.working_hours }) }}
            className="bg-white border border-gray-200 rounded-xl p-5 mb-5 shadow-sm grid grid-cols-3 gap-4"
          >
            <h2 className="col-span-3 text-base font-semibold text-gray-700">休日を手動追加</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">日付 *</label>
              <input type="date" required value={hForm.date} onChange={e => setHForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">休日名</label>
              <input value={hForm.holiday_name} onChange={e => setHForm(f => ({ ...f, holiday_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="お盆休み" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">稼働時間（0=全休 / 4=半日）</label>
              <select value={hForm.working_hours} onChange={e => setHForm(f => ({ ...f, working_hours: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value={0}>0h（全休）</option>
                <option value={4}>4h（半日）</option>
                <option value={8}>8h（通常稼働）</option>
              </select>
            </div>
            <div className="col-span-3 flex justify-end">
              <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">追加</button>
            </div>
          </form>

          {/* 休日一覧 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">日付</th>
                  <th className="px-4 py-3 text-left">休日名</th>
                  <th className="px-4 py-3 text-center">稼働時間</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {holidays?.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    休日データがありません。「祝日を自動生成」ボタンで{calYear}年の祝日を一括登録できます。
                  </td></tr>
                )}
                {holidays?.map((h: CalendarHoliday) => (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-700">{h.date}</td>
                    <td className="px-4 py-3 text-gray-800">{h.holiday_name ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${h.working_hours === 0 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {h.working_hours === 0 ? '全休' : `${h.working_hours}h`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => { if (confirm('削除しますか？')) deleteHoliday.mutate(h.date) }} className="text-red-400 hover:text-red-600 text-xs">削除</button>
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
