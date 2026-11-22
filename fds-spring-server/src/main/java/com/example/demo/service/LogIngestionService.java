package com.example.demo.service;

import com.example.demo.domain.TransactionLog;
import com.example.demo.dto.LogIngestionResponseDto;
import com.example.demo.dto.PaymentLogRequestDto;
import com.example.demo.exception.BusinessException;
import com.example.demo.repository.TransactionLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.ZoneId;

@Slf4j
@Service
@RequiredArgsConstructor
public class LogIngestionService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final TransactionLogRepository transactionLogRepository;
    private final KafkaProducerService kafkaProducerService;

    @Transactional
    public LogIngestionResponseDto ingest(PaymentLogRequestDto dto) {
        if (transactionLogRepository.existsByTransactionId(dto.getTransactionId())) {
            throw BusinessException.conflict(
                    "DUPLICATE_TRANSACTION",
                    "이미 접수된 transactionId입니다: " + dto.getTransactionId()
            );
        }

        TransactionLog entity = TransactionLog.builder()
                .transactionId(dto.getTransactionId())
                .userId(dto.getUserId())
                .amount(dto.getAmount())
                .merchantCategory(dto.getMerchantCategory().toLowerCase().trim())
                .latitude(dto.getLatitude())
                .longitude(dto.getLongitude())
                .transactionDate(dto.getTransactionDate()
                        .atZoneSameInstant(KST)
                        .toLocalDateTime())
                .status(TransactionLog.ProcessStatus.PENDING)
                .build();

        transactionLogRepository.save(entity);
        log.info("[Ingest] Saved PENDING log | transactionId={} | userId={}",
                dto.getTransactionId(), dto.getUserId());

        // DB 커밋 확정 후 Kafka 발행 (롤백 시 유령 메시지 방지)
        runAfterCommit(() -> kafkaProducerService.sendPaymentLog(dto));

        return new LogIngestionResponseDto(entity.getTransactionId(), entity.getStatus().name());
    }

    private void runAfterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }
}
