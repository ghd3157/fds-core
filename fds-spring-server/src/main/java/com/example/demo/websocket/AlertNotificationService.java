package com.example.demo.websocket;

import com.example.demo.dto.AlertPayload;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlertNotificationService {

    private static final String ALERT_TOPIC = "/topic/alerts";

    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    public void sendAlert(AlertPayload payload) {
        try {
            String payloadJson = objectMapper.writeValueAsString(payload);
            log.info("🚨 [WebSocket] 전송 직전 | destination={} | payload={}",
                    ALERT_TOPIC, payloadJson);
        } catch (JsonProcessingException e) {
            log.warn("⚠️ [WebSocket] payload 직렬화 실패 (전송은 계속 진행) | error={}", e.getMessage());
        }

        try {
            messagingTemplate.convertAndSend(ALERT_TOPIC, payload);
            log.info("✅ [WebSocket] 알림 전송 완료 | transactionId={} | riskScore={}",
                    payload.getTransactionId(), payload.getRiskScore());
        } catch (Exception e) {
            log.error("❌ [WebSocket] 알림 전송 실패 | transactionId={} | error={}",
                    payload.getTransactionId(), e.getMessage(), e);
        }
    }
}
