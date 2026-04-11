import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { customersApi } from '../api/customers'
import type { CustomerCreate } from '../api/customers'

interface Props {
  onClose: () => void
  /** 登録完了後に新しい顧客IDを渡す */
  onCreated: (customerId: number) => void
}

export function CustomerCreateModal({ onClose, onCreated }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState<CustomerCreate>({
    code: '', name: '', contact_name: '', phone: '', email: '',
  })

  const createMut = useMutation({
    mutationFn: () => customersApi.create(form),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      onCreated(res.data.id)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg ? `登録失敗: ${msg}` : '取引先の登録に失敗しました')
    },
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-bold text-gray-800 mb-4">取引先を新規登録</h2>

        <form
          onSubmit={e => { e.preventDefault(); createMut.mutate() }}
          className="space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              取引先コード <span className="text-red-500">*</span>
            </label>
            <input
              required value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="C001"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              取引先名 <span className="text-red-500">*</span>
            </label>
            <input
              required value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="株式会社サンプル"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">担当者名</label>
            <input
              value={form.contact_name ?? ''}
              onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="山田 太郎"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">電話番号</label>
              <input
                value={form.phone ?? ''}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="03-0000-0000"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">メール</label>
              <input
                type="email" value={form.email ?? ''}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="sample@example.com"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit" disabled={createMut.isPending}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {createMut.isPending ? '登録中...' : '登録する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
