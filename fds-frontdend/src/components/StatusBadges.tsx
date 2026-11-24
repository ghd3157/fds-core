import type { DetectionSource, ProcessStatus, ReviewStatus } from '../types/fds'

const PROCESS_STYLES: Record<ProcessStatus, string> = {
  PENDING: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  COMPLETE: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  FAILED: 'bg-red-500/15 text-red-400 border border-red-500/30',
}

export function ProcessStatusBadge({ status }: { status: ProcessStatus }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        PROCESS_STYLES[status] ?? 'bg-gray-700 text-gray-300'
      }`}
    >
      {status}
    </span>
  )
}

export function FraudBadge({ isFraud }: { isFraud: boolean }) {
  return isFraud ? (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30">
      🚨 이상 탐지
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700/60">
      정상
    </span>
  )
}

const SOURCE_STYLES: Record<DetectionSource, { cls: string; label: string }> = {
  HYBRID: {
    cls: 'bg-purple-500/15 text-purple-300 border border-purple-500/40',
    label: 'HYBRID',
  },
  RULE: {
    cls: 'bg-amber-500/15 text-amber-300 border border-amber-500/40',
    label: 'RULE',
  },
  ML: {
    cls: 'bg-sky-500/15 text-sky-300 border border-sky-500/40',
    label: 'ML',
  },
  ANOMALY: {
    cls: 'bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/40',
    label: 'ANOMALY',
  },
}

export function DetectionSourceBadge({
  source,
}: {
  source: DetectionSource | null
}) {
  if (!source) {
    return <span className="text-gray-600 text-xs">—</span>
  }
  const meta = SOURCE_STYLES[source]
  return (
    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

const REVIEW_STYLES: Record<ReviewStatus, { cls: string; label: string }> = {
  UNCONFIRMED: {
    cls: 'bg-red-500/15 text-red-400 border border-red-500/30',
    label: '미확인',
  },
  CONFIRMED_FRAUD: {
    cls: 'bg-rose-600/20 text-rose-300 border border-rose-500/40',
    label: '사기 확정',
  },
  FALSE_POSITIVE: {
    cls: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    label: '오탐 처리',
  },
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus | null }) {
  if (!status) {
    return <span className="text-gray-600 text-xs">—</span>
  }
  const meta = REVIEW_STYLES[status]
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

export function RiskScoreBar({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <span className="text-gray-600 text-xs">—</span>
  }
  const clamped = Math.max(0, Math.min(100, score))
  const barColor =
    clamped >= 90
      ? 'bg-red-500'
      : clamped >= 80
        ? 'bg-orange-400'
        : 'bg-indigo-400'

  return (
    <div className="flex items-center gap-2 min-w-[96px]">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs font-mono font-semibold text-gray-200 w-10 text-right">
        {clamped.toFixed(1)}
      </span>
    </div>
  )
}
