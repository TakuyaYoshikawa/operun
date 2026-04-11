import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { machinesApi } from '../api/machines'
import { scheduleApi } from '../api/schedule'
import type { DeliverySimResult } from '../api/schedule'
import { aiApi } from '../api/ai'

interface SimOp {
  machine_id: number
  duration_hours: number
}

const emptyOp: SimOp = { machine_id: 0, duration_hours: 1 }

export default function DeliverySimPage() {
  const { data: machines } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.list({ is_active: true }).then(r => r.data),
  })

  const [productName, setProductName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState(3)
  const [ops, setOps] = useState<SimOp[]>([{ ...emptyOp }])

  const [result, setResult] = useState<DeliverySimResult | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)

  // 設備を machine_type でグループ化
  const machineGroups = (() => {
    if (!machines) return []
    const seen = new Map<string | null, typeof machines>()
    for (const m of machines) {
      const key = m.machine_type
      if (!seen.has(key)) seen.set(key, [])
      seen.get(key)!.push(m)
    }
    return Array.from(seen.entries()).map(([type, ms]) => ({ type, machines: ms }))
  })()

  const machineName = (id: number) => machines?.find(m => m.id === id)?.name ?? `設備#${id}`

  const sim = useMutation({
    mutationFn: scheduleApi.simulateDelivery,
    onSuccess: data => { setResult(data.data); setExplanation(null) },
    onError: () => alert('シミュレーションに失敗しました'),
  })

  const explain = useMutation({
    mutationFn: (r: DeliverySimResult) =>
      aiApi.explainSimulation(r as unknown as Record<string, unknown>),
    onSuccess: data => setExplanation(data.data.message),
  })

  const updateOp = (i: number, patch: Partial<SimOp>) =>
    setOps(prev => prev.map((op, idx) => idx === i ? { ...op, ...patch } : op))

  const addOp = () => setOps(prev => [...prev, { ...emptyOp }])
  const removeOp = (i: number) => setOps(prev => prev.filter((_, idx) => idx !== i))

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (ops.some(op => op.machine_id === 0)) {
      alert('全ての工程で設備を選択してください')
      return
    }
    setResult(null)
    sim.mutate({
      product_name: productName,
      due_date: dueDate,
      priority,
      is_urgent: priority === 1,
      operations: ops,
    })
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">納期シミュレーター</h1>
      <p className="text-sm text-gray-500 mb-6">新規受注を差し込んだ場合の完成予定日を即答します</p>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* 品名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">品名</label>
            <input
              value={productName}
              onChange={e => setProductName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="部品A"
            />
          </div>

          {/* 工程リスト */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                工程 <span className="text-gray-400 font-normal text-xs ml-1">— 上から順に加工します</span>
              </label>
              <button
                type="button"
                onClick={addOp}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                ＋ 工程を追加
              </button>
            </div>

            <div className="space-y-2">
              {ops.map((op, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="w-5 h-5 rounded-full bg-gray-300 text-white text-xs flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>

                  <select
                    required
                    value={op.machine_id}
                    onChange={e => updateOp(i, { machine_id: Number(e.target.value) })}
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                  >
                    <option value={0} disabled>設備を選択</option>
                    {machineGroups.map(({ type, machines: ms }) =>
                      type
                        ? <optgroup key={type} label={type}>
                            {ms.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </optgroup>
                        : ms.map(m => <option key={m.id} value={m.id}>{m.name}</option>)
                    )}
                  </select>

                  <div className="flex items-center gap-1">
                    <input
                      required type="number" min={0.5} step={0.5}
                      value={op.duration_hours}
                      onChange={e => updateOp(i, { duration_hours: Number(e.target.value) })}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center"
                    />
                    <span className="text-xs text-gray-400">h</span>
                  </div>

                  {ops.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeOp(i)}
                      className="text-red-300 hover:text-red-500 text-lg leading-none flex-shrink-0"
                      title="この工程を削除"
                    >×</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 希望納期 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">希望納期</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* 優先度 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">優先度</label>
            <div className="flex gap-4">
              {[{ v: 3, l: '通常' }, { v: 2, l: '高' }, { v: 1, l: '特急' }].map(({ v, l }) => (
                <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio" name="priority" value={v}
                    checked={priority === v}
                    onChange={() => setPriority(v)}
                    className="accent-blue-600"
                  />
                  <span className={v === 1 ? 'text-red-600 font-medium' : ''}>{l}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={sim.isPending}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {sim.isPending ? '計算中...' : '納期を確認する'}
          </button>
        </form>
      </div>

      {/* 結果 */}
      {result && (
        <div className={`mt-6 rounded-xl p-6 border shadow-sm ${
          result.feasible
            ? (result.on_time ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200')
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">
              {result.feasible ? (result.on_time ? '✅' : '⚠️') : '❌'}
            </span>
            <span className="text-lg font-bold text-gray-800">
              {result.feasible
                ? (result.on_time ? '受注可能（納期内）' : '受注可能（納期超過）')
                : '受注不可'}
            </span>
          </div>

          {result.completion_date && (
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">完成予定</span>
                <span className="font-semibold text-gray-800">{result.completion_date}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">所要日数</span>
                <span className="font-semibold text-gray-800">{result.business_days} 営業日</span>
              </div>
            </div>
          )}

          {/* 工程ごとの予定 */}
          {result.operations && result.operations.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 mb-4">
              {result.operations.map(op => (
                <div key={op.sequence} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center flex-shrink-0">
                    {op.sequence}
                  </span>
                  <span className="font-medium text-gray-700 flex-1">{op.machine_name}</span>
                  <span className="text-gray-400 text-xs">
                    {formatTime(op.planned_start)} 〜 {formatTime(op.planned_end)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {result.affected_count > 0 && (
            <div className="border-t border-gray-200 pt-3 mt-3">
              <p className="text-sm text-orange-700 font-medium mb-1">
                ⚠️ 影響を受ける受注：{result.affected_count} 件
              </p>
              <ul className="text-sm text-gray-600 list-disc list-inside">
                {result.affected_orders.map(o => (
                  <li key={o}>{o} が後ろ倒しになります</li>
                ))}
              </ul>
            </div>
          )}
          {result.affected_count === 0 && result.feasible && (
            <p className="text-sm text-green-700 mt-2">既存受注への影響はありません</p>
          )}

          {/* AI説明文生成 */}
          <div className="border-t border-gray-200 pt-3 mt-4">
            <button
              onClick={() => explain.mutate(result)}
              disabled={explain.isPending}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              <span>🤖</span>
              <span>{explain.isPending ? '生成中...' : 'お客様向け説明文を生成'}</span>
            </button>
            {explanation && (
              <div className="mt-3 bg-white border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-semibold text-blue-600">AI 説明文（電話・メール用）</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{explanation}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(explanation)}
                  className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  📋 コピー
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
