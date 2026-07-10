package com.example.demo.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class DashboardStatsResponseDto {
    private long normalCount;
    private long fraudCount;
    private long totalCount;
    private double fraudRatio; // 이상 탐지 비율 (%)
}
