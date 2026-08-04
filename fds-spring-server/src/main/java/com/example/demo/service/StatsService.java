package com.example.demo.service;

import com.example.demo.domain.TransactionLog.ProcessStatus;
import com.example.demo.dto.CategoryStatDto;
import com.example.demo.dto.SummaryStatsResponseDto;
import com.example.demo.repository.FraudAlertRepository;
import com.example.demo.repository.TransactionLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class StatsService {

    private static final String REDIS_KEY_PREFIX = "fds:stats:";

    private final StringRedisTemplate redisTemplate;
    private final TransactionLogRepository transactionLogRepository;
    private final FraudAlertRepository fraudAlertRepository;

    /**
     * 요약 통계 조회:
     * - todayFraudCount: 오늘 날짜 기준 Redis 키 fds:stats:{yyyy-MM-dd}:fraud 값
     * - pendingCount: TransactionLog에서 status = PENDING 인 전체 건수
     * - completeCount: TransactionLog에서 status = COMPLETE 인 전체 건수
     */
    @Transactional(readOnly = true)
    public SummaryStatsResponseDto getSummary() {
        String today = LocalDate.now().toString();
        long todayFraudCount = getLongFromRedis(REDIS_KEY_PREFIX + today + ":fraud");

        long pendingCount  = transactionLogRepository.countByStatus(ProcessStatus.PENDING);
        long completeCount = transactionLogRepository.countByStatus(ProcessStatus.COMPLETE);

        log.info("[Stats] Summary queried | date={} | todayFraud={} | pending={} | complete={}",
                today, todayFraudCount, pendingCount, completeCount);

        return new SummaryStatsResponseDto(todayFraudCount, pendingCount, completeCount);
    }

    /**
     * 카테고리별 사기 건수 조회:
     * FraudAlert 테이블 기준, 연결된 TransactionLog.merchantCategory 로 GROUP BY 후 건수 집계
     */
    @Transactional(readOnly = true)
    public List<CategoryStatDto> getFraudByCategory() {
        return fraudAlertRepository.countByMerchantCategory()
                .stream()
                .map(row -> new CategoryStatDto((String) row[0], ((Number) row[1]).longValue()))
                .collect(Collectors.toList());
    }

    // --- private helper ---

    private long getLongFromRedis(String key) {
        String value = redisTemplate.opsForValue().get(key);
        if (value == null) return 0L;
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            log.warn("[Stats] Invalid Redis value | key={} | value={}", key, value);
            return 0L;
        }
    }
}
