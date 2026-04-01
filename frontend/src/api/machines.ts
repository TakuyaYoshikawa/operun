import api from './client'

export interface Machine {
  id: number
  name: string
  code: string
  daily_capacity_hours: number
  setup_time_minutes: number
  is_active: boolean
  created_at: string
}

export interface Process {
  id: number
  name: string
  code: string
  standard_time_per_unit: number
  created_at: string
}

export const machinesApi = {
  list: (params?: { is_active?: boolean }) =>
    api.get<Machine[]>('/machines', { params }),
  create: (data: Omit<Machine, 'id' | 'created_at'>) =>
    api.post<Machine>('/machines', data),
  update: (id: number, data: Partial<Machine>) =>
    api.put<Machine>(`/machines/${id}`, data),
  delete: (id: number) => api.delete(`/machines/${id}`),
}

export const processesApi = {
  list: () => api.get<Process[]>('/machines/processes/'),
  create: (data: Omit<Process, 'id' | 'created_at'>) =>
    api.post<Process>('/machines/processes/', data),
  update: (id: number, data: Partial<Process>) =>
    api.put<Process>(`/machines/processes/${id}`, data),
  delete: (id: number) => api.delete(`/machines/processes/${id}`),
}
