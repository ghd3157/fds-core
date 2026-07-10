package com.example.demo.controller;

import com.example.demo.dto.DashboardStatsResponseDto;
import com.example.demo.dto.FraudHistoryResponseDto;
import com.example.demo.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    /**
     * 오늘 날짜 기준 정상/이상 결제 통계 조회
     * GET /api/v1/dashboard/stats
     */
    @GetMapping("/stats")
    public ResponseEntity<DashboardStatsResponseDto> getStats() {
        return ResponseEntity.ok(dashboardService.getStats());
    }

    /**
     * 이상 탐지 내역 페이징 조회
     * GET /api/v1/dashboard/history?page=0&size=20&sort=riskScore,desc
     * GET /api/v1/dashboard/history?page=0&size=20&sort=createdAt,desc
     */
    @GetMapping("/history")
    public ResponseEntity<Page<FraudHistoryResponseDto>> getHistory(
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable
    ) {
        return ResponseEntity.ok(dashboardService.getHistory(pageable));
    }
}
