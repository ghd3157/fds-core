package com.example.demo.service;

import com.example.demo.domain.FraudAlert;
import com.example.demo.domain.FraudAlert.DetectionSource;
import com.example.demo.domain.FraudAlert.ReviewStatus;
import com.example.demo.dto.AlertReviewRequestDto;
import com.example.demo.dto.FraudAlertResponseDto;
import com.example.demo.exception.BusinessException;
import com.example.demo.repository.FraudAlertRepository;
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
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlertService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final FraudAlertRepository fraudAlertRepository;

    @Transactional(readOnly = true)
    public Page<FraudAlertResponseDto> getAlerts(
            ReviewStatus reviewStatus,
            DetectionSource detectionSource,
            Pageable pageable
    ) {
        Specification<FraudAlert> spec = (root, query, cb) -> {
            // 페이징 본문 쿼리에서만 transactionLog를 fetch join하여 N+1 방지 (count 쿼리 제외)
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
}
