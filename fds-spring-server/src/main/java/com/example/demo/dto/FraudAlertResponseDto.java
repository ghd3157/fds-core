package com.example.demo.dto;

import com.example.demo.domain.FraudAlert;
import com.example.demo.domain.TransactionLog;
import lombok.Builder;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Getter
@Builder
public class FraudAlertResponseDto {

    private Long alertId;
    private String transactionId;
    private String userId;
    private BigDecimal amount;
    private String merchantCategory;
    private Double latitude;
    private Double longitude;
    private LocalDateTime transactionDate;
    private Double riskScore;
    private Double ruleScore;
    private Double mlScore;
    private String detectionSource;
    private String detectionReason;
    private Integer txCount1m;
    private String reviewStatus;
    private String reviewNote;
    private String reviewedBy;
    private LocalDateTime reviewedAt;
    private LocalDateTime createdAt;

    public static FraudAlertResponseDto from(FraudAlert alert) {
        TransactionLog tx = alert.getTransactionLog();
        return FraudAlertResponseDto.builder()
                .alertId(alert.getId())
                .transactionId(tx.getTransactionId())
                .userId(tx.getUserId())
                .amount(tx.getAmount())
                .merchantCategory(tx.getMerchantCategory())
                .latitude(tx.getLatitude())
                .longitude(tx.getLongitude())
                .transactionDate(tx.getTransactionDate())
                .riskScore(alert.getRiskScore())
                .ruleScore(alert.getRuleScore())
                .mlScore(alert.getMlScore())
                .detectionSource(alert.getDetectionSource().name())
                .detectionReason(alert.getDetectionReason())
                .txCount1m(alert.getTxCount1m())
                .reviewStatus(alert.getReviewStatus().name())
                .reviewNote(alert.getReviewNote())
                .reviewedBy(alert.getReviewedBy())
                .reviewedAt(alert.getReviewedAt())
                .createdAt(alert.getCreatedAt())
                .build();
    }
}
