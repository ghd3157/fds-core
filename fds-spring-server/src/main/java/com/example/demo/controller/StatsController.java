package com.example.demo.controller;

import com.example.demo.dto.CategoryStatDto;
import com.example.demo.dto.SummaryStatsResponseDto;
import com.example.demo.service.StatsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/stats")
@RequiredArgsConstructor
public class StatsController {

    private final StatsService statsService;

    /**
     * 요약 통계 조회
     * GET /api/v1/stats/summary
     * - todayFraudCount: Redis fds:stats:{yyyy-MM-dd}:fraud 값
     * - pendingCount: status = PENDING 인 전체 건수
     * - completeCount: status = COMPLETE 인 전체 건수
     */
    @GetMapping("/summary")
    public ResponseEntity<SummaryStatsResponseDto> getSummary() {
        return ResponseEntity.ok(statsService.getSummary());
    }

    /**
     * 카테고리별 사기 탐지 건수 조회
     * GET /api/v1/stats/fraud-by-category
     * - FraudAlert 기준, TransactionLog.merchantCategory 로 GROUP BY 집계
     */
    @GetMapping("/fraud-by-category")
    public ResponseEntity<List<CategoryStatDto>> getFraudByCategory() {
        return ResponseEntity.ok(statsService.getFraudByCategory());
    }
}
