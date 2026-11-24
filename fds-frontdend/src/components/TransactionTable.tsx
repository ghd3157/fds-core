import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getTransactions } from '../api/transactionsApi'
import { useRealtime } from '../context/realtimeContextDef'
import type { PageResponse, ProcessStatus, Transaction } from '../types/fds'
import {
  DetectionSourceBadge,
  FraudBadge,
  ProcessStatusBadge,
  RiskScoreBar,
} from './StatusBadges'
import TransactionDetailModal from './TransactionDetailModal'

const CATEGORIES = [
  'grocery_pos',
  'grocery_net',
  'shopping_pos',
  'shopping_net',
  'misc_pos',
  'misc_net',
  'gas_transport',
  'food_dining',
  'entertainment',
  'travel',
  'health_fitness',
  'home',
  'kids_pets',
  'personal_care',
  'gambling',
  'crypto',
]

interface TransactionTableProps {
  compact?: boolean
  pageSize?: number
}

export default function TransactionTable({
  compact = false,
  pageSize = 10,
}: TransactionTableProps) {
  const { refreshTick, openAlertModal } = useRealtime()

  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState<ProcessStatus | ''>('')
  const [fraudFilter, setFraudFilter] = useState<'' | 'true' | 'false'>('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')

  const [data, setData] = useState<PageResponse<Transaction> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null)

  const fetchPage = useCallback(
    (targetPage: number) => {
      setLoading(true)
      setError(false)
      getTransactions({
        page: targetPage,
        size: pageSize,
        status: statusFilter,
        isFraud: fraudFilter === '' ? '' : fraudFilter === 'true',
        category: categoryFilter,
        keyword,
      })
        .then((res) => {
          setData(res)
          setPage(targetPage)
        })
        .catch(() => setError(true))
        .finally(() => setLoading(false))
    },
    [pageSize, statusFilter, fraudFilter, categoryFilter, keyword],
  )

  useEffect(() => {
    fetchPage(0)
  }, [fetchPage])

  // WebSocket 실시간 갱신 (현재 페이지 유지)
  useEffect(() => {
    if (refreshTick === 0) return
    fetchPage(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick])

  const rows = data?.content ?? []
  const totalPages = Math.max(1, data?.totalPages ?? 1)

  return (
    <>
      <TransactionDetailModal
        transactionId={selectedTxId}
        onClose={() => setSelectedTxId(null)}
        onOpenAlert={openAlertModal}
      />

      <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col gap-4 overflow-hidden">
        {/* 헤더 */}
        <div className="px-6 pt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-white font-semibold text-sm">
              {compact ? '최근 결제 내역' : '전체 결제 내역'}
            </h3>
            <p className="text-gray-500 text-xs mt-0.5">
              총 {data?.totalElements.toLocaleString() ?? '—'}건 (행을 클릭해 상세 보기)
            </p>
          </div>
          {compact && (
            <Link
              to="/transactions"
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              전체 검색·필터 보기 →
            </Link>
          )}
        </div>

        {/* 검색 & 필터 바 (전체 모드 전용) */}
        {!compact && (
          <div className="px-6 flex flex-wrap items-center gap-2.5">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setKeyword(keywordInput)
              }}
              className="flex items-center gap-2 flex-1 min-w-[240px]"
            >
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                placeholder="거래 ID 또는 사용자 ID 검색..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                검색
              </button>
            </form>

            <select
              value={fraudFilter}
              onChange={(e) => setFraudFilter(e.target.value as '' | 'true' | 'false')}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">탐지: 전체</option>
              <option value="true">이상 탐지 (Fraud)</option>
              <option value="false">정상 거래</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ProcessStatus | '')}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">상태: 전체</option>
              <option value="PENDING">PENDING</option>
              <option value="COMPLETE">COMPLETE</option>
              <option value="FAILED">FAILED</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">카테고리: 전체</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {(statusFilter || fraudFilter || categoryFilter || keyword) && (
              <button
                onClick={() => {
                  setStatusFilter('')
                  setFraudFilter('')
                  setCategoryFilter('')
                  setKeywordInput('')
                  setKeyword('')
                }}
                className="px-2.5 py-2 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                초기화
              </button>
            )}
          </div>
        )}

        {/* 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-gray-800 bg-gray-800/50">
                {[
                  '거래 ID',
                  '사용자',
                  '금액',
                  '업종',
                  '상태',
                  '탐지',
                  '위험 스코어',
                  '출처',
                  '일시 (KST)',
                ].map((col) => (
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
              {loading && rows.length === 0 ? (
                Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-800/60">
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-800 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500 text-sm">
                    거래 내역을 불러오지 못했습니다.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500 text-sm">
                    조건에 맞는 결제 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((tx) => (
                  <tr
                    key={tx.id}
                    onClick={() => setSelectedTxId(tx.transactionId)}
                    className={`border-b border-gray-800/60 hover:bg-gray-800/50 cursor-pointer transition-colors ${
                      tx.isFraud ? 'bg-red-500/5' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-300 whitespace-nowrap max-w-[180px] truncate">
                      {tx.transactionId}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                      {tx.userId}
                    </td>
                    <td className="px-4 py-3 text-white font-medium whitespace-nowrap">
                      {tx.amount.toLocaleString()}
                      <span className="text-gray-500 text-xs ml-0.5">원</span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                      {tx.merchantCategory}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ProcessStatusBadge status={tx.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <FraudBadge isFraud={tx.isFraud} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <RiskScoreBar score={tx.riskScore} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <DetectionSourceBadge source={tx.detectionSource} />
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
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
    </>
  )
}
