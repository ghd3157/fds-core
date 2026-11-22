package com.example.demo.repository;

import com.example.demo.domain.TransactionLog;
import com.example.demo.domain.TransactionLog.ProcessStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;

public interface TransactionLogRepository
        extends JpaRepository<TransactionLog, Long>, JpaSpecificationExecutor<TransactionLog> {

    boolean existsByTransactionId(String transactionId);

    Optional<TransactionLog> findByTransactionId(String transactionId);

    long countByStatus(ProcessStatus status);

    Page<TransactionLog> findAllByOrderByTransactionDateDesc(Pageable pageable);
}
