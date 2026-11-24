import { useEffect, useState } from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getHourlyTraffic } from '../api/dashboardApi'
import { useRealtime } from '../context/realtimeContextDef'
import type { HourlyTraffic } from '../types/fds'

interface CustomTooltipProps {
  active?: boolean
  label?: string
  payload?: Array<{
    dataKey: string
    name: string
    value: number
    color: string
  }>
}

function CustomTooltip({ active, label, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-300 font-semibold mb-1">{label} (KST)</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="flex items-center justify-between gap-4 text-gray-200">
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="font-mono font-bold">{entry.value.toLocaleString()}건</span>
        </p>
      ))}
    </div>
  )
}

export default function HourlyTrafficChart() {
  const { refreshTick } = useRealtime()
  const [data, setData] = useState<HourlyTraffic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    getHourlyTraffic()
      .then((res) => {
        if (active) {
          setData(res)
          setError(false)
        }
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [refreshTick])

  const hasAnyTraffic = data.some((d) => d.normalCount > 0 || d.fraudCount > 0)

  const renderBody = () => {
    if (loading && data.length === 0) {
      return (
        <div className="flex items-center justify-center h-[240px]">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )
    }
    if (error && data.length === 0) {
      return (
        <div className="flex items-center justify-center h-[240px] text-gray-500 text-sm">
          시간대별 트래픽 데이터를 불러오지 못했습니다.
        </div>
      )
    }
    if (!hasAnyTraffic) {
      return (
        <div className="flex items-center justify-center h-[240px] text-gray-500 text-sm">
          최근 24시간 내 집계된 결제 트래픽이 없습니다.
        </div>
      )
    }

    return (
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="normalGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#818cf8" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
            interval={2}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => <span className="text-gray-400 text-xs">{value}</span>}
          />
          <Area
            type="monotone"
            dataKey="normalCount"
            name="정상 결제"
            stroke="#818cf8"
            strokeWidth={2}
            fill="url(#normalGrad)"
          />
          <Bar
            dataKey="fraudCount"
            name="이상 탐지"
            fill="#f87171"
            radius={[4, 4, 0, 0]}
            barSize={12}
          />
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-sm">최근 24시간 시간대별 트래픽</h3>
          <p className="text-gray-500 text-xs mt-0.5">Redis 시간대별 정상/이상 결제 집계 (KST)</p>
        </div>
      </div>
      {renderBody()}
    </div>
  )
}
