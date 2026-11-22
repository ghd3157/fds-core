package com.example.demo.service;

import com.example.demo.domain.FraudAlert.ReviewStatus;
import com.example.demo.domain.TransactionLog.ProcessStatus;
import com.example.demo.dto.CategoryStatDto;
import com.example.demo.dto.DashboardSummaryResponseDto;
import com.example.demo.dto.HourlyTrafficDto;
import com.example.demo.repository.FraudAlertRepository;
import com.example.demo.repository.TransactionLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class DashboardService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter DAILY_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter HOURLY_KEY_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd:HH");
    private static final DateTimeFormatter HOUR_ISO_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:00");
    private static final DateTimeFormatter HOUR_LABEL_FMT = DateTimeFormatter.ofPattern("HH시");

    private static final String DAILY_PREFIX = "fds:stats:daily:";
    private static final String HOURLY_PREFIX = "fds:stats:hourly:";

    private final StringRedisTemplate redisTemplate;
    private final TransactionLogRepository transactionLogRepository;
    private final FraudAlertRepository fraudAlertRepository;

    @Transactional(readOnly = true)
    public DashboardSummaryResponseDto getSummary() {
        String today = LocalDate.now(KST).format(DAILY_FMT);

        long todayFraud = getLongFromRedis(DAILY_PREFIX + today + ":fraud");
        long todayNormal = getLongFromRedis(DAILY_PREFIX + today + ":normal");
        long todayTotal = todayFraud + todayNormal;
        double fraudRatio = todayTotal == 0
                ? 0.0
                : Math.round(((double) todayFraud / todayTotal) * 10000.0) / 100.0;

        long unconfirmedAlerts = fraudAlertRepository.countByReviewStatus(ReviewStatus.UNCONFIRMED);
        long pendingCount = transactionLogRepository.countByStatus(ProcessStatus.PENDING);
        long completeCount = transactionLogRepository.countByStatus(ProcessStatus.COMPLETE);

        return DashboardSummaryResponseDto.builder()
                .todayFraudCount(todayFraud)
                .todayNormalCount(todayNormal)
                .todayTotalCount(todayTotal)
                .todayFraudRatio(fraudRatio)
                .unconfirmedAlertCount(unconfirmedAlerts)
                .pendingCount(pendingCount)
                .completeCount(completeCount)
                .build();
    }

    /** 최근 24시간(KST) 시간대별 정상/사기 트래픽 시계열 조회 (Redis MGET 일괄 조회) */
    public List<HourlyTrafficDto> getHourlyTraffic() {
        LocalDateTime nowHour = LocalDateTime.now(KST).withMinute(0).withSecond(0).withNano(0);
        List<LocalDateTime> hours = new ArrayList<>(24);
        List<String> keys = new ArrayList<>(48);

        for (int i = 23; i >= 0; i--) {
            LocalDateTime bucket = nowHour.minusHours(i);
            hours.add(bucket);
            String keyBase = HOURLY_PREFIX + bucket.format(HOURLY_KEY_FMT);
            keys.add(keyBase + ":normal");
            keys.add(keyBase + ":fraud");
        }

        List<String> values = null;
        try {
            values = redisTemplate.opsForValue().multiGet(keys);
        } catch (Exception e) {
            log.warn("[Dashboard] Redis hourly multiGet failed | error={}", e.getMessage());
        }

        List<HourlyTrafficDto> result = new ArrayList<>(24);
        for (int i = 0; i < hours.size(); i++) {
            LocalDateTime bucket = hours.get(i);
            long normal = (values != null && i * 2 < values.size()) ? parseLongSafe(values.get(i * 2)) : 0L;
            long fraud = (values != null && i * 2 + 1 < values.size()) ? parseLongSafe(values.get(i * 2 + 1)) : 0L;

            result.add(HourlyTrafficDto.builder()
                    .hour(bucket.format(HOUR_ISO_FMT))
                    .label(bucket.format(HOUR_LABEL_FMT))
                    .normalCount(normal)
                    .fraudCount(fraud)
                    .build());
        }
        return result;
    }

    /** MariaDB FraudAlert 기준 카테고리별 사기 탐지 건수 집계 */
    @Transactional(readOnly = true)
    public List<CategoryStatDto> getFraudByCategory() {
        return fraudAlertRepository.countByMerchantCategory()
                .stream()
                .map(row -> new CategoryStatDto((String) row[0], ((Number) row[1]).longValue()))
                .toList();
    }

    private long getLongFromRedis(String key) {
        try {
            return parseLongSafe(redisTemplate.opsForValue().get(key));
        } catch (Exception e) {
            log.warn("[Dashboard] Redis read failed | key={} | error={}", key, e.getMessage());
            return 0L;
        }
    }

    private long parseLongSafe(String value) {
        if (value == null) return 0L;
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            return 0L;
        }
    }
}
