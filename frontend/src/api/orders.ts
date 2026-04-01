import api from './client'

export type OrderStatus = 'pending' | 'in_progress' | 'done'

export interface Order {
  id: number
  order_number: string
  product_name: string
  product_code: string
  quantity: number
  due_date: string
  priority: 1 | 2 | 3
  status: OrderStatus
  note?: string
  created_at: string
}

export interface OrderCreate {
  order_number: string
  product_name: string
  product_code: string
  quantity: number
  due_date: string
  priority: 1 | 2 | 3
  status?: OrderStatus
  note?: string
}

export const ordersApi = {
  list: (params?: { status?: string; priority?: number }) =>
    api.get<{ total: number; items: Order[] }>('/orders', { params }),
  get: (id: number) => api.get<Order>(`/orders/${id}`),
  create: (data: OrderCreate) => api.post<Order>('/orders', data),
  update: (id: number, data: Partial<OrderCreate>) =>
    api.put<Order>(`/orders/${id}`, data),
  delete: (id: number) => api.delete(`/orders/${id}`),
}
