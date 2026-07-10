package com.example.demo.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class FraudResultDto {
    private String transactionId;
    private Double riskScore;
    private String fraudReason;
}
