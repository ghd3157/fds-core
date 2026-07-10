package com.example.demo.service;

import com.example.demo.dto.DashboardStatsResponseDto;
import com.example.demo.dto.FraudHistoryResponseDto;
import com.example.demo.repository.FraudAlertRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

@Slf4j
@Service
@RequiredArgsConstructor
public class DashboardService {

    private static final String REDIS_KEY_PREFIX = "fds:stats:";

    private final StringRedisTemplate redisTemplate;
    private final FraudAlertRepository fraudAlertRepository;

    /** Redis에서 오늘 날짜 기준 정상/이상 건수 조회 후 통계 반환 */
    public DashboardStatsResponseDto getStats() {
        String today = LocalDate.now().toString();

        long normalCount = getLongValue(REDIS_KEY_PREFIX + today + ":normal");
        long fraudCount  = getLongValue(REDIS_KEY_PREFIX + today + ":fraud");
        long totalCount  = normalCount + fraudCount;
        double fraudRatio = totalCount == 0 ? 0.0 : (double) fraudCount / totalCount * 100;

        log.info("[Dashboard] Stats queried | date={} | normal={} | fraud={}", today, normalCount, fraudCount);
        return new DashboardStatsResponseDto(normalCount, fraudCount, totalCount, fraudRatio);
    }

    /** DB에서 FraudAlert 페이징 조회 (Pageable로 정렬 방식 위임) */
    @Transactional(readOnly = true)
    public Page<FraudHistoryResponseDto> getHistory(Pageable pageable) {
        return fraudAlertRepository.findAll(pageable)
                .map(FraudHistoryResponseDto::from);
    }

    // --- private helper ---

    private long getLongValue(String key) {
        String value = redisTemplate.opsForValue().get(key);
        if (value == null) return 0L;
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            log.warn("[Dashboard] Invalid Redis value | key={} | value={}", key, value);
            return 0L;
        }
    }
}
