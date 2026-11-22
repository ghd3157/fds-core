package com.example.demo.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class DashboardSummaryResponseDto {
    private long todayFraudCount;
    private long todayNormalCount;
    private long todayTotalCount;
    private double todayFraudRatio;
    private long unconfirmedAlertCount;
    private long pendingCount;
    private long completeCount;
}
