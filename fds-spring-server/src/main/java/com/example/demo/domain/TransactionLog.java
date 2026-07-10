package com.example.demo.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "transaction_log")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TransactionLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 실제 결제 고유 해시값 (Kaggle 원본 트랜잭션 ID) */
    @Column(nullable = false, unique = true, length = 100)
    private String transactionId;

    /** 사용자 식별자 */
    @Column(nullable = false, length = 100)
    private String userId;

    /** 거래 금액 */
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    /** 가맹점 카테고리 (예: FOOD, TRAVEL, SHOPPING) */
    @Column(nullable = false, length = 50)
    private String merchantCategory;

    /** 가맹점/결제자 위치 - 위도 */
    @Column
    private Double latitude;

    /** 가맹점/결제자 위치 - 경도 */
    @Column
    private Double longitude;

    /** 거래 발생 시각 */
    @Column(nullable = false)
    private LocalDateTime transactionDate;

    /** 처리 상태: PENDING | COMPLETE */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ProcessStatus status;

    public enum ProcessStatus {
        PENDING, COMPLETE
    }

    /** AI 분석 완료 처리 */
    public void complete() {
        this.status = ProcessStatus.COMPLETE;
    }
}
