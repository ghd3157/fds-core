import { useEffect, useState, useCallback } from 'react'
import { getTransactions, type Transaction, type PageResponse } from '../api/dashboardApi'

const PAGE_SIZE = 10

const STATUS_STYLE: Record<string, string> = {
  PENDING:  'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  COMPLETE: 'bg-green-500/15  text-green-400  border border-green-500/30',
  FRAUD:    'bg-red-500/15    text-red-400    border border-red-500/30',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[status] ?? 'bg-gray-700 text-gray-400'}`}>
      {status}
    </span>
  )
}

function FraudBadge({ isFraud }: { isFraud: boolean }) {
  return isFraud ? (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30">
      🚨 Fraud
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700/50 text-gray-500">
      정상
    </span>
  )
}

export default function TransactionTable() {
  const [page, setPage] = useState(0)
  const [data, setData] = useState<PageResponse<Transaction> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchPage = useCallback((p: number) => {
    setLoading(true)
    setError(false)
    getTransactions(p, PAGE_SIZE)
      .then((res) => { setData(res); setPage(p) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchPage(0) }, [fetchPage])

  const rows = data?.content ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col gap-4 overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 pt-6">
        <h3 className="text-white font-semibold text-sm">결제 내역</h3>
        <p className="text-gray-500 text-xs mt-0.5">
          총 {data?.totalElements.toLocaleString() ?? '—'} 건
        </p>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-gray-800 bg-gray-800/50">
              {['거래 ID', '금액', '카테고리', '상태', '탐지', '일시'].map((col) => (
                <th
                  key={col}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-400 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <tr key={i} className="border-b border-gray-800/60">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-700 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500 text-sm">
                  데이터를 불러오지 못했습니다.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500 text-sm">
                  결제 내역이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((tx) => (
                <tr
                  key={tx.id}
                  className={`border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors ${
                    tx.isFraud ? 'bg-red-500/5' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-300 whitespace-nowrap">
                    {tx.transactionId}
                  </td>
                  <td className="px-4 py-3 text-white whitespace-nowrap">
                    {tx.amount.toLocaleString()}
                    <span className="text-gray-500 text-xs ml-0.5">원</span>
                  </td>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{tx.category}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={tx.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <FraudBadge isFraud={tx.isFraud} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(tx.createdAt).toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div className="flex items-center justify-between px-6 pb-5">
        <span className="text-gray-500 text-xs">
          {page + 1} / {totalPages} 페이지
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchPage(0)}
            disabled={page === 0 || loading}
            className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            «
          </button>
          <button
            onClick={() => fetchPage(page - 1)}
            disabled={page === 0 || loading}
            className="px-3 py-1 rounded text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            이전
          </button>

          {Array.from({ length: totalPages }, (_, i) => i)
            .filter((i) => Math.abs(i - page) <= 2)
            .map((i) => (
              <button
                key={i}
                onClick={() => fetchPage(i)}
                disabled={loading}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  i === page
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-gray-400 hover:bg-gray-800'
                }`}
              >
                {i + 1}
              </button>
            ))}

          <button
            onClick={() => fetchPage(page + 1)}
            disabled={page >= totalPages - 1 || loading}
            className="px-3 py-1 rounded text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            다음
          </button>
          <button
            onClick={() => fetchPage(totalPages - 1)}
            disabled={page >= totalPages - 1 || loading}
            className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            »
          </button>
        </div>
      </div>
    </div>
  )
}
