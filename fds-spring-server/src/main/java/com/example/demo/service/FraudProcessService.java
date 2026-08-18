package com.example.demo.service;

import com.example.demo.domain.FraudAlert;
import com.example.demo.domain.TransactionLog;
import com.example.demo.dto.AlertPayload;
import com.example.demo.dto.FraudResultDto;
import com.example.demo.repository.FraudAlertRepository;
import com.example.demo.repository.TransactionLogRepository;
import com.example.demo.websocket.AlertNotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class FraudProcessService {

    private static final double FRAUD_THRESHOLD = 80.0;
    private static final String REDIS_KEY_PREFIX = "fds:stats:";

    private final TransactionLogRepository transactionLogRepository;
    private final FraudAlertRepository fraudAlertRepository;
    private final StringRedisTemplate redisTemplate;
    private final AlertNotificationService alertNotificationService;

    @Transactional
    public void process(FraudResultDto dto) {
        // 1. TransactionLog 상태를 COMPLETE로 업데이트
        TransactionLog transactionLog = transactionLogRepository
                .findByTransactionId(dto.getTransactionId())
                .orElseThrow(() -> {
                    log.warn("[FraudProcess] TransactionLog not found | transactionId={}", dto.getTransactionId());
                    return new IllegalArgumentException("TransactionLog not found: " + dto.getTransactionId());
                });

        transactionLog.complete();
        log.info("[FraudProcess] Status updated to COMPLETE | transactionId={}", dto.getTransactionId());

        // 2. 임계치 이상이면 FraudAlert 저장
        String today = LocalDate.now().toString(); // e.g. "2026-07-10"
        if (dto.getRiskScore() >= FRAUD_THRESHOLD) {
            FraudAlert alert = FraudAlert.builder()
                    .transactionLog(transactionLog)
                    .riskScore(dto.getRiskScore())
                    .detectionReason(dto.getFraudReason())
                    .confirmed(false)
                    .createdAt(LocalDateTime.now())
                    .build();

            fraudAlertRepository.save(alert);
            log.info("[FraudProcess] FraudAlert saved | transactionId={} | riskScore={}", dto.getTransactionId(), dto.getRiskScore());

            // Redis: 이상 탐지 건수 증가
            redisTemplate.opsForValue().increment(REDIS_KEY_PREFIX + today + ":fraud");

            // WebSocket: 실시간 알림 브로드캐스트
            log.info("🚨 [FraudProcess] WebSocket 알림 전송 시작 | transactionId={} | riskScore={}", dto.getTransactionId(), dto.getRiskScore());
            alertNotificationService.sendAlert(new AlertPayload(
                    dto.getTransactionId(),
                    dto.getRiskScore(),
                    dto.getFraudReason(),
                    LocalDateTime.now()
            ));
            log.info("✅ [FraudProcess] WebSocket 알림 전송 완료 | transactionId={}", dto.getTransactionId());
        } else {
            // Redis: 정상 건수 증가
            redisTemplate.opsForValue().increment(REDIS_KEY_PREFIX + today + ":normal");
        }
    }
}
