package com.example.demo.controller;

import com.example.demo.domain.FraudAlert.DetectionSource;
import com.example.demo.domain.FraudAlert.ReviewStatus;
import com.example.demo.dto.AlertReviewRequestDto;
import com.example.demo.dto.FraudAlertResponseDto;
import com.example.demo.service.AlertService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/alerts")
@RequiredArgsConstructor
public class AlertController {

    private final AlertService alertService;

    /** 이상 탐지 알람 목록 필터·페이징 조회 */
    @GetMapping
    public ResponseEntity<Page<FraudAlertResponseDto>> getAlerts(
            @RequestParam(required = false) ReviewStatus reviewStatus,
            @RequestParam(required = false) DetectionSource detectionSource,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable
    ) {
        return ResponseEntity.ok(alertService.getAlerts(reviewStatus, detectionSource, pageable));
    }

    /** 이상 탐지 알람 단건 상세 조회 */
    @GetMapping("/{alertId}")
    public ResponseEntity<FraudAlertResponseDto> getAlertDetail(@PathVariable Long alertId) {
        return ResponseEntity.ok(alertService.getAlertDetail(alertId));
    }

    /** 이상 탐지 알람 사기 확정 / 오탐 처리 (ROLE_ADMIN 전용) */
    @PatchMapping("/{alertId}/review")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<FraudAlertResponseDto> reviewAlert(
            @PathVariable Long alertId,
            @Valid @RequestBody AlertReviewRequestDto request,
            Authentication authentication
    ) {
        return ResponseEntity.ok(alertService.reviewAlert(alertId, request, authentication.getName()));
    }
}
