package com.example.demo.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Date;
import java.util.UUID;

@Component
public class JwtProvider {

    public static final String TOKEN_TYPE_ACCESS = "ACCESS";
    public static final String TOKEN_TYPE_REFRESH = "REFRESH";

    private final SecretKey secretKey;
    private final long accessTokenExpMs;
    private final long refreshTokenExpMs;

    public JwtProvider(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.access-token-expiration-ms}") long accessTokenExpMs,
            @Value("${jwt.refresh-token-expiration-ms}") long refreshTokenExpMs
    ) {
        this.secretKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(secret));
        this.accessTokenExpMs = accessTokenExpMs;
        this.refreshTokenExpMs = refreshTokenExpMs;
    }

    /** Access Token 발급 (jti + type=ACCESS + role 포함) */
    public String generateAccessToken(String username, String role) {
        return buildToken(username, role, TOKEN_TYPE_ACCESS, accessTokenExpMs);
    }

    /** Refresh Token 발급 (jti + type=REFRESH) */
    public String generateRefreshToken(String username) {
        return buildToken(username, null, TOKEN_TYPE_REFRESH, refreshTokenExpMs);
    }

    public String getUsername(String token) {
        return parseClaims(token).getSubject();
    }

    public String getRole(String token) {
        return parseClaims(token).get("role", String.class);
    }

    public String getJti(String token) {
        return parseClaims(token).getId();
    }

    public String getTokenType(String token) {
        return parseClaims(token).get("type", String.class);
    }

    public long getRemainingExpirationMs(String token) {
        Date exp = parseClaims(token).getExpiration();
        return Math.max(0L, exp.getTime() - System.currentTimeMillis());
    }

    public long getRefreshTokenExpMs() {
        return refreshTokenExpMs;
    }

    public boolean validate(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    public boolean validateAccessToken(String token) {
        return validate(token) && TOKEN_TYPE_ACCESS.equals(getTokenType(token));
    }

    public boolean validateRefreshToken(String token) {
        return validate(token) && TOKEN_TYPE_REFRESH.equals(getTokenType(token));
    }

    private String buildToken(String username, String role, String type, long expMs) {
        Date now = new Date();
        JwtBuilder builder = Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(username)
                .claim("type", type)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expMs))
                .signWith(secretKey);

        if (role != null) {
            builder.claim("role", role);
        }
        return builder.compact();
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
