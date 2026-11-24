package com.example.demo.service;

import com.example.demo.domain.FraudAlert;
import com.example.demo.domain.FraudAlert.DetectionSource;
import com.example.demo.domain.FraudAlert.ReviewStatus;
import com.example.demo.domain.TransactionLog;
import com.example.demo.dto.AlertReviewRequestDto;
import com.example.demo.dto.CopilotReportResponseDto;
import com.example.demo.dto.FraudAlertResponseDto;
import com.example.demo.exception.BusinessException;
import com.example.demo.repository.FraudAlertRepository;
import com.example.demo.repository.TransactionLogRepository;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlertService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final FraudAlertRepository fraudAlertRepository;
    private final TransactionLogRepository transactionLogRepository;
    private final AiServerClient aiServerClient;

    @Transactional(readOnly = true)
    public Page<FraudAlertResponseDto> getAlerts(
            ReviewStatus reviewStatus,
            DetectionSource detectionSource,
            Pageable pageable
    ) {
        Specification<FraudAlert> spec = (root, query, cb) -> {
            if (query != null && !Long.class.equals(query.getResultType()) && !long.class.equals(query.getResultType())) {
                root.fetch("transactionLog", JoinType.INNER);
            }

            List<Predicate> predicates = new ArrayList<>();
            if (reviewStatus != null) {
                predicates.add(cb.equal(root.get("reviewStatus"), reviewStatus));
            }
            if (detectionSource != null) {
                predicates.add(cb.equal(root.get("detectionSource"), detectionSource));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };

        return fraudAlertRepository.findAll(spec, pageable)
                .map(FraudAlertResponseDto::from);
    }

    @Transactional(readOnly = true)
    public FraudAlertResponseDto getAlertDetail(Long alertId) {
        FraudAlert alert = fraudAlertRepository.findWithTransactionLogById(alertId)
                .orElseThrow(() -> BusinessException.notFound(
                        "ALERT_NOT_FOUND",
                        "이상 탐지 알람을 찾을 수 없습니다: " + alertId
                ));
        return FraudAlertResponseDto.from(alert);
    }

    @Transactional
    public FraudAlertResponseDto reviewAlert(Long alertId, AlertReviewRequestDto request, String reviewer) {
        if (request.getReviewStatus() == ReviewStatus.UNCONFIRMED) {
            throw BusinessException.badRequest(
                    "INVALID_REVIEW_STATUS",
                    "reviewStatus는 CONFIRMED_FRAUD 또는 FALSE_POSITIVE여야 합니다."
            );
        }

        FraudAlert alert = fraudAlertRepository.findWithTransactionLogById(alertId)
                .orElseThrow(() -> BusinessException.notFound(
                        "ALERT_NOT_FOUND",
                        "이상 탐지 알람을 찾을 수 없습니다: " + alertId
                ));

        alert.review(request.getReviewStatus(), request.getReviewNote(), reviewer, LocalDateTime.now(KST));
        log.info("[Alert] Reviewed | alertId={} | status={} | reviewer={}",
                alertId, request.getReviewStatus(), reviewer);

        return FraudAlertResponseDto.from(alert);
    }

    /** AI 관제 사건 요약 & 대응 리포트 생성 (동일 사용자 최근 5건 이력 컨텍스트 포함) */
    @Transactional(readOnly = true)
    public CopilotReportResponseDto generateAiReport(Long alertId) {
        FraudAlert alert = fraudAlertRepository.findWithTransactionLogById(alertId)
                .orElseThrow(() -> BusinessException.notFound(
                        "ALERT_NOT_FOUND",
                        "이상 탐지 알람을 찾을 수 없습니다: " + alertId
                ));

        FraudAlertResponseDto dto = FraudAlertResponseDto.from(alert);
        TransactionLog tx = alert.getTransactionLog();

        List<TransactionLog> recentLogs =
                transactionLogRepository.findTop5ByUserIdOrderByTransactionDateDesc(tx.getUserId());
        List<Long> recentIds = recentLogs.stream().map(TransactionLog::getId).toList();
        Set<Long> fraudTxIds = recentIds.isEmpty()
                ? Set.of()
                : fraudAlertRepository.findByTransactionLogIdIn(recentIds).stream()
                        .map(a -> a.getTransactionLog().getId())
                        .collect(Collectors.toSet());

        List<Map<String, Object>> recentContext = recentLogs.stream().map(logItem -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("transactionId", logItem.getTransactionId());
            m.put("amount", logItem.getAmount());
            m.put("merchantCategory", logItem.getMerchantCategory());
            m.put("transactionDate", logItem.getTransactionDate().toString());
            m.put("isFraud", fraudTxIds.contains(logItem.getId()));
            return m;
        }).toList();

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("alertId", dto.getAlertId());
        payload.put("transactionId", dto.getTransactionId());
        payload.put("userId", dto.getUserId());
        payload.put("amount", dto.getAmount());
        payload.put("merchantCategory", dto.getMerchantCategory());
        payload.put("transactionDate", dto.getTransactionDate().toString());
        payload.put("riskScore", dto.getRiskScore());
        payload.put("ruleScore", dto.getRuleScore());
        payload.put("mlScore", dto.getMlScore());
        payload.put("anomalyScore", dto.getAnomalyScore());
        payload.put("detectionSource", dto.getDetectionSource());
        payload.put("detectionReason", dto.getDetectionReason());
        payload.put("txCount1m", dto.getTxCount1m());
        payload.put("shapContributions", dto.getShapContributions());
        payload.put("recentTransactions", recentContext);

        return aiServerClient.generateCopilotReport(payload);
    }
}
