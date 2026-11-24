import axiosInstance from './axiosInstance'
import type { CategoryStat, DashboardSummary, HourlyTraffic } from '../types/fds'

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const res = await axiosInstance.get<DashboardSummary>('/dashboard/summary')
  return res.data
}

export async function getHourlyTraffic(): Promise<HourlyTraffic[]> {
  const res = await axiosInstance.get<HourlyTraffic[]>('/dashboard/hourly-traffic')
  return res.data
}

export async function getFraudByCategory(): Promise<CategoryStat[]> {
  const res = await axiosInstance.get<CategoryStat[]>('/dashboard/fraud-by-category')
  return res.data
}
