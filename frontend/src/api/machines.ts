import api from './client'

export interface Machine {
  id: number
  name: string
  code: string
  machine_type: string | null
  daily_capacity_hours: number
  setup_time_minutes: number
  batch_capacity: number
  work_start_hour: number | null
  is_active: boolean
  is_outsource: boolean
  outsource_supplier: string | null
  created_at: string
}

export interface MachineMaintenance {
  id: number
  machine_id: number
  start_datetime: string
  end_datetime: string
  reason: string | null
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

  maintenance: {
    list: (machineId: number) =>
      api.get<MachineMaintenance[]>(`/machines/${machineId}/maintenance`),
    create: (machineId: number, data: { start_datetime: string; end_datetime: string; reason?: string }) =>
      api.post<MachineMaintenance>(`/machines/${machineId}/maintenance`, data),
    delete: (machineId: number, maintId: number) =>
      api.delete(`/machines/${machineId}/maintenance/${maintId}`),
  },
}

export const processesApi = {
  list: () => api.get<Process[]>('/machines/processes/'),
  create: (data: Omit<Process, 'id' | 'created_at'>) =>
    api.post<Process>('/machines/processes/', data),
  update: (id: number, data: Partial<Process>) =>
    api.put<Process>(`/machines/processes/${id}`, data),
  delete: (id: number) => api.delete(`/machines/processes/${id}`),
}
