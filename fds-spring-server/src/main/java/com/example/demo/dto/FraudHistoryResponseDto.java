package com.example.demo.dto;

import com.example.demo.domain.FraudAlert;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class FraudHistoryResponseDto {
    private final Long alertId;
    private final String transactionId;
    private final Double riskScore;
    private final String detectionReason;
    private final boolean confirmed;
    private final LocalDateTime createdAt;

    private FraudHistoryResponseDto(FraudAlert alert) {
        this.alertId = alert.getId();
        this.transactionId = alert.getTransactionLog().getTransactionId();
        this.riskScore = alert.getRiskScore();
        this.detectionReason = alert.getDetectionReason();
        this.confirmed = alert.isConfirmed();
        this.createdAt = alert.getCreatedAt();
    }

    public static FraudHistoryResponseDto from(FraudAlert alert) {
        return new FraudHistoryResponseDto(alert);
    }
}
