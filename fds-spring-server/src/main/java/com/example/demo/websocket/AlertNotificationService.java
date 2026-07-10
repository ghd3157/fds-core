package com.example.demo.websocket;

import com.example.demo.dto.AlertPayload;
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

    public void sendAlert(AlertPayload payload) {
        messagingTemplate.convertAndSend(ALERT_TOPIC, payload);
        log.info("[WebSocket] Alert broadcast | transactionId={} | riskScore={}",
                payload.getTransactionId(), payload.getRiskScore());
    }
}
