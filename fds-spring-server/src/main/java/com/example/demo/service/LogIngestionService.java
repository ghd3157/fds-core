package com.example.demo.service;

import com.example.demo.domain.TransactionLog;
import com.example.demo.dto.PaymentLogRequestDto;
import com.example.demo.repository.TransactionLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneId;

@Slf4j
@Service
@RequiredArgsConstructor
public class LogIngestionService {

    private final TransactionLogRepository transactionLogRepository;
    private final KafkaProducerService kafkaProducerService;

    @Transactional
    public void ingest(PaymentLogRequestDto dto) {
        // OffsetDateTime → KST LocalDateTime 변환 후 DB 저장
        TransactionLog log = TransactionLog.builder()
                .transactionId(dto.getTransactionId())
                .userId(dto.getUserId())
                .amount(dto.getAmount())
                .merchantCategory(dto.getMerchantCategory())
                .latitude(dto.getLatitude())
                .longitude(dto.getLongitude())
                .transactionDate(dto.getTransactionDate()
                        .atZoneSameInstant(ZoneId.of("Asia/Seoul"))
                        .toLocalDateTime())
                .status(TransactionLog.ProcessStatus.PENDING)
                .build();

        transactionLogRepository.save(log);
        LogIngestionService.log.info("[Ingest] Saved to DB | transactionId={}", dto.getTransactionId());

        kafkaProducerService.sendPaymentLog(dto);
    }
}
