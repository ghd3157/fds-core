package com.example.demo.dto;

import com.example.demo.domain.FraudAlert;
import com.example.demo.domain.TransactionLog;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Builder;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Getter
@Builder
public class FraudAlertResponseDto {

    private static final ObjectMapper SHAP_MAPPER = new ObjectMapper();

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
    private Double anomalyScore;
    private String detectionSource;
    private String detectionReason;
    private List<ShapContributionDto> shapContributions;
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
                .anomalyScore(alert.getAnomalyScore())
                .detectionSource(alert.getDetectionSource().name())
                .detectionReason(alert.getDetectionReason())
                .shapContributions(parseShap(alert.getShapJson()))
                .txCount1m(alert.getTxCount1m())
                .reviewStatus(alert.getReviewStatus().name())
                .reviewNote(alert.getReviewNote())
                .reviewedBy(alert.getReviewedBy())
                .reviewedAt(alert.getReviewedAt())
                .createdAt(alert.getCreatedAt())
                .build();
    }

    private static List<ShapContributionDto> parseShap(String shapJson) {
        if (shapJson == null || shapJson.isBlank()) {
            return List.of();
        }
        try {
            return SHAP_MAPPER.readValue(shapJson, new TypeReference<>() {});
        } catch (Exception ignored) {
            return List.of();
        }
    }
}
