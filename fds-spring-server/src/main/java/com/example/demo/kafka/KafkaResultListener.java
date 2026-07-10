package com.example.demo.kafka;

import com.example.demo.dto.FraudResultDto;
import com.example.demo.service.FraudProcessService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class KafkaResultListener {

    private static final String TOPIC = "fraud-result-topic";

    private final ObjectMapper objectMapper;
    private final FraudProcessService fraudProcessService;

    @KafkaListener(topics = TOPIC, groupId = "${spring.kafka.consumer.group-id}")
    public void listen(String message) {
        try {
            FraudResultDto dto = objectMapper.readValue(message, FraudResultDto.class);
            log.info("[Kafka] Message received | topic={} | transactionId={}", TOPIC, dto.getTransactionId());
            fraudProcessService.process(dto);
        } catch (JsonProcessingException e) {
            log.error("[Kafka] Deserialization failed | message={}", message, e);
        }
    }
}
