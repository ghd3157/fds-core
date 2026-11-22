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
public class TransactionDetailResponseDto {

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

    private LocalDateTime createdAt;
    private FraudAlertResponseDto alert;

    public static TransactionDetailResponseDto of(TransactionLog log, FraudAlert alert) {
        return TransactionDetailResponseDto.builder()
                .id(log.getId())
                .transactionId(log.getTransactionId())
                .userId(log.getUserId())
                .amount(log.getAmount())
                .merchantCategory(log.getMerchantCategory())
                .latitude(log.getLatitude())
                .longitude(log.getLongitude())
                .status(log.getStatus().name())
                .isFraud(alert != null)
                .createdAt(log.getTransactionDate())
                .alert(alert != null ? FraudAlertResponseDto.from(alert) : null)
                .build();
    }
}
