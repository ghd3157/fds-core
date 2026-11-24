package com.example.demo.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Python AI 서버 → Spring Boot (Kafka: fraud-result-topic)
 * Phase 5: 3중 앙상블(anomalyScore) 및 피처별 SHAP 기여도(shapContributions) 포함
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FraudResultDto {
    private String transactionId;
    private Double riskScore;
    private Double ruleScore;
    private Double mlScore;
    private Double anomalyScore;
    private String detectionSource;  // RULE | ML | ANOMALY | HYBRID | NONE
    private String detectionReason;
    private List<ShapContributionDto> shapContributions;
    private Integer txCount1m;
    private Integer txCount10m;
    private Integer txCount1h;
    private String analyzedAt;
}
