package com.example.demo.controller;

import com.example.demo.dto.CategoryStatDto;
import com.example.demo.dto.DashboardSummaryResponseDto;
import com.example.demo.dto.HourlyTrafficDto;
import com.example.demo.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    /** 상단 KPI 요약 통계 (오늘 사기/정상/비율, 미확인 알람, PENDING/COMPLETE) */
    @GetMapping("/summary")
    public ResponseEntity<DashboardSummaryResponseDto> getSummary() {
        return ResponseEntity.ok(dashboardService.getSummary());
    }

    /** 최근 24시간(KST) 시간대별 정상/사기 트래픽 시계열 */
    @GetMapping("/hourly-traffic")
    public ResponseEntity<List<HourlyTrafficDto>> getHourlyTraffic() {
        return ResponseEntity.ok(dashboardService.getHourlyTraffic());
    }

    /** MariaDB FraudAlert 기준 카테고리별 사기 건수 집계 */
    @GetMapping("/fraud-by-category")
    public ResponseEntity<List<CategoryStatDto>> getFraudByCategory() {
        return ResponseEntity.ok(dashboardService.getFraudByCategory());
    }
}
