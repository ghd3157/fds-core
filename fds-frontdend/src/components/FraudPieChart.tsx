import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { getFraudByCategory } from '../api/dashboardApi'
import { useRealtime } from '../context/realtimeContextDef'
import type { CategoryStat } from '../types/fds'

const COLORS = ['#818cf8', '#f472b6', '#fb923c', '#34d399', '#facc15', '#60a5fa', '#a78bfa']

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: CategoryStat }>
  total: number
}

function CustomTooltip({ active, payload, total }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-300 font-medium">{name}</p>
      <p className="text-white font-bold mt-0.5">
        {value.toLocaleString()}건 <span className="text-gray-400 font-normal">({pct}%)</span>
      </p>
    </div>
  )
}

export default function FraudPieChart() {
  const { refreshTick } = useRealtime()
  const [data, setData] = useState<CategoryStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    getFraudByCategory()
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

  const total = data.reduce((sum, item) => sum + item.count, 0)

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
          데이터를 불러오지 못했습니다.
        </div>
      )
    }
    if (data.length === 0) {
      return (
        <div className="flex items-center justify-center h-[240px] text-gray-500 text-sm">
          집계된 이상 결제 데이터가 없습니다.
        </div>
      )
    }
    return (
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="category"
            cx="50%"
            cy="50%"
            innerRadius={56}
            outerRadius={86}
            paddingAngle={3}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip total={total} />} />
          <Legend
            formatter={(value) => <span className="text-gray-400 text-xs">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-sm">카테고리별 이상 결제 분포</h3>
          <p className="text-gray-500 text-xs mt-0.5">MariaDB 이상 탐지 집계 기반</p>
        </div>
        {total > 0 && (
          <span className="text-xs font-mono text-gray-400">
            누적 {total.toLocaleString()}건
          </span>
        )}
      </div>
      {renderBody()}
    </div>
  )
}
