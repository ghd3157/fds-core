package com.example.demo.service;

import com.example.demo.dto.TransactionResponseDto;
import com.example.demo.repository.FraudAlertRepository;
import com.example.demo.repository.TransactionLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class TransactionService {

    private final TransactionLogRepository transactionLogRepository;
    private final FraudAlertRepository fraudAlertRepository;

    /**
     * TransactionLog 목록을 transactionDate 내림차순으로 페이징 조회하고,
     * 각 거래에 대해 FraudAlert 존재 여부(isFraud)를 포함하여 반환한다.
     *
     * @param page 조회할 페이지 번호 (0부터 시작)
     * @param size 페이지당 항목 수
     * @return 페이징된 TransactionResponseDto
     */
    @Transactional(readOnly = true)
    public Page<TransactionResponseDto> getTransactions(int page, int size) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "transactionDate"));

        return transactionLogRepository.findAllByOrderByTransactionDateDesc(pageable)
                .map(log -> {
                    boolean isFraud = fraudAlertRepository.existsByTransactionLog(log);
                    return TransactionResponseDto.of(log, isFraud);
                });
    }
}
