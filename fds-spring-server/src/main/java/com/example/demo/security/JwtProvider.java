package com.example.demo.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Date;

@Component
public class JwtProvider {

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

    /** Access Token 발급 */
    public String generateAccessToken(String username, String role) {
        return buildToken(username, role, accessTokenExpMs);
    }

    /** Refresh Token 발급 */
    public String generateRefreshToken(String username) {
        return buildToken(username, null, refreshTokenExpMs);
    }

    /** 토큰에서 username(subject) 추출 */
    public String getUsername(String token) {
        return parseClaims(token).getSubject();
    }

    /** 토큰에서 role claim 추출 */
    public String getRole(String token) {
        return parseClaims(token).get("role", String.class);
    }

    /** 토큰 유효성 검증 */
    public boolean validate(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    // --- private helpers ---

    private String buildToken(String username, String role, long expMs) {
        Date now = new Date();
        JwtBuilder builder = Jwts.builder()
                .subject(username)
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
