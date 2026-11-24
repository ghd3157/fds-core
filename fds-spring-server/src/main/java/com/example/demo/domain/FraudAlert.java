package com.example.demo.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
    name = "fraud_alert",
    indexes = {
        @Index(name = "idx_alert_created_at", columnList = "created_at"),
        @Index(name = "idx_alert_review_status", columnList = "review_status, created_at"),
        @Index(name = "idx_alert_risk_score", columnList = "risk_score")
    }
)
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FraudAlert {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 이상 거래로 판정된 결제 로그 (1:1 UNIQUE 제약으로 멱등성 보장) */
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "transaction_log_id", nullable = false, unique = true)
    private TransactionLog transactionLog;

    /** 최종 3중 하이브리드 위험 스코어 (0.0 ~ 100.0) */
    @Column(name = "risk_score", nullable = false)
    private Double riskScore;

    /** Layer 1: Rule Engine 점수 (미적중 시 null) */
    @Column(name = "rule_score")
    private Double ruleScore;

    /** Layer 2: LightGBM 지도학습 점수 (Fallback 시 null) */
    @Column(name = "ml_score")
    private Double mlScore;

    /** Layer 3: Isolation Forest 비지도 이상 점수 (Fallback 시 null) */
    @Column(name = "anomaly_score")
    private Double anomalyScore;

    /** 탐지 출처: RULE | ML | ANOMALY | HYBRID */
    @Enumerated(EnumType.STRING)
    @Column(name = "detection_source", nullable = false, length = 20)
    private DetectionSource detectionSource;

    /** 탐지 사유 (Rule + TreeSHAP + Anomaly 기반 한글 요약) */
    @Column(name = "detection_reason", nullable = false, length = 500)
    private String detectionReason;

    /** 피처별 TreeSHAP 기여도 JSON 배열 (XAI 차트 시각화용) */
    @Column(name = "shap_json", columnDefinition = "TEXT")
    private String shapJson;

    /** 탐지 당시 최근 1분간 해당 사용자 결제 횟수 */
    @Builder.Default
    @Column(name = "tx_count_1m", nullable = false)
    private Integer txCount1m = 1;

    /** 관리자 확인/오탐 처리 상태 */
    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "review_status", nullable = false, length = 20)
    private ReviewStatus reviewStatus = ReviewStatus.UNCONFIRMED;

    /** 관리자 판정 메모 */
    @Column(name = "review_note", length = 500)
    private String reviewNote;

    /** 처리 관리자 username */
    @Column(name = "reviewed_by", length = 50)
    private String reviewedBy;

    /** 처리 시각 (KST) */
    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;

    /** 알람 생성 시각 (KST) */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public enum DetectionSource {
        RULE, ML, ANOMALY, HYBRID
    }

    public enum ReviewStatus {
        UNCONFIRMED, CONFIRMED_FRAUD, FALSE_POSITIVE
    }

    /** 관리자 사기 확정 / 오탐 처리 도메인 메서드 */
    public void review(ReviewStatus status, String note, String reviewer, LocalDateTime reviewedAt) {
        if (status == null || status == ReviewStatus.UNCONFIRMED) {
            throw new IllegalArgumentException("reviewStatus는 CONFIRMED_FRAUD 또는 FALSE_POSITIVE여야 합니다.");
        }
        this.reviewStatus = status;
        this.reviewNote = (note != null && !note.isBlank()) ? note.trim() : null;
        this.reviewedBy = reviewer;
        this.reviewedAt = reviewedAt;
    }
}
