package com.example.demo.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@AllArgsConstructor
public class AlertPayload {
    private String transactionId;
    private Double riskScore;
    private String detectionReason;
    private LocalDateTime createdAt;
}
