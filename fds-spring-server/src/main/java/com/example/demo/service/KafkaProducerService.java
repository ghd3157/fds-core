package com.example.demo.service;

import com.example.demo.dto.PaymentLogRequestDto;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class KafkaProducerService {

    private static final String TOPIC = "payment-log-topic";

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    public void sendPaymentLog(PaymentLogRequestDto dto) {
        try {
            String payload = objectMapper.writeValueAsString(dto);
            kafkaTemplate.send(TOPIC, dto.getTransactionId(), payload);
            log.info("[Kafka] Message sent | topic={} | transactionId={}", TOPIC, dto.getTransactionId());
        } catch (JsonProcessingException e) {
            log.error("[Kafka] Serialization failed | transactionId={}", dto.getTransactionId(), e);
        }
    }
}
