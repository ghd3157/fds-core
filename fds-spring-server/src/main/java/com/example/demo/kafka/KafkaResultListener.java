package com.example.demo.kafka;

import com.example.demo.dto.FraudResultDto;
import com.example.demo.service.FraudProcessService;
import com.example.demo.service.KafkaProducerService;
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
    private final KafkaProducerService kafkaProducerService;

    @KafkaListener(topics = "${fds.topics.fraud-result:fraud-result-topic}", groupId = "${spring.kafka.consumer.group-id}")
    public void listen(String message) {
        String transactionId = null;
        try {
            FraudResultDto dto = objectMapper.readValue(message, FraudResultDto.class);
            transactionId = dto.getTransactionId();
            log.info("[Kafka] Result received | topic={} | transactionId={} | riskScore={}",
                    TOPIC, dto.getTransactionId(), dto.getRiskScore());
            fraudProcessService.process(dto);
        } catch (Exception e) {
            log.error("[Kafka] Result processing failed → routing to DLQ | transactionId={} | error={}",
                    transactionId, e.getMessage(), e);
            kafkaProducerService.sendToDlq(TOPIC, transactionId, message, e);
        }
    }
}
