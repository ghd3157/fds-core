package com.example.demo.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(
    name = "transaction_log",
    indexes = {
        @Index(name = "idx_tx_date", columnList = "transaction_date"),
        @Index(name = "idx_tx_status", columnList = "status"),
        @Index(name = "idx_tx_user_date", columnList = "user_id, transaction_date"),
        @Index(name = "idx_tx_category", columnList = "merchant_category")
    }
)
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TransactionLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 실제 결제 고유 해시값 */
    @Column(name = "transaction_id", nullable = false, unique = true, length = 100)
    private String transactionId;

    /** 사용자 식별자 */
    @Column(name = "user_id", nullable = false, length = 100)
    private String userId;

    /** 거래 금액 (KRW) */
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    /** 가맹점 카테고리 (예: shopping_net, grocery_pos) */
    @Column(name = "merchant_category", nullable = false, length = 50)
    private String merchantCategory;

    /** 가맹점/결제자 위치 - 위도 */
    @Column
    private Double latitude;

    /** 가맹점/결제자 위치 - 경도 */
    @Column
    private Double longitude;

    /** 거래 발생 시각 (KST) */
    @Column(name = "transaction_date", nullable = false)
    private LocalDateTime transactionDate;

    /** 처리 상태: PENDING | COMPLETE | FAILED */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 15)
    private ProcessStatus status;

    public enum ProcessStatus {
        PENDING, COMPLETE, FAILED
    }

    /** AI 분석 완료 처리 */
    public void complete() {
        this.status = ProcessStatus.COMPLETE;
    }

    /** 분석 파이프라인 실패/DLQ 격리 처리 */
    public void fail() {
        this.status = ProcessStatus.FAILED;
    }
}
