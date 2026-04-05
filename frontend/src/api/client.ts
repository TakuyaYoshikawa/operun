import axios from 'axios'

// 本番（Vercel）では VITE_API_URL=https://your-app.render.com に設定する
// 開発時は Vite のプロキシ経由で /api → localhost:8000 に転送される
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  headers: { 'Content-Type': 'application/json' },
})

// リクエストごとにlocalStorageからトークンを読む（リロード時の取りこぼし防止）
api.interceptors.request.use(config => {
  const token = localStorage.getItem('operun_token')
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// 401 → トークンを削除してログイン画面へ
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('operun_token')
      window.location.reload()
    }
    return Promise.reject(err)
  }
)

export default api
