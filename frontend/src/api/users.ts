import api from './client'

export interface User {
  id: number
  email: string
  name: string | null
  role: 'admin' | 'member'
  is_active: boolean
}

export interface Me {
  user_id: number
  email: string
  name: string | null
  role: 'admin' | 'member'
  tenant_id: number
  tenant_name: string
  plan: string
}

export interface UserInvite {
  email: string
  name?: string
  password: string
  role?: 'admin' | 'member'
}

export interface UserUpdate {
  name?: string
  role?: 'admin' | 'member'
  is_active?: boolean
  password?: string
}

export const usersApi = {
  me: () => api.get<Me>('/auth/me'),
  list: () => api.get<User[]>('/users/'),
  invite: (data: UserInvite) => api.post<User>('/users/invite', data),
  update: (id: number, data: UserUpdate) => api.put<User>(`/users/${id}`, data),
}
