import { useEffect, useState } from 'react'
import { getFraudByCategory, type CategoryStat } from '../api/dashboardApi'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

// 다크 테마 친화적 팔레트
const COLORS = ['#818cf8', '#f472b6', '#fb923c', '#34d399', '#facc15', '#60a5fa', '#a78bfa']

interface CustomTooltipProps {
  active?: boolean
  payload?: { name: string; value: number; payload: CategoryStat }[]
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-lg">
      <p className="text-gray-300 font-medium">{name}</p>
      <p className="text-white font-bold">{value.toLocaleString()} 건</p>
    </div>
  )
}

export default function FraudPieChart() {
  const [data, setData] = useState<CategoryStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    getFraudByCategory()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  const renderBody = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-[220px]">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )
    }
    if (error) {
      return (
        <div className="flex items-center justify-center h-[220px] text-gray-500 text-sm">
          데이터를 불러오지 못했습니다.
        </div>
      )
    }
    if (data.length === 0) {
      return (
        <div className="flex items-center justify-center h-[220px] text-gray-500 text-sm">
          집계된 데이터가 없습니다.
        </div>
      )
    }
    return (
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="category"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => (
              <span className="text-gray-400 text-xs">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <div>
        <h3 className="text-white font-semibold text-sm">카테고리별 이상 결제 비율</h3>
        <p className="text-gray-500 text-xs mt-0.5">Redis 집계 데이터 기반</p>
      </div>
      {renderBody()}
    </div>
  )
}
