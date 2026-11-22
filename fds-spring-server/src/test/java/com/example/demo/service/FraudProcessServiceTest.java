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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FraudProcessServiceTest {

    @Mock private TransactionLogRepository transactionLogRepository;
    @Mock private FraudAlertRepository fraudAlertRepository;
    @Mock private StringRedisTemplate redisTemplate;
    @Mock private ValueOperations<String, String> valueOperations;
    @Mock private AlertNotificationService alertNotificationService;

    @InjectMocks
    private FraudProcessService fraudProcessService;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(fraudProcessService, "fraudThreshold", 80.0);
    }

    @Test
    @DisplayName("위험 스코어가 임계치(80.0) 이상이면 FraudAlert 저장, Redis 일별/시간별 fraud 증가, 통일 AlertPayload를 전송한다")
    void process_highRisk_savesAlertAndBroadcastsUnifiedPayload() {
        TransactionLog tx = TransactionLog.builder()
                .id(10L)
                .transactionId("tx-burst-001")
                .userId("user-1042")
                .amount(BigDecimal.valueOf(1850000))
                .merchantCategory("shopping_net")
                .transactionDate(LocalDateTime.of(2026, 11, 22, 2, 15, 30))
                .status(ProcessStatus.PENDING)
                .build();

        FraudResultDto dto = FraudResultDto.builder()
                .transactionId("tx-burst-001")
                .riskScore(95.0)
                .ruleScore(95.0)
                .mlScore(87.42)
                .detectionSource("HYBRID")
                .detectionReason("[RULE] 단시간 다중 결제 (1분 내 5회)")
                .txCount1m(5)
                .txCount10m(6)
                .txCount1h(8)
                .build();

        when(transactionLogRepository.findByTransactionId("tx-burst-001")).thenReturn(Optional.of(tx));
        when(fraudAlertRepository.existsByTransactionLog(tx)).thenReturn(false);
        when(fraudAlertRepository.save(any(FraudAlert.class))).thenAnswer(inv -> {
            FraudAlert a = inv.getArgument(0);
            ReflectionTestUtils.setField(a, "id", 42L);
            return a;
        });
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);

        fraudProcessService.process(dto);

        assertThat(tx.getStatus()).isEqualTo(ProcessStatus.COMPLETE);

        ArgumentCaptor<FraudAlert> alertCaptor = ArgumentCaptor.forClass(FraudAlert.class);
        verify(fraudAlertRepository).save(alertCaptor.capture());
        FraudAlert saved = alertCaptor.getValue();
        assertThat(saved.getRiskScore()).isEqualTo(95.0);
        assertThat(saved.getRuleScore()).isEqualTo(95.0);
        assertThat(saved.getMlScore()).isEqualTo(87.42);
        assertThat(saved.getDetectionSource()).isEqualTo(DetectionSource.HYBRID);
        assertThat(saved.getTxCount1m()).isEqualTo(5);
        assertThat(saved.getReviewStatus()).isEqualTo(ReviewStatus.UNCONFIRMED);

        // Redis daily + hourly fraud 증가 및 TTL 설정 검증
        verify(valueOperations).increment(argThat(k -> k.startsWith("fds:stats:daily:") && k.endsWith(":fraud")));
        verify(valueOperations).increment(argThat(k -> k.startsWith("fds:stats:hourly:") && k.endsWith(":fraud")));
        verify(redisTemplate, times(2)).expire(anyString(), any(Duration.class));

        // WebSocket 통일 AlertPayload 검증
        ArgumentCaptor<AlertPayload> payloadCaptor = ArgumentCaptor.forClass(AlertPayload.class);
        verify(alertNotificationService).sendAlert(payloadCaptor.capture());
        AlertPayload payload = payloadCaptor.getValue();
        assertThat(payload.getAlertId()).isEqualTo(42L);
        assertThat(payload.getTransactionId()).isEqualTo("tx-burst-001");
        assertThat(payload.getUserId()).isEqualTo("user-1042");
        assertThat(payload.getAmount()).isEqualByComparingTo("1850000");
        assertThat(payload.getMerchantCategory()).isEqualTo("shopping_net");
        assertThat(payload.getDetectionSource()).isEqualTo("HYBRID");
        assertThat(payload.getTxCount1m()).isEqualTo(5);
        assertThat(payload.getReviewStatus()).isEqualTo("UNCONFIRMED");
    }

    @Test
    @DisplayName("위험 스코어가 임계치 미만이면 FraudAlert/WebSocket 없이 COMPLETE 및 normal 카운터만 증가한다")
    void process_normalRisk_updatesStatusAndNormalCounterOnly() {
        TransactionLog tx = TransactionLog.builder()
                .id(11L)
                .transactionId("tx-normal-001")
                .userId("user-1001")
                .amount(BigDecimal.valueOf(35000))
                .merchantCategory("grocery_pos")
                .transactionDate(LocalDateTime.of(2026, 11, 22, 14, 0))
                .status(ProcessStatus.PENDING)
                .build();

        FraudResultDto dto = FraudResultDto.builder()
                .transactionId("tx-normal-001")
                .riskScore(12.5)
                .mlScore(12.5)
                .detectionSource("NONE")
                .detectionReason("정상 거래")
                .txCount1m(1)
                .build();

        when(transactionLogRepository.findByTransactionId("tx-normal-001")).thenReturn(Optional.of(tx));
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);

        fraudProcessService.process(dto);

        assertThat(tx.getStatus()).isEqualTo(ProcessStatus.COMPLETE);
        verify(fraudAlertRepository, never()).save(any());
        verify(alertNotificationService, never()).sendAlert(any());
        verify(valueOperations).increment(argThat(k -> k.startsWith("fds:stats:daily:") && k.endsWith(":normal")));
        verify(valueOperations).increment(argThat(k -> k.startsWith("fds:stats:hourly:") && k.endsWith(":normal")));
    }

    @Test
    @DisplayName("이미 COMPLETE 상태인 거래의 중복 결과가 수신되면 멱등성 가드로 모든 후처리를 건너뛴다")
    void process_alreadyComplete_skipsAllSideEffects() {
        TransactionLog tx = TransactionLog.builder()
                .id(12L)
                .transactionId("tx-dup-001")
                .status(ProcessStatus.COMPLETE)
                .build();

        FraudResultDto dto = FraudResultDto.builder()
                .transactionId("tx-dup-001")
                .riskScore(95.0)
                .detectionSource("RULE")
                .detectionReason("중복 메시지")
                .build();

        when(transactionLogRepository.findByTransactionId("tx-dup-001")).thenReturn(Optional.of(tx));

        fraudProcessService.process(dto);

        verify(fraudAlertRepository, never()).save(any());
        verify(redisTemplate, never()).opsForValue();
        verify(alertNotificationService, never()).sendAlert(any());
    }
}
