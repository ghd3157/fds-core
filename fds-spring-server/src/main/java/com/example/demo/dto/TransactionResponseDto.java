package com.example.demo.dto;

import com.example.demo.domain.TransactionLog;
import lombok.Builder;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Getter
@Builder
public class TransactionResponseDto {

    private Long id;
    private String transactionId;
    private BigDecimal amount;
    private String category;
    private String status;
    private boolean isFraud;
    private LocalDateTime createdAt;

    /**
     * TransactionLog 엔티티와 isFraud 여부를 받아 DTO 변환
     *
     * @param log     TransactionLog 엔티티
     * @param isFraud 해당 거래에 FraudAlert가 존재하는지 여부
     */
    public static TransactionResponseDto of(TransactionLog log, boolean isFraud) {
        return TransactionResponseDto.builder()
                .id(log.getId())
                .transactionId(log.getTransactionId())
                .amount(log.getAmount())
                .category(log.getMerchantCategory())
                .status(log.getStatus().name())
                .isFraud(isFraud)
                .createdAt(log.getTransactionDate())
                .build();
    }
}
