import api from './client'

export interface TenantSettings {
  work_start_hour: number
  work_hours_per_day: number
  saturday_off: boolean
}

export interface TrialInfo {
  trial_ends_at: string
  days_remaining: number
  is_expired: boolean
}

export const settingsApi = {
  get: () => api.get<TenantSettings>('/settings'),
  update: (data: TenantSettings) => api.put<TenantSettings>('/settings', data),
  getTrial: () => api.get<TrialInfo>('/settings/trial'),
}
