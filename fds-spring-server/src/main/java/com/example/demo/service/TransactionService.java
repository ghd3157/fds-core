package com.example.demo.service;

import com.example.demo.domain.FraudAlert;
import com.example.demo.domain.TransactionLog;
import com.example.demo.domain.TransactionLog.ProcessStatus;
import com.example.demo.dto.TransactionDetailResponseDto;
import com.example.demo.dto.TransactionResponseDto;
import com.example.demo.exception.BusinessException;
import com.example.demo.repository.FraudAlertRepository;
import com.example.demo.repository.TransactionLogRepository;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TransactionService {

    private final TransactionLogRepository transactionLogRepository;
    private final FraudAlertRepository fraudAlertRepository;

    @Transactional(readOnly = true)
    public Page<TransactionResponseDto> getTransactions(
            int page,
            int size,
            ProcessStatus status,
            Boolean isFraud,
            String category,
            String keyword
    ) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(1, size), 100);
        PageRequest pageable = PageRequest.of(safePage, safeSize, Sort.by(Sort.Direction.DESC, "transactionDate"));

        Specification<TransactionLog> spec = buildSpec(status, isFraud, category, keyword);
        Page<TransactionLog> logPage = transactionLogRepository.findAll(spec, pageable);

        List<Long> ids = logPage.getContent().stream()
                .map(TransactionLog::getId)
                .toList();

        Map<Long, FraudAlert> alertMap = ids.isEmpty()
                ? Map.of()
                : fraudAlertRepository.findByTransactionLogIdIn(ids).stream()
                        .collect(Collectors.toMap(
                                alert -> alert.getTransactionLog().getId(),
                                Function.identity(),
                                (existing, duplicate) -> existing
                        ));

        return logPage.map(log -> TransactionResponseDto.of(log, alertMap.get(log.getId())));
    }

    @Transactional(readOnly = true)
    public TransactionDetailResponseDto getTransactionDetail(String transactionId) {
        TransactionLog tx = transactionLogRepository.findByTransactionId(transactionId)
                .orElseThrow(() -> BusinessException.notFound(
                        "TRANSACTION_NOT_FOUND",
                        "거래 내역을 찾을 수 없습니다: " + transactionId
                ));

        FraudAlert alert = fraudAlertRepository.findByTransactionLog_TransactionId(transactionId).orElse(null);
        return TransactionDetailResponseDto.of(tx, alert);
    }

    private Specification<TransactionLog> buildSpec(
            ProcessStatus status,
            Boolean isFraud,
            String category,
            String keyword
    ) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }

            if (category != null && !category.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("merchantCategory")), category.trim().toLowerCase()));
            }

            if (keyword != null && !keyword.isBlank()) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("transactionId")), pattern),
                        cb.like(cb.lower(root.get("userId")), pattern)
                ));
            }

            if (isFraud != null && query != null) {
                Subquery<Long> subquery = query.subquery(Long.class);
                Root<FraudAlert> alertRoot = subquery.from(FraudAlert.class);
                subquery.select(cb.literal(1L))
                        .where(cb.equal(alertRoot.get("transactionLog"), root));
                predicates.add(isFraud ? cb.exists(subquery) : cb.not(cb.exists(subquery)));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
