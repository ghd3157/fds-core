package com.example.demo.dto;

import com.example.demo.domain.FraudAlert;
import com.example.demo.domain.TransactionLog;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * WebSocket STOMP /topic/alerts 통일 브로드캐스트 Payload
 * FDS-DESIGN.md Section 6.4 계약 기준 (Spring ↔ Frontend 1:1 일치)
 */
@Getter
@Builder
@AllArgsConstructor
public class AlertPayload {
    private Long alertId;
    private String transactionId;
    private String userId;
    private BigDecimal amount;
    private String merchantCategory;
    private Double riskScore;
    private Double ruleScore;
    private Double mlScore;
    private String detectionSource;
    private String detectionReason;
    private Integer txCount1m;
    private String reviewStatus;
    private LocalDateTime createdAt;

    public static AlertPayload from(FraudAlert alert, TransactionLog tx) {
        return AlertPayload.builder()
                .alertId(alert.getId())
                .transactionId(tx.getTransactionId())
                .userId(tx.getUserId())
                .amount(tx.getAmount())
                .merchantCategory(tx.getMerchantCategory())
                .riskScore(alert.getRiskScore())
                .ruleScore(alert.getRuleScore())
                .mlScore(alert.getMlScore())
                .detectionSource(alert.getDetectionSource().name())
                .detectionReason(alert.getDetectionReason())
                .txCount1m(alert.getTxCount1m())
                .reviewStatus(alert.getReviewStatus().name())
                .createdAt(alert.getCreatedAt())
                .build();
    }
}
