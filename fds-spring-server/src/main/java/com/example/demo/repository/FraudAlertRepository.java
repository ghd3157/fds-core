package com.example.demo.repository;

import com.example.demo.domain.FraudAlert;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FraudAlertRepository extends JpaRepository<FraudAlert, Long> {
    Page<FraudAlert> findAll(Pageable pageable);
}
