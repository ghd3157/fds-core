package com.example.demo.service;

import com.example.demo.dto.PaymentLogRequestDto;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class KafkaProducerService {

    private static final String TOPIC = "payment-log-topic";

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    public void sendPaymentLog(PaymentLogRequestDto dto) {
        String payload;
        try {
            payload = objectMapper.writeValueAsString(dto);
        } catch (JsonProcessingException e) {
            log.error("[Kafka] Serialization failed | transactionId={}", dto.getTransactionId(), e);
            return;
        }

        CompletableFuture<SendResult<String, String>> future =
                kafkaTemplate.send(TOPIC, dto.getTransactionId(), payload);

        future.whenComplete((result, ex) -> {
            if (ex != null) {
                // 브로커 전달 실패 시 명확하게 기록
                log.error("[Kafka] Delivery FAILED | topic={} | transactionId={} | reason={}",
                        TOPIC, dto.getTransactionId(), ex.getMessage(), ex);
            } else {
                // 브로커가 실제로 수신 확인한 시점에 로그 기록
                log.info("[Kafka] Delivery confirmed | topic={} | partition={} | offset={} | transactionId={}",
                        TOPIC,
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset(),
                        dto.getTransactionId());
            }
        });

        // 버퍼에 남아 있는 메시지를 브로커로 즉시 flush
        kafkaTemplate.flush();
    }
}
