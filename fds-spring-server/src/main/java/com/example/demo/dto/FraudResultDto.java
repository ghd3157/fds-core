package com.example.demo.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Python AI 서버 → Spring Boot (Kafka: fraud-result-topic)
 * FDS-DESIGN.md Section 4.2 계약 기준
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
    private String detectionSource;  // RULE | ML | HYBRID | NONE
    private String detectionReason;
    private Integer txCount1m;
    private Integer txCount10m;
    private Integer txCount1h;
    private String analyzedAt;
}
