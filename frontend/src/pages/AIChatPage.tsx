import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { aiApi } from '../api/ai'
import type { ChatMessage, ParsedOrder } from '../api/ai'
import { ordersApi } from '../api/orders'
import { customersApi } from '../api/customers'

type Mode = 'order' | 'chat' | 'agent' | 'constraint'

// チャットメッセージの型（テキスト or 受注フォーム）
type Message =
  | { type: 'text'; role: 'user' | 'assistant'; content: string }
  | { type: 'order-form'; parsed: ParsedOrder }
  | { type: 'order-forms'; orders: ParsedOrder[] }

const PRIORITY_LABEL: Record<number, string> = { 1: '特急', 2: '高', 3: '通常' }
const PRIORITY_COLOR: Record<number, string> = {
  1: 'bg-red-100 text-red-700 border-red-300',
  2: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  3: 'bg-gray-100 text-gray-600 border-gray-300',
}

// ── 受注フォームバブル ─────────────────────────────────────────────────────────

function OrderFormBubble({
  parsed,
  customers,
  onRegister,
  onEdit,
}: {
  parsed: ParsedOrder
  customers: { id: number; name: string }[]
  onRegister: (data: ParsedOrder) => void
  onEdit: (data: ParsedOrder) => void
}) {
  const [form, setForm] = useState<ParsedOrder>(parsed)

  const isMissing = (field: string) => form.missing_fields.includes(field)

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl rounded-tl-sm shadow-sm overflow-hidden">
        {/* ヘッダー */}
        <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
          <span className="text-blue-600 text-sm">🤖</span>
          <span className="text-sm font-medium text-blue-700">受注情報を解析しました。確認・修正して登録してください。</span>
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* 品名 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              品名 <span className="text-red-500">*</span>
              {isMissing('product_name') && <span className="text-red-400 ml-1">（未入力）</span>}
            </label>
            <input
              value={form.product_name ?? ''}
              onChange={e => setForm(f => ({ ...f, product_name: e.target.value, missing_fields: f.missing_fields.filter(x => x !== 'product_name') }))}
              className={`w-full border rounded-lg px-3 py-1.5 text-sm ${isMissing('product_name') ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
              placeholder="品名を入力"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* 品番 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">品番</label>
              <input
                value={form.product_code ?? ''}
                onChange={e => setForm(f => ({ ...f, product_code: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                placeholder="（任意）"
              />
            </div>

            {/* 数量 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                数量 <span className="text-red-500">*</span>
                {isMissing('quantity') && <span className="text-red-400 ml-1">（未入力）</span>}
              </label>
              <input
                type="number" min={1}
                value={form.quantity ?? ''}
                onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value), missing_fields: f.missing_fields.filter(x => x !== 'quantity') }))}
                className={`w-full border rounded-lg px-3 py-1.5 text-sm ${isMissing('quantity') ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                placeholder="数量"
              />
            </div>
          </div>

          {/* 納期 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              納期 <span className="text-red-500">*</span>
              {isMissing('due_date') && <span className="text-red-400 ml-1">（未入力）</span>}
            </label>
            <input
              type="date"
              value={form.due_date ?? ''}
              onChange={e => setForm(f => ({ ...f, due_date: e.target.value, missing_fields: f.missing_fields.filter(x => x !== 'due_date') }))}
              className={`w-full border rounded-lg px-3 py-1.5 text-sm ${isMissing('due_date') ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* 優先度 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">優先度</label>
              <div className="flex gap-1">
                {([1, 2, 3] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setForm(f => ({ ...f, priority: p }))}
                    className={`flex-1 py-1 rounded-md text-xs font-medium border ${form.priority === p ? PRIORITY_COLOR[p] : 'bg-white text-gray-400 border-gray-200'}`}
                  >
                    {PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* 顧客 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">顧客</label>
              <select
                value={form.customer_id ?? ''}
                onChange={e => setForm(f => ({ ...f, customer_id: e.target.value ? Number(e.target.value) : null }))}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="">未選択</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* 備考 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">備考</label>
            <input
              value={form.note ?? ''}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
              placeholder="（任意）"
            />
          </div>
        </div>

        {/* アクションボタン */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
          <button
            onClick={() => onRegister(form)}
            className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700"
          >
            この内容で登録する
          </button>
          <button
            onClick={() => onEdit(form)}
            className="px-3 py-2 border border-gray-300 bg-white text-gray-600 rounded-lg text-sm hover:bg-gray-50"
          >
            修正
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AI受注入力チャット ─────────────────────────────────────────────────────────

function OrderInputChat() {
  const qc = useQueryClient()
  const [messages, setMessages] = useState<Message[]>([
    { type: 'text', role: 'assistant', content: '受注情報を自由に入力してください。品名・数量・納期が分かれば登録できます。\n\n例：「鈴木商事からシャフトA 50個、4月30日まで、急ぎで」' },
  ])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customersApi.list().then(r => r.data),
  })
  const customerList = customers?.items?.map(c => ({ id: c.id, name: c.name })) ?? []

  const parseMut = useMutation({
    mutationFn: (text: string) => aiApi.parseOrder(text),
    onSuccess: (res) => {
      const data = res.data
      if (data.type === 'multiple') {
        setMessages(prev => [
          ...prev,
          { type: 'text', role: 'assistant', content: `${data.orders.length}件の受注を検出しました。それぞれ確認して登録してください。` },
          { type: 'order-forms', orders: data.orders },
        ])
      } else {
        setMessages(prev => [...prev, { type: 'order-form', parsed: data.order }])
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '不明なエラー'
      setMessages(prev => [...prev, { type: 'text', role: 'assistant', content: `解析中にエラーが発生しました。\n${msg}` }])
    },
  })

  const createMut = useMutation({
    mutationFn: (data: Parameters<typeof ordersApi.create>[0]) => ordersApi.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      setMessages(prev => [...prev, {
        type: 'text', role: 'assistant',
        content: `受注を登録しました。\n受注番号：${res.data.order_number}\n品名：${res.data.product_name}\n数量：${res.data.quantity}\n納期：${res.data.due_date}`,
      }])
    },
    onError: () => {
      setMessages(prev => [...prev, { type: 'text', role: 'assistant', content: '登録に失敗しました。受注番号が重複している可能性があります。' }])
    },
  })

  const send = () => {
    if (!input.trim() || parseMut.isPending) return
    const text = input.trim()
    setMessages(prev => [...prev, { type: 'text', role: 'user', content: text }])
    setInput('')
    parseMut.mutate(text)
  }

  const handleRegister = (form: ParsedOrder) => {
    if (!form.product_name || !form.quantity || !form.due_date) {
      setMessages(prev => [...prev, { type: 'text', role: 'assistant', content: '品名・数量・納期は必須です。フォームに入力してから登録してください。' }])
      return
    }
    createMut.mutate({
      order_number: `ORD-AI-${Date.now().toString().slice(-6)}`,
      product_name: form.product_name,
      product_code: form.product_code ?? '',
      quantity: Number(form.quantity),
      due_date: form.due_date,
      priority: (form.priority as 1 | 2 | 3) ?? 3,
      note: form.note ?? '',
      customer_id: form.customer_id ?? null,
    })
  }

  const handleEdit = (form: ParsedOrder) => {
    setMessages(prev => [...prev, { type: 'text', role: 'assistant', content: '修正内容を入力してください。\n例：「数量を100個に変更して」「納期は来月末で」' }])
    setInput(`品名:${form.product_name ?? ''} 数量:${form.quantity ?? ''} 納期:${form.due_date ?? ''}`)
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, parseMut.isPending])

  return (
    <div className="flex flex-col h-full">
      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.map((msg, i) => {
          if (msg.type === 'text') {
            return (
              <div key={i} className={`flex mb-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm mr-2 flex-shrink-0 mt-0.5">🤖</div>
                )}
                <div className={`max-w-sm px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            )
          }
          if (msg.type === 'order-forms') {
            return (
              <div key={i} className="pl-9 space-y-2">
                {msg.orders.map((order, j) => (
                  <OrderFormBubble
                    key={j}
                    parsed={order}
                    customers={customerList}
                    onRegister={handleRegister}
                    onEdit={handleEdit}
                  />
                ))}
              </div>
            )
          }
          return (
            <div key={i} className="pl-9">
              <OrderFormBubble
                parsed={msg.parsed}
                customers={customerList}
                onRegister={handleRegister}
                onEdit={handleEdit}
              />
            </div>
          )
        })}

        {parseMut.isPending && (
          <div className="flex items-start mb-3">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm mr-2 flex-shrink-0">🤖</div>
            <div className="bg-white border border-gray-200 px-4 py-2.5 rounded-2xl rounded-bl-sm shadow-sm">
              <span className="text-gray-400 text-sm flex items-center gap-1.5">
                <svg className="animate-spin h-3 w-3 text-blue-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                解析中...
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力欄 */}
      <div className="px-4 py-3 border-t border-gray-200 bg-white flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="例：シャフトA 50個 4/30まで 急ぎで"
          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={send}
          disabled={!input.trim() || parseMut.isPending}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >送信</button>
      </div>
    </div>
  )
}

// ── 状況確認チャット ──────────────────────────────────────────────────────────

function StatusChat() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: 'スケジュールについて何でも聞いてください。\n\n例：\n・今週遅延しそうな案件は？\n・特急案件はいくつある？\n・旋盤1号機の来週の予定は？' },
  ])
  const [input, setInput] = useState('')
  const [context, setContext] = useState<string | undefined>()
  const bottomRef = useRef<HTMLDivElement>(null)

  const summaryMut = useMutation({
    mutationFn: aiApi.ganttSummary,
    onSuccess: (res) => setContext(res.data.context),
  })

  const chatMut = useMutation({
    mutationFn: ({ msgs, ctx }: { msgs: ChatMessage[]; ctx?: string }) =>
      aiApi.chat(msgs, ctx),
    onSuccess: (res, vars) => {
      setMessages([...vars.msgs, { role: 'assistant', content: res.data.reply }])
    },
  })

  useEffect(() => { summaryMut.mutate() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, chatMut.isPending])

  const send = () => {
    if (!input.trim() || chatMut.isPending) return
    const userMsg = { role: 'user' as const, content: input }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setInput('')
    chatMut.mutate({ msgs: newMsgs, ctx: context })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex mb-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm mr-2 flex-shrink-0 mt-0.5">🤖</div>
            )}
            <div className={`max-w-sm px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {chatMut.isPending && (
          <div className="flex items-start mb-3">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm mr-2 flex-shrink-0">🤖</div>
            <div className="bg-white border border-gray-200 px-4 py-2.5 rounded-2xl rounded-bl-sm shadow-sm">
              <span className="text-gray-400 text-sm">考え中...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="px-4 py-3 border-t border-gray-200 bg-white flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="例：今週遅延しそうな案件は？"
          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={send}
          disabled={!input.trim() || chatMut.isPending}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >送信</button>
      </div>
    </div>
  )
}

// ── AIエージェントチャット ────────────────────────────────────────────────────

const TOOL_LABEL: Record<string, string> = {
  search_materials: '材料を検索',
  receive_stock: '在庫を入庫',
  issue_stock: '在庫を出庫',
  create_purchase_order: '発注を作成',
  search_orders: '受注を検索',
  search_customers: '顧客を検索',
  create_customer: '顧客を登録',
  get_schedule_summary: 'スケジュールを確認',
  run_schedule: 'スケジュールを実行',
  // 制約設定ツール
  search_machines: '設備を検索',
  update_machine_status: '設備の稼働状態を変更',
  add_maintenance_window: 'メンテナンス枠を登録',
  update_operation_constraint: '工程制約を変更',
  add_calendar_exception: 'カレンダー例外日を追加',
  explain_constraints: '制約設定を確認',
}

function ToolCallCard({ tool, input, result }: { tool: string; input: Record<string, unknown>; result: unknown }) {
  const [open, setOpen] = useState(false)
  const label = TOOL_LABEL[tool] ?? tool
  const isError = result != null && typeof result === 'object' && 'error' in (result as Record<string, unknown>)

  return (
    <div className={`border rounded-lg text-xs overflow-hidden mb-1 ${isError ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
      >
        <span className={isError ? 'text-red-500' : 'text-blue-500'}>🔧</span>
        <span className={`font-medium ${isError ? 'text-red-600' : 'text-gray-600'}`}>{label}</span>
        <span className="ml-auto text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-1 border-t border-gray-200">
          <div className="text-gray-500 mt-1">入力: <span className="font-mono text-gray-700">{JSON.stringify(input)}</span></div>
          <div className="text-gray-500">結果: <span className="font-mono text-gray-700">{JSON.stringify(result)}</span></div>
        </div>
      )}
    </div>
  )
}

type AgentMessage =
  | { type: 'text'; role: 'user' | 'assistant'; content: string }
  | { type: 'tool-calls'; calls: { tool: string; input: Record<string, unknown>; result: unknown }[] }

function AgentChat() {
  const [messages, setMessages] = useState<AgentMessage[]>([
    { type: 'text', role: 'assistant', content: 'エージェントモードです。受注登録・在庫管理・顧客登録など、すべての操作をチャットで指示できます。\n\n例：\n・「鉄板 SUS304 t2.0 を100枚入庫して」\n・「ABC商事に品番A100を50個、納期5/31で受注登録」\n・「在庫が少ない材料を確認して」' },
  ])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<ChatMessage[]>([])

  const agentMut = useMutation({
    mutationFn: (msgs: ChatMessage[]) => aiApi.agent(msgs),
    onSuccess: (res) => {
      const { reply, tool_calls } = res.data
      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]
      setMessages(prev => [
        ...(tool_calls.length > 0 ? [...prev, { type: 'tool-calls' as const, calls: tool_calls }] : prev),
        { type: 'text', role: 'assistant', content: reply },
      ])
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '不明なエラー'
      setMessages(prev => [...prev, { type: 'text', role: 'assistant', content: `エラーが発生しました。\n${msg}` }])
    },
  })

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, agentMut.isPending])

  const send = () => {
    if (!input.trim() || agentMut.isPending) return
    const text = input.trim()
    setMessages(prev => [...prev, { type: 'text', role: 'user', content: text }])
    historyRef.current = [...historyRef.current, { role: 'user', content: text }]
    setInput('')
    agentMut.mutate(historyRef.current)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.map((msg, i) => {
          if (msg.type === 'tool-calls') {
            return (
              <div key={i} className="pl-9 pr-4 mb-2">
                {msg.calls.map((c, j) => (
                  <ToolCallCard key={j} tool={c.tool} input={c.input} result={c.result} />
                ))}
              </div>
            )
          }
          return (
            <div key={i} className={`flex mb-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-sm mr-2 flex-shrink-0 mt-0.5">🤖</div>
              )}
              <div className={`max-w-sm px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          )
        })}
        {agentMut.isPending && (
          <div className="flex items-start mb-3">
            <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-sm mr-2 flex-shrink-0">🤖</div>
            <div className="bg-white border border-gray-200 px-4 py-2.5 rounded-2xl rounded-bl-sm shadow-sm">
              <span className="text-gray-400 text-sm flex items-center gap-1.5">
                <svg className="animate-spin h-3 w-3 text-purple-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                処理中...
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="px-4 py-3 border-t border-gray-200 bg-white flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="例：SUS304を50枚入庫して"
          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        <button
          onClick={send}
          disabled={!input.trim() || agentMut.isPending}
          className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
        >送信</button>
      </div>
    </div>
  )
}

// ── 制約設定アシスタント ──────────────────────────────────────────────────────

function ConstraintChat() {
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      type: 'text', role: 'assistant',
      content: '制約設定アシスタントです。設備の故障・メンテナンス・工程の制約・カレンダー例外を自然言語で設定できます。\n\n例：\n・「旋盤1号機が来週月〜金まで修理で使えない」\n・「ORD-031の焼入れ工程は8時間冷却後にメッキ開始して」\n・「お盆は8/13〜8/15の3日間、半日稼働にして」\n・「現在の制約設定を教えて」',
    },
  ])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<ChatMessage[]>([])

  const agentMut = useMutation({
    mutationFn: (msgs: ChatMessage[]) => aiApi.agent(msgs),
    onSuccess: (res) => {
      const { reply, tool_calls } = res.data
      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]
      setMessages(prev => [
        ...(tool_calls.length > 0 ? [...prev, { type: 'tool-calls' as const, calls: tool_calls }] : prev),
        { type: 'text', role: 'assistant', content: reply },
      ])
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '不明なエラー'
      setMessages(prev => [...prev, { type: 'text', role: 'assistant', content: `エラーが発生しました。\n${msg}` }])
    },
  })

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, agentMut.isPending])

  const send = () => {
    if (!input.trim() || agentMut.isPending) return
    const text = input.trim()
    setMessages(prev => [...prev, { type: 'text', role: 'user', content: text }])
    historyRef.current = [...historyRef.current, { role: 'user', content: text }]
    setInput('')
    agentMut.mutate(historyRef.current)
  }

  return (
    <div className="flex flex-col h-full">
      {/* クイックアクション */}
      <div className="px-4 pt-3 pb-0 flex-shrink-0 flex gap-2 flex-wrap">
        {[
          { label: '制約一覧を確認', text: '現在の制約設定をすべて教えて' },
          { label: '設備故障を登録', text: '設備が故障して使えない期間を登録したい' },
          { label: 'お盆休みを設定', text: 'お盆期間（8/13〜8/15）を半日稼働に設定して' },
          { label: '工程冷却待ち設定', text: '工程の完了後に冷却待機時間を設定したい' },
        ].map(({ label, text }) => (
          <button
            key={label}
            onClick={() => { setInput(text) }}
            className="text-xs px-3 py-1.5 rounded-full border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.map((msg, i) => {
          if (msg.type === 'tool-calls') {
            return (
              <div key={i} className="pl-9 pr-4 mb-2">
                {msg.calls.map((c, j) => (
                  <ToolCallCard key={j} tool={c.tool} input={c.input} result={c.result} />
                ))}
              </div>
            )
          }
          return (
            <div key={i} className={`flex mb-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-sm mr-2 flex-shrink-0 mt-0.5">⚙️</div>
              )}
              <div className={`max-w-sm px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          )
        })}
        {agentMut.isPending && (
          <div className="flex items-start mb-3">
            <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-sm mr-2 flex-shrink-0">⚙️</div>
            <div className="bg-white border border-gray-200 px-4 py-2.5 rounded-2xl rounded-bl-sm shadow-sm">
              <span className="text-gray-400 text-sm flex items-center gap-1.5">
                <svg className="animate-spin h-3 w-3 text-orange-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                設定中...
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="px-4 py-3 border-t border-gray-200 bg-white flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="例：旋盤1号機が来週月〜金まで使えない"
          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <button
          onClick={send}
          disabled={!input.trim() || agentMut.isPending}
          className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
        >送信</button>
      </div>
    </div>
  )
}

// ── メインページ ──────────────────────────────────────────────────────────────

export default function AIChatPage() {
  const [mode, setMode] = useState<Mode>('order')

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-800">AIアシスタント</h1>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setMode('order')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === 'order' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            AI受注入力
          </button>
          <button
            onClick={() => setMode('chat')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === 'chat' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            状況確認
          </button>
          <button
            onClick={() => setMode('agent')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === 'agent' ? 'bg-white shadow text-purple-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            エージェント
          </button>
          <button
            onClick={() => setMode('constraint')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === 'constraint' ? 'bg-white shadow text-orange-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            制約設定
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {mode === 'order' && <OrderInputChat />}
        {mode === 'chat' && <StatusChat />}
        {mode === 'agent' && <AgentChat />}
        {mode === 'constraint' && <ConstraintChat />}
      </div>
    </div>
  )
}
