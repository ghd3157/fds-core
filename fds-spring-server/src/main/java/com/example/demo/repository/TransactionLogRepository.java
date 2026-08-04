package com.example.demo.repository;

import com.example.demo.domain.TransactionLog;
import com.example.demo.domain.TransactionLog.ProcessStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TransactionLogRepository extends JpaRepository<TransactionLog, Long> {
    boolean existsByTransactionId(String transactionId);
    Optional<TransactionLog> findByTransactionId(String transactionId);

    /** status별 전체 건수 조회 */
    long countByStatus(ProcessStatus status);

    /** transactionDate 내림차순 페이징 조회 */
    Page<TransactionLog> findAllByOrderByTransactionDateDesc(Pageable pageable);
}
