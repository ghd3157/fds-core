package com.example.demo.service;

import com.example.demo.domain.FraudAlert;
import com.example.demo.domain.FraudAlert.ReviewStatus;
import com.example.demo.domain.TransactionLog;
import com.example.demo.repository.FraudAlertRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Human-in-the-Loop(HITL) AI 모델 상태 조회 및 피드백 기반 재학습 오케스트레이션 서비스
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ModelManagementService {

    private static final ZoneOffset KST_OFFSET = ZoneOffset.ofHours(9);

    private final FraudAlertRepository fraudAlertRepository;
    private final AiServerClient aiServerClient;

    @Transactional(readOnly = true)
    public Map<String, Object> getModelStatus() {
        Map<String, Object> aiStatus = new LinkedHashMap<>(aiServerClient.getModelStatus());

        long confirmedCount = fraudAlertRepository.countByReviewStatus(ReviewStatus.CONFIRMED_FRAUD);
        long falsePositiveCount = fraudAlertRepository.countByReviewStatus(ReviewStatus.FALSE_POSITIVE);
        long unconfirmedCount = fraudAlertRepository.countByReviewStatus(ReviewStatus.UNCONFIRMED);

        Map<String, Object> feedbackSummary = new LinkedHashMap<>();
        feedbackSummary.put("confirmedFraudCount", confirmedCount);
        feedbackSummary.put("falsePositiveCount", falsePositiveCount);
        feedbackSummary.put("unconfirmedCount", unconfirmedCount);
        feedbackSummary.put("totalFeedbackCount", confirmedCount + falsePositiveCount);

        aiStatus.put("feedbackSummary", feedbackSummary);
        return aiStatus;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> triggerRetrain(boolean forcePromote, String requestedBy) {
        List<FraudAlert> reviewedAlerts = fraudAlertRepository.findReviewedWithTransactionLog();

        List<Map<String, Object>> feedbackSamples = reviewedAlerts.stream().map(alert -> {
            TransactionLog tx = alert.getTransactionLog();
            Map<String, Object> sample = new LinkedHashMap<>();
            sample.put("transactionId", tx.getTransactionId());
            sample.put("userId", tx.getUserId());
            sample.put("amount", tx.getAmount());
            sample.put("merchantCategory", tx.getMerchantCategory());
            sample.put("transactionDate", tx.getTransactionDate().atOffset(KST_OFFSET).toString());
            sample.put("latitude", tx.getLatitude());
            sample.put("longitude", tx.getLongitude());
            sample.put("label", alert.getReviewStatus() == ReviewStatus.CONFIRMED_FRAUD ? 1 : 0);
            return sample;
        }).toList();

        log.info("[MLOps] Triggering HITL retrain | requestedBy={} | feedbackCount={} | forcePromote={}",
                requestedBy, feedbackSamples.size(), forcePromote);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("feedbackSamples", feedbackSamples);
        payload.put("forcePromote", forcePromote);

        return aiServerClient.triggerRetrain(payload);
    }
}
