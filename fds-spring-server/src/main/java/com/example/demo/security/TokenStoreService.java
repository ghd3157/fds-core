package com.example.demo.security;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * Redis 기반 Refresh Token 저장 및 Access Token 로그아웃 블랙리스트 관리
 * - Refresh: fds:auth:refresh:{username} (TTL: 7일)
 * - Blacklist: fds:auth:blacklist:{jti} (TTL: Access 잔여 만료시간)
 */
@Service
@RequiredArgsConstructor
public class TokenStoreService {

    private static final String REFRESH_PREFIX = "fds:auth:refresh:";
    private static final String BLACKLIST_PREFIX = "fds:auth:blacklist:";

    private final StringRedisTemplate redisTemplate;

    public void saveRefreshToken(String username, String refreshToken, long ttlMs) {
        redisTemplate.opsForValue().set(
                REFRESH_PREFIX + username,
                refreshToken,
                Duration.ofMillis(ttlMs)
        );
    }

    public boolean matchesRefreshToken(String username, String refreshToken) {
        String stored = redisTemplate.opsForValue().get(REFRESH_PREFIX + username);
        return stored != null && stored.equals(refreshToken);
    }

    public void deleteRefreshToken(String username) {
        redisTemplate.delete(REFRESH_PREFIX + username);
    }

    public void blacklistAccessToken(String jti, long remainingMs) {
        if (jti == null || remainingMs <= 0) {
            return;
        }
        redisTemplate.opsForValue().set(
                BLACKLIST_PREFIX + jti,
                "logout",
                Duration.ofMillis(remainingMs)
        );
    }

    public boolean isBlacklisted(String jti) {
        if (jti == null) {
            return false;
        }
        return Boolean.TRUE.equals(redisTemplate.hasKey(BLACKLIST_PREFIX + jti));
    }
}
