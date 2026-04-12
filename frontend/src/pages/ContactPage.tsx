import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { inquiriesApi } from '../api/inquiries'
import { usersApi } from '../api/users'

export default function ContactPage() {
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => usersApi.me().then(r => r.data),
  })

  const mut = useMutation({
    mutationFn: () => inquiriesApi.create(message),
    onSuccess: () => {
      setSent(true)
      setMessage('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg ?? '送信に失敗しました。しばらく経ってから再度お試しください。')
    },
  })

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">お問い合わせ</h1>
        <p className="text-sm text-gray-500 mt-1">ご質問・ご要望・不具合報告などをお送りください。</p>
      </div>

      {sent ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center space-y-2">
          <div className="text-2xl">✅</div>
          <p className="text-sm font-medium text-green-800">お問い合わせを受け付けました</p>
          <p className="text-xs text-green-600">内容を確認のうえ、ご登録のメールアドレスへご連絡します。</p>
          <button
            onClick={() => setSent(false)}
            className="mt-2 text-xs text-green-700 underline"
          >
            続けて送る
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          {/* 送信者情報（自動入力・読み取り専用） */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">会社名</label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700">
                {me?.tenant_name ?? '...'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">メールアドレス</label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 truncate">
                {me?.email ?? '...'}
              </div>
            </div>
          </div>

          {/* お問い合わせ内容 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              お問い合わせ内容 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              placeholder="ご質問・ご要望・不具合の内容を入力してください"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          <button
            onClick={() => mut.mutate()}
            disabled={!message.trim() || mut.isPending}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {mut.isPending ? '送信中...' : '送信する'}
          </button>
        </div>
      )}
    </div>
  )
}
