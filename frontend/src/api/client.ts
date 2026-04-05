import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
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
