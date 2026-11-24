import axiosInstance from './axiosInstance'
import type { ModelStatusResponse, RetrainResponse } from '../types/fds'

export async function getModelStatus(): Promise<ModelStatusResponse> {
  const res = await axiosInstance.get<ModelStatusResponse>('/models/status')
  return res.data
}

export async function triggerModelRetrain(
  forcePromote: boolean = false,
): Promise<RetrainResponse> {
  const res = await axiosInstance.post<RetrainResponse>(
    '/models/retrain',
    null,
    {
      params: { forcePromote },
      timeout: 60000,
    },
  )
  return res.data
}
