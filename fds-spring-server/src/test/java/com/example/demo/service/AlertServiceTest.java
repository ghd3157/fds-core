package com.example.demo.service;

import com.example.demo.domain.FraudAlert;
import com.example.demo.domain.FraudAlert.DetectionSource;
import com.example.demo.domain.FraudAlert.ReviewStatus;
import com.example.demo.domain.TransactionLog;
import com.example.demo.domain.TransactionLog.ProcessStatus;
import com.example.demo.dto.AlertReviewRequestDto;
import com.example.demo.dto.FraudAlertResponseDto;
import com.example.demo.exception.BusinessException;
import com.example.demo.repository.FraudAlertRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AlertServiceTest {

    @Mock
    private FraudAlertRepository fraudAlertRepository;

    @InjectMocks
    private AlertService alertService;

    @Test
    @DisplayName("관리자가 알람을 사기 확정(CONFIRMED_FRAUD)으로 처리하면 상태·메모·처리자·처리시각이 기록된다")
    void reviewAlert_confirmedFraud_updatesFields() {
        TransactionLog tx = TransactionLog.builder()
                .id(1L)
                .transactionId("tx-alert-001")
                .userId("user-1001")
                .amount(BigDecimal.valueOf(2000000))
                .merchantCategory("shopping_net")
                .transactionDate(LocalDateTime.of(2026, 11, 22, 3, 0))
                .status(ProcessStatus.COMPLETE)
                .build();

        FraudAlert alert = FraudAlert.builder()
                .id(100L)
                .transactionLog(tx)
                .riskScore(92.0)
                .ruleScore(90.0)
                .mlScore(92.0)
                .detectionSource(DetectionSource.HYBRID)
                .detectionReason("초고액 결제")
                .txCount1m(2)
                .reviewStatus(ReviewStatus.UNCONFIRMED)
                .createdAt(LocalDateTime.of(2026, 11, 22, 3, 0, 1))
                .build();

        when(fraudAlertRepository.findWithTransactionLogById(100L)).thenReturn(Optional.of(alert));

        FraudAlertResponseDto res = alertService.reviewAlert(
                100L,
                new AlertReviewRequestDto(ReviewStatus.CONFIRMED_FRAUD, "  고객 확인 완료 - 도용 확정 "),
                "admin"
        );

        assertThat(res.getReviewStatus()).isEqualTo("CONFIRMED_FRAUD");
        assertThat(res.getReviewNote()).isEqualTo("고객 확인 완료 - 도용 확정");
        assertThat(res.getReviewedBy()).isEqualTo("admin");
        assertThat(res.getReviewedAt()).isNotNull();
    }

    @Test
    @DisplayName("UNCONFIRMED 상태로 리뷰 요청 시 400 BAD_REQUEST 예외를 던진다")
    void reviewAlert_unconfirmedStatus_throwsBadRequest() {
        AlertReviewRequestDto req = new AlertReviewRequestDto(ReviewStatus.UNCONFIRMED, "잘못된 요청");

        assertThatThrownBy(() -> alertService.reviewAlert(100L, req, "admin"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("CONFIRMED_FRAUD");
    }
}
