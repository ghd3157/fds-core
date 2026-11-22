package com.example.demo.service;

import com.example.demo.domain.Admin;
import com.example.demo.dto.LoginRequest;
import com.example.demo.dto.RefreshTokenRequest;
import com.example.demo.dto.TokenResponse;
import com.example.demo.dto.UserProfileResponse;
import com.example.demo.exception.BusinessException;
import com.example.demo.repository.AdminRepository;
import com.example.demo.security.JwtProvider;
import com.example.demo.security.TokenStoreService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final JwtProvider jwtProvider;
    private final TokenStoreService tokenStoreService;
    private final AdminRepository adminRepository;

    public TokenResponse login(LoginRequest request) {
        Authentication auth = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword())
        );

        String username = auth.getName();
        String role = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .findFirst()
                .orElse(Admin.Role.ROLE_VIEWER.name());

        String accessToken = jwtProvider.generateAccessToken(username, role);
        String refreshToken = jwtProvider.generateRefreshToken(username);

        tokenStoreService.saveRefreshToken(username, refreshToken, jwtProvider.getRefreshTokenExpMs());
        log.info("[Auth] Login success | username={} | role={}", username, role);

        return new TokenResponse(accessToken, refreshToken, username, role);
    }

    /** Refresh Token Rotation: 검증 후 새 Access/Refresh 발급 및 Redis 갱신 */
    public TokenResponse refresh(RefreshTokenRequest request) {
        String refreshToken = request.getRefreshToken();
        if (!jwtProvider.validateRefreshToken(refreshToken)) {
            throw BusinessException.unauthorized("INVALID_REFRESH_TOKEN", "유효하지 않거나 만료된 Refresh Token입니다.");
        }

        String username = jwtProvider.getUsername(refreshToken);
        if (!tokenStoreService.matchesRefreshToken(username, refreshToken)) {
            throw BusinessException.unauthorized("REFRESH_TOKEN_MISMATCH", "이미 로그아웃되었거나 폐기된 Refresh Token입니다.");
        }

        Admin admin = adminRepository.findByUsername(username)
                .orElseThrow(() -> BusinessException.unauthorized("USER_NOT_FOUND", "사용자를 찾을 수 없습니다."));

        String role = admin.getRole().name();
        String newAccessToken = jwtProvider.generateAccessToken(username, role);
        String newRefreshToken = jwtProvider.generateRefreshToken(username);

        tokenStoreService.saveRefreshToken(username, newRefreshToken, jwtProvider.getRefreshTokenExpMs());
        log.info("[Auth] Token refreshed | username={}", username);

        return new TokenResponse(newAccessToken, newRefreshToken, username, role);
    }

    /** 로그아웃: Refresh Token 삭제 + 현재 Access Token jti 블랙리스트 등록 */
    public void logout(String username, String accessToken) {
        tokenStoreService.deleteRefreshToken(username);

        if (accessToken != null && jwtProvider.validateAccessToken(accessToken)) {
            String jti = jwtProvider.getJti(accessToken);
            long remainingMs = jwtProvider.getRemainingExpirationMs(accessToken);
            tokenStoreService.blacklistAccessToken(jti, remainingMs);
        }
        log.info("[Auth] Logout complete | username={}", username);
    }

    public UserProfileResponse getCurrentUser(Authentication authentication) {
        String username = authentication.getName();
        String role = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .findFirst()
                .orElse(Admin.Role.ROLE_VIEWER.name());
        return new UserProfileResponse(username, role);
    }
}
