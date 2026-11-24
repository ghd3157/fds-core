import TransactionTable from '../components/TransactionTable'

export default function TransactionsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-white">전체 결제 내역 조회</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          거래 ID·사용자 검색 및 처리 상태·이상 탐지 여부·카테고리별 필터링 조회를 지원합니다.
        </p>
      </div>

      <TransactionTable pageSize={15} />
    </div>
  )
}
