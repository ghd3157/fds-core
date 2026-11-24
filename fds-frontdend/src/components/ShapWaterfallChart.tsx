import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ShapContribution } from '../types/fds'

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ payload: ShapContribution }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  const isPos = item.shap >= 0
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-white font-semibold">{item.label}</p>
      <p className="text-gray-400 font-mono mt-0.5">
        피처: {item.feature} (입력값: {item.value.toLocaleString()})
      </p>
      <p className={`font-mono font-bold mt-1 ${isPos ? 'text-red-400' : 'text-sky-400'}`}>
        SHAP 기여도: {isPos ? '+' : ''}
        {item.shap.toFixed(4)} ({isPos ? '사기 위험 상승' : '정상 방향 완화'})
      </p>
    </div>
  )
}

export default function ShapWaterfallChart({
  contributions,
}: {
  contributions: ShapContribution[]
}) {
  if (!contributions || contributions.length === 0) {
    return (
      <div className="text-xs text-gray-500 py-4 text-center">
        이 알람에는 저장된 TreeSHAP 피처 기여도 데이터가 없습니다.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <span>피처별 TreeSHAP 기여도 (XAI 설명)</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />
            위험 상승(+)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 inline-block" />
            정상 완화(-)
          </span>
        </span>
      </div>

      <ResponsiveContainer width="100%" height={190}>
        <BarChart
          data={contributions}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 10, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={118}
            tick={{ fill: '#d1d5db', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <ReferenceLine x={0} stroke="#4b5563" />
          <Bar dataKey="shap" radius={[4, 4, 4, 4]} barSize={14}>
            {contributions.map((entry, idx) => (
              <Cell
                key={idx}
                fill={entry.shap >= 0 ? '#f87171' : '#38bdf8'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
