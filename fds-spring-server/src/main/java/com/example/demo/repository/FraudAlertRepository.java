package com.example.demo.repository;

import com.example.demo.domain.FraudAlert;
import com.example.demo.domain.TransactionLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Set;

public interface FraudAlertRepository extends JpaRepository<FraudAlert, Long> {
    Page<FraudAlert> findAll(Pageable pageable);

    /** 특정 TransactionLog에 연결된 FraudAlert 존재 여부 (isFraud 판단용) */
    boolean existsByTransactionLog(TransactionLog transactionLog);

    /** 사기 건수를 가맹점 카테고리별로 집계 */
    @Query("SELECT t.merchantCategory, COUNT(f) FROM FraudAlert f JOIN f.transactionLog t GROUP BY t.merchantCategory")
    List<Object[]> countByMerchantCategory();

    /** 페이지 내 ID 목록 중 FraudAlert가 존재하는 TransactionLog ID Set 조회 (N+1 방지) */
    @Query("SELECT f.transactionLog.id FROM FraudAlert f WHERE f.transactionLog.id IN :ids")
    Set<Long> findFraudTransactionLogIds(@Param("ids") List<Long> ids);
}
