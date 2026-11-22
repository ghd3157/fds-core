package com.example.demo.service;

import com.example.demo.domain.FraudAlert;
import com.example.demo.domain.FraudAlert.DetectionSource;
import com.example.demo.domain.FraudAlert.ReviewStatus;
import com.example.demo.domain.TransactionLog;
import com.example.demo.domain.TransactionLog.ProcessStatus;
import com.example.demo.dto.AlertPayload;
import com.example.demo.dto.FraudResultDto;
import com.example.demo.repository.FraudAlertRepository;
import com.example.demo.repository.TransactionLogRepository;
import com.example.demo.websocket.AlertNotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

@Slf4j
@Service
@RequiredArgsConstructor
public class FraudProcessService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter DAILY_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter HOURLY_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd:HH");
    private static final Duration DAILY_TTL = Duration.ofDays(30);
    private static final Duration HOURLY_TTL = Duration.ofHours(48);

    private static final String DAILY_PREFIX = "fds:stats:daily:";
    private static final String HOURLY_PREFIX = "fds:stats:hourly:";

    private final TransactionLogRepository transactionLogRepository;
    private final FraudAlertRepository fraudAlertRepository;
    private final StringRedisTemplate redisTemplate;
    private final AlertNotificationService alertNotificationService;

    @Value("${fds.detection.threshold:80.0}")
    private double fraudThreshold;

    @Transactional
    public void process(FraudResultDto dto) {
        if (dto.getTransactionId() == null || dto.getRiskScore() == null) {
            throw new IllegalArgumentException("FraudResultDto에 transactionId 또는 riskScore가 누락되었습니다.");
        }

        TransactionLog transactionLog = transactionLogRepository
                .findByTransactionId(dto.getTransactionId())
                .orElseThrow(() -> {
                    log.warn("[FraudProcess] TransactionLog not found | transactionId={}", dto.getTransactionId());
                    return new IllegalArgumentException("TransactionLog not found: " + dto.getTransactionId());
                });

        // 1차 멱등성 가드: 이미 COMPLETE 처리된 거래는 중복 반영 차단
        if (transactionLog.getStatus() == ProcessStatus.COMPLETE) {
            log.info("[FraudProcess] Duplicate result skipped (already COMPLETE) | transactionId={}",
                    dto.getTransactionId());
            return;
        }

        transactionLog.complete();

        LocalDateTime nowKst = LocalDateTime.now(KST);
        boolean isFraud = dto.getRiskScore() >= fraudThreshold;

        AlertPayload alertPayload = null;
        if (isFraud) {
            if (!fraudAlertRepository.existsByTransactionLog(transactionLog)) {
                FraudAlert alert = FraudAlert.builder()
                        .transactionLog(transactionLog)
                        .riskScore(dto.getRiskScore())
                        .ruleScore(dto.getRuleScore())
                        .mlScore(dto.getMlScore())
                        .detectionSource(resolveDetectionSource(dto))
                        .detectionReason(resolveReason(dto))
                        .txCount1m(dto.getTxCount1m() != null ? dto.getTxCount1m() : 1)
                        .reviewStatus(ReviewStatus.UNCONFIRMED)
                        .createdAt(nowKst)
                        .build();

                FraudAlert saved = fraudAlertRepository.save(alert);
                alertPayload = AlertPayload.from(saved, transactionLog);
                log.info("[FraudProcess] FraudAlert saved | alertId={} | transactionId={} | riskScore={} | source={}",
                        saved.getId(), dto.getTransactionId(), dto.getRiskScore(), saved.getDetectionSource());
            }
        }

        // DB 커밋 확정 후 Redis 카운터 증가 및 WebSocket 브로드캐스트 실행
        final AlertPayload payloadToSend = alertPayload;
        runAfterCommit(() -> {
            incrementStatsCounters(nowKst, isFraud);
            if (payloadToSend != null) {
                alertNotificationService.sendAlert(payloadToSend);
            }
        });
    }

    private void incrementStatsCounters(LocalDateTime nowKst, boolean isFraud) {
        String suffix = isFraud ? ":fraud" : ":normal";
        String dailyKey = DAILY_PREFIX + nowKst.format(DAILY_FMT) + suffix;
        String hourlyKey = HOURLY_PREFIX + nowKst.format(HOURLY_FMT) + suffix;

        try {
            redisTemplate.opsForValue().increment(dailyKey);
            redisTemplate.expire(dailyKey, DAILY_TTL);

            redisTemplate.opsForValue().increment(hourlyKey);
            redisTemplate.expire(hourlyKey, HOURLY_TTL);
        } catch (Exception e) {
            log.error("[FraudProcess] Redis counter update failed | dailyKey={} | error={}",
                    dailyKey, e.getMessage());
        }
    }

    private DetectionSource resolveDetectionSource(FraudResultDto dto) {
        if (dto.getDetectionSource() != null) {
            try {
                return DetectionSource.valueOf(dto.getDetectionSource().toUpperCase());
            } catch (IllegalArgumentException ignored) {
                // NONE 등 FraudAlert 저장용 enum 외 값이 들어온 경우 스코어 기반으로 보정
            }
        }
        boolean ruleHit = dto.getRuleScore() != null && dto.getRuleScore() >= fraudThreshold;
        boolean mlHit = dto.getMlScore() != null && dto.getMlScore() >= fraudThreshold;
        if (ruleHit && mlHit) return DetectionSource.HYBRID;
        if (ruleHit) return DetectionSource.RULE;
        return DetectionSource.ML;
    }

    private String resolveReason(FraudResultDto dto) {
        String reason = dto.getDetectionReason();
        if (reason == null || reason.isBlank()) {
            return "위험 임계치 초과 (" + dto.getRiskScore() + "점)";
        }
        return reason.length() > 500 ? reason.substring(0, 500) : reason;
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
