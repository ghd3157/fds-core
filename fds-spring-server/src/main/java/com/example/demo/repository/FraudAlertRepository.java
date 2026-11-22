package com.example.demo.repository;

import com.example.demo.domain.FraudAlert;
import com.example.demo.domain.FraudAlert.ReviewStatus;
import com.example.demo.domain.TransactionLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FraudAlertRepository
        extends JpaRepository<FraudAlert, Long>, JpaSpecificationExecutor<FraudAlert> {

    boolean existsByTransactionLog(TransactionLog transactionLog);

    Optional<FraudAlert> findByTransactionLog_TransactionId(String transactionId);

    long countByReviewStatus(ReviewStatus reviewStatus);

    /** 사기 건수를 가맹점 카테고리별로 집계 (건수 내림차순) */
    @Query("SELECT t.merchantCategory, COUNT(f) FROM FraudAlert f JOIN f.transactionLog t " +
           "GROUP BY t.merchantCategory ORDER BY COUNT(f) DESC")
    List<Object[]> countByMerchantCategory();

    /** 페이지 내 TransactionLog ID 목록에 매핑되는 FraudAlert 일괄 조회 (N+1 방지) */
    @Query("SELECT f FROM FraudAlert f JOIN FETCH f.transactionLog WHERE f.transactionLog.id IN :ids")
    List<FraudAlert> findByTransactionLogIdIn(@Param("ids") List<Long> ids);

    /** 알람 단건 상세 조회 시 TransactionLog 즉시 페치 */
    @Query("SELECT f FROM FraudAlert f JOIN FETCH f.transactionLog WHERE f.id = :id")
    Optional<FraudAlert> findWithTransactionLogById(@Param("id") Long id);
}
