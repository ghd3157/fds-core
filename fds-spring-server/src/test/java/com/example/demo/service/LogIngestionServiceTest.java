package com.example.demo.service;

import com.example.demo.domain.TransactionLog;
import com.example.demo.dto.LogIngestionResponseDto;
import com.example.demo.dto.PaymentLogRequestDto;
import com.example.demo.exception.BusinessException;
import com.example.demo.repository.TransactionLogRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LogIngestionServiceTest {

    @Mock private TransactionLogRepository transactionLogRepository;
    @Mock private KafkaProducerService kafkaProducerService;

    @InjectMocks
    private LogIngestionService logIngestionService;

    @Test
    @DisplayName("신규 결제 로그를 KST 기준 PENDING으로 저장하고 Kafka로 발행한다")
    void ingest_validRequest_savesPendingAndSendsKafka() {
        PaymentLogRequestDto dto = PaymentLogRequestDto.builder()
                .transactionId("tx-new-001")
                .userId("user-2001")
                .amount(BigDecimal.valueOf(50000))
                .merchantCategory("  Shopping_Net ")
                .latitude(37.5665)
                .longitude(126.9780)
                .transactionDate(OffsetDateTime.parse("2026-11-22T00:00:00Z")) // KST 09:00
                .build();

        when(transactionLogRepository.existsByTransactionId("tx-new-001")).thenReturn(false);

        LogIngestionResponseDto response = logIngestionService.ingest(dto);

        assertThat(response.getTransactionId()).isEqualTo("tx-new-001");
        assertThat(response.getStatus()).isEqualTo("PENDING");

        ArgumentCaptor<TransactionLog> captor = ArgumentCaptor.forClass(TransactionLog.class);
        verify(transactionLogRepository).save(captor.capture());
        TransactionLog saved = captor.getValue();
        assertThat(saved.getMerchantCategory()).isEqualTo("shopping_net");
        assertThat(saved.getTransactionDate()).isEqualTo(LocalDateTime.of(2026, 11, 22, 9, 0, 0));
        assertThat(saved.getStatus()).isEqualTo(TransactionLog.ProcessStatus.PENDING);

        verify(kafkaProducerService).sendPaymentLog(dto);
    }

    @Test
    @DisplayName("중복된 transactionId 요청 시 409 CONFLICT 예외를 발생시키고 Kafka에 발행하지 않는다")
    void ingest_duplicateTransactionId_throwsConflict() {
        PaymentLogRequestDto dto = PaymentLogRequestDto.builder()
                .transactionId("tx-dup-999")
                .userId("user-2001")
                .amount(BigDecimal.valueOf(50000))
                .merchantCategory("food")
                .transactionDate(OffsetDateTime.parse("2026-11-22T12:00:00+09:00"))
                .build();

        when(transactionLogRepository.existsByTransactionId("tx-dup-999")).thenReturn(true);

        assertThatThrownBy(() -> logIngestionService.ingest(dto))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(be.getCode()).isEqualTo("DUPLICATE_TRANSACTION");
                });

        verify(transactionLogRepository, never()).save(any());
        verify(kafkaProducerService, never()).sendPaymentLog(any());
    }
}
