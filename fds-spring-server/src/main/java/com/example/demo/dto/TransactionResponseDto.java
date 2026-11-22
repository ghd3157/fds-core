package com.example.demo.dto;

import com.example.demo.domain.FraudAlert;
import com.example.demo.domain.TransactionLog;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Getter
@Builder
public class TransactionResponseDto {

    private Long id;
    private String transactionId;
    private String userId;
    private BigDecimal amount;
    private String merchantCategory;
    private Double latitude;
    private Double longitude;
    private String status;

    @JsonProperty("isFraud")
    private boolean isFraud;

    private Double riskScore;
    private String detectionSource;
    private String reviewStatus;
    private LocalDateTime createdAt;

    public static TransactionResponseDto of(TransactionLog log, FraudAlert alert) {
        return TransactionResponseDto.builder()
                .id(log.getId())
                .transactionId(log.getTransactionId())
                .userId(log.getUserId())
                .amount(log.getAmount())
                .merchantCategory(log.getMerchantCategory())
                .latitude(log.getLatitude())
                .longitude(log.getLongitude())
                .status(log.getStatus().name())
                .isFraud(alert != null)
                .riskScore(alert != null ? alert.getRiskScore() : null)
                .detectionSource(alert != null ? alert.getDetectionSource().name() : null)
                .reviewStatus(alert != null ? alert.getReviewStatus().name() : null)
                .createdAt(log.getTransactionDate())
                .build();
    }
}
