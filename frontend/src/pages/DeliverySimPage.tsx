import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { machinesApi } from '../api/machines'
import { scheduleApi } from '../api/schedule'
import type { DeliverySimResult } from '../api/schedule'
import { aiApi } from '../api/ai'

export default function DeliverySimPage() {
  const { data: machines } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.list({ is_active: true }).then(r => r.data),
  })

  const [form, setForm] = useState({
    product_name: '',
    machine_id: 0,
    duration_hours: 8,
    due_date: '',
    priority: 3,
    is_urgent: false,
  })
  const [result, setResult] = useState<DeliverySimResult | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)

  const sim = useMutation({
    mutationFn: scheduleApi.simulateDelivery,
    onSuccess: data => { setResult(data.data); setExplanation(null) },
  })

  const explain = useMutation({
    mutationFn: (r: DeliverySimResult) =>
      aiApi.explainSimulation(r as unknown as Record<string, unknown>),
    onSuccess: data => setExplanation(data.data.message),
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setResult(null)
    sim.mutate({ ...form, machine_id: Number(form.machine_id) })
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">納期シミュレーター</h1>
      <p className="text-sm text-gray-500 mb-6">新規受注を差し込んだ場合の完成予定日を即答します</p>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">品名</label>
            <input
              value={form.product_name}
              onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="部品A"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">使用設備 *</label>
            <select
              required
              value={form.machine_id}
              onChange={e => setForm(f => ({ ...f, machine_id: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value={0} disabled>設備を選択してください</option>
              {machines?.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">所要時間（時間） *</label>
            <input
              required type="number" min={0.5} step={0.5}
              value={form.duration_hours}
              onChange={e => setForm(f => ({ ...f, duration_hours: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">希望納期</label>
            <input
              type="date"
              value={form.due_date}
              onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">優先度</label>
            <div className="flex gap-4">
              {[{ v: 3, l: '通常' }, { v: 2, l: '高' }, { v: 1, l: '特急' }].map(({ v, l }) => (
                <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio" name="priority" value={v}
                    checked={form.priority === v}
                    onChange={() => setForm(f => ({ ...f, priority: v, is_urgent: v === 1 }))}
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
        <div className={`mt-6 rounded-xl p-6 border shadow-sm ${result.feasible ? (result.on_time ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200') : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">{result.feasible ? (result.on_time ? '✅' : '⚠️') : '❌'}</span>
            <span className="text-lg font-bold text-gray-800">
              {result.feasible ? (result.on_time ? '受注可能（納期内）' : '受注可能（納期超過）') : '受注不可'}
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
