import api from './client'

export const inquiriesApi = {
  create: (message: string) => api.post('/inquiries', { message }),
}
