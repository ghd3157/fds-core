package com.example.demo.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "fraud_alert")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FraudAlert {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** AI가 위험하다고 판단한 결제 로그 (N:1) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "transaction_log_id", nullable = false)
    private TransactionLog transactionLog;

    /** AI 위험 스코어 (0.0 ~ 100.0) */
    @Column(nullable = false)
    private Double riskScore;

    /** 탐지 사유 (예: "비정상적인 위치", "단시간 다중 결제") */
    @Column(nullable = false, length = 255)
    private String detectionReason;

    /** 관리자 확인 여부 */
    @Column(nullable = false)
    private boolean confirmed;

    /** 알람 생성 시각 */
    @Column(nullable = false)
    private LocalDateTime createdAt;
}
