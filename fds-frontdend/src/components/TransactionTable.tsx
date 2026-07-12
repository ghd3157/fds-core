// TODO: 백엔드 연동 시 아래 import로 교체
// import { useEffect, useState, useCallback } from 'react'
// import { getTransactions, type Transaction, type PageResponse } from '../api/dashboardApi'

import { useState } from 'react'
import type { Transaction, PageResponse } from '../api/dashboardApi'

// ── 임시 더미 데이터 (백엔드 연동 전) ──────────────────────────
const DUMMY_TRANSACTIONS: Transaction[] = [
  { id: 1,  transactionId: 'TXN-20240712-00001', amount: 1250000, category: '해외 결제',   status: 'COMPLETE', isFraud: true,  createdAt: '2026-07-12T08:32:14Z' },
  { id: 2,  transactionId: 'TXN-20240712-00002', amount: 89000,   category: '온라인 쇼핑', status: 'COMPLETE', isFraud: false, createdAt: '2026-07-12T09:11:05Z' },
  { id: 3,  transactionId: 'TXN-20240712-00003', amount: 3400000, category: '현금 서비스', status: 'PENDING',  isFraud: true,  createdAt: '2026-07-12T10:05:49Z' },
  { id: 4,  transactionId: 'TXN-20240712-00004', amount: 45000,   category: '식음료',      status: 'COMPLETE', isFraud: false, createdAt: '2026-07-12T10:22:33Z' },
  { id: 5,  transactionId: 'TXN-20240712-00005', amount: 780000,  category: '해외 결제',   status: 'PENDING',  isFraud: true,  createdAt: '2026-07-12T11:00:17Z' },
  { id: 6,  transactionId: 'TXN-20240712-00006', amount: 12000,   category: '교통/주유',   status: 'COMPLETE', isFraud: false, createdAt: '2026-07-12T11:45:02Z' },
  { id: 7,  transactionId: 'TXN-20240712-00007', amount: 560000,  category: '온라인 쇼핑', status: 'COMPLETE', isFraud: false, createdAt: '2026-07-12T12:03:44Z' },
  { id: 8,  transactionId: 'TXN-20240712-00008', amount: 2100000, category: '현금 서비스', status: 'PENDING',  isFraud: true,  createdAt: '2026-07-12T13:17:29Z' },
  { id: 9,  transactionId: 'TXN-20240712-00009', amount: 33000,   category: '의료',        status: 'COMPLETE', isFraud: false, createdAt: '2026-07-12T14:08:55Z' },
  { id: 10, transactionId: 'TXN-20240712-00010', amount: 970000,  category: '해외 결제',   status: 'PENDING',  isFraud: true,  createdAt: '2026-07-12T15:50:11Z' },
]

const DUMMY_PAGE: PageResponse<Transaction> = {
  content: DUMMY_TRANSACTIONS,
  totalPages: 5,
  totalElements: 48,
  number: 0,
}
// ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  COMPLETE: 'bg-green-500/15 text-green-400 border border-green-500/30',
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

  // TODO: 백엔드 연동 시 아래 로직으로 교체
  // const [data, setData] = useState<PageResponse<Transaction> | null>(null)
  // const fetchPage = useCallback((p: number) => { ... }, [])
  // useEffect(() => { fetchPage(0) }, [fetchPage])
  const data: PageResponse<Transaction> = { ...DUMMY_PAGE, number: page }
  const rows = data.content
  const totalPages = data.totalPages

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col gap-4 overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 pt-6">
        <h3 className="text-white font-semibold text-sm">결제 내역</h3>
        <p className="text-gray-500 text-xs mt-0.5">
          총 {data.totalElements.toLocaleString()} 건
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
            {rows.map((tx) => (
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
            ))}
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
            onClick={() => setPage(0)}
            disabled={page === 0}
            className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            «
          </button>
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
            className="px-3 py-1 rounded text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            이전
          </button>

          {Array.from({ length: totalPages }, (_, i) => i)
            .filter((i) => Math.abs(i - page) <= 2)
            .map((i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
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
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
            className="px-3 py-1 rounded text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            다음
          </button>
          <button
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            »
          </button>
        </div>
      </div>
    </div>
  )
}
