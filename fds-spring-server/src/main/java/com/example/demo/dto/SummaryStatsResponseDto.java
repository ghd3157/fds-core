package com.example.demo.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class SummaryStatsResponseDto {

    /** 오늘 날짜 기준 Redis에서 조회한 사기 탐지 건수 */
    private long todayFraudCount;

    /** TransactionLog 테이블에서 status = PENDING 인 전체 건수 */
    private long pendingCount;

    /** TransactionLog 테이블에서 status = COMPLETE 인 전체 건수 */
    private long completeCount;
}
