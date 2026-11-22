package com.example.demo.service;

import com.example.demo.dto.PaymentLogRequestDto;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class KafkaProducerService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    @Value("${fds.topics.payment-log:payment-log-topic}")
    private String paymentLogTopic;

    @Value("${fds.topics.dlq:fds-dlq-topic}")
    private String dlqTopic;

    /**
     * 결제 로그를 Kafka payment-log-topic으로 비동기 발행.
     * 파티션 키를 userId로 지정하여 동일 사용자의 결제 순서 및 Redis 결제빈도 정확성을 보장한다.
     */
    public void sendPaymentLog(PaymentLogRequestDto dto) {
        String payload;
        try {
            payload = objectMapper.writeValueAsString(dto);
        } catch (JsonProcessingException e) {
            log.error("[Kafka] Serialization failed | transactionId={}", dto.getTransactionId(), e);
            return;
        }

        CompletableFuture<SendResult<String, String>> future =
                kafkaTemplate.send(paymentLogTopic, dto.getUserId(), payload);

        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("[Kafka] Delivery FAILED | topic={} | userId={} | transactionId={} | reason={}",
                        paymentLogTopic, dto.getUserId(), dto.getTransactionId(), ex.getMessage(), ex);
            } else {
                log.info("[Kafka] Delivery confirmed | topic={} | partition={} | offset={} | userId={} | transactionId={}",
                        paymentLogTopic,
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset(),
                        dto.getUserId(),
                        dto.getTransactionId());
            }
        });
    }

    /** 역직렬화/처리 실패 메시지를 fds-dlq-topic으로 격리 */
    public void sendToDlq(String sourceTopic, String key, String rawPayload, Exception error) {
        Map<String, Object> dlqBody = new LinkedHashMap<>();
        dlqBody.put("sourceTopic", sourceTopic);
        dlqBody.put("failedAt", OffsetDateTime.now(KST).toString());
        dlqBody.put("errorType", error.getClass().getSimpleName());
        dlqBody.put("errorMessage", error.getMessage());
        dlqBody.put("rawPayload", rawPayload);

        try {
            String serialized = objectMapper.writeValueAsString(dlqBody);
            kafkaTemplate.send(dlqTopic, key != null ? key : "unknown", serialized);
            log.warn("[Kafka][DLQ] Routed failed message | sourceTopic={} | errorType={}",
                    sourceTopic, error.getClass().getSimpleName());
        } catch (JsonProcessingException e) {
            log.error("[Kafka][DLQ] Failed to serialize DLQ payload", e);
        }
    }
}
