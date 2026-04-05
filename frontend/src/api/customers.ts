import api from './client'

export interface Customer {
  id: number
  code: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  note: string | null
  created_at: string
}

export interface CustomerCreate {
  code: string
  name: string
  contact_name?: string
  phone?: string
  email?: string
  note?: string
}

export const customersApi = {
  list: (q?: string) =>
    api.get<{ total: number; items: Customer[] }>('/customers', { params: q ? { q } : undefined }),
  get: (id: number) => api.get<Customer>(`/customers/${id}`),
  create: (data: CustomerCreate) => api.post<Customer>('/customers', data),
  update: (id: number, data: Partial<CustomerCreate>) =>
    api.put<Customer>(`/customers/${id}`, data),
  delete: (id: number) => api.delete(`/customers/${id}`),
}
