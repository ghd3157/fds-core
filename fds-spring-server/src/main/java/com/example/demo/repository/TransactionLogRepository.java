package com.example.demo.repository;

import com.example.demo.domain.TransactionLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TransactionLogRepository extends JpaRepository<TransactionLog, Long> {
    boolean existsByTransactionId(String transactionId);
    Optional<TransactionLog> findByTransactionId(String transactionId);
}
