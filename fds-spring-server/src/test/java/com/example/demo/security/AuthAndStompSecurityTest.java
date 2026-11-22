package com.example.demo.security;

import com.example.demo.domain.Admin;
import com.example.demo.dto.RefreshTokenRequest;
import com.example.demo.dto.TokenResponse;
import com.example.demo.repository.AdminRepository;
import com.example.demo.service.AuthService;
import com.example.demo.websocket.StompChannelInterceptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.AuthenticationManager;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthAndStompSecurityTest {

    private static final String TEST_SECRET = "dGhpcyBpcyBhIHNlY3VyZSBzZWNyZXQga2V5IGZvciBmZHMgc3lzdGVt";

    private JwtProvider jwtProvider;
    private AuthService authService;
    private StompChannelInterceptor stompChannelInterceptor;

    @Mock private AuthenticationManager authenticationManager;
    @Mock private TokenStoreService tokenStoreService;
    @Mock private AdminRepository adminRepository;
    @Mock private MessageChannel messageChannel;

    @BeforeEach
    void setUp() {
        jwtProvider = new JwtProvider(TEST_SECRET, 1_800_000L, 604_800_000L);
        authService = new AuthService(authenticationManager, jwtProvider, tokenStoreService, adminRepository);
        stompChannelInterceptor = new StompChannelInterceptor(jwtProvider, tokenStoreService);
    }

    @Test
    @DisplayName("Access Token과 Refresh Token은 type 클레임으로 엄격히 구분되며 고유 jti를 가진다")
    void jwtProvider_separatesAccessAndRefreshTokens() {
        String access = jwtProvider.generateAccessToken("admin", "ROLE_ADMIN");
        String refresh = jwtProvider.generateRefreshToken("admin");

        assertThat(jwtProvider.validateAccessToken(access)).isTrue();
        assertThat(jwtProvider.validateRefreshToken(access)).isFalse();
        assertThat(jwtProvider.validateRefreshToken(refresh)).isTrue();
        assertThat(jwtProvider.validateAccessToken(refresh)).isFalse();
        assertThat(jwtProvider.getJti(access)).isNotEqualTo(jwtProvider.getJti(refresh));
    }

    @Test
    @DisplayName("유효한 Refresh Token으로 재발급 시 새 Access/Refresh Token이 로테이션된다")
    void authService_refresh_rotatesTokens() {
        String oldRefresh = jwtProvider.generateRefreshToken("admin");
        Admin admin = Admin.builder().username("admin").role(Admin.Role.ROLE_ADMIN).build();

        when(tokenStoreService.matchesRefreshToken("admin", oldRefresh)).thenReturn(true);
        when(adminRepository.findByUsername("admin")).thenReturn(Optional.of(admin));

        TokenResponse res = authService.refresh(new RefreshTokenRequest(oldRefresh));

        assertThat(res.getUsername()).isEqualTo("admin");
        assertThat(res.getRole()).isEqualTo("ROLE_ADMIN");
        assertThat(jwtProvider.validateAccessToken(res.getAccessToken())).isTrue();
        assertThat(jwtProvider.validateRefreshToken(res.getRefreshToken())).isTrue();
        verify(tokenStoreService).saveRefreshToken(eq("admin"), eq(res.getRefreshToken()), anyLong());
    }

    @Test
    @DisplayName("로그아웃 시 Redis Refresh 삭제 및 Access Token jti 블랙리스트 등록이 수행된다")
    void authService_logout_revokesRefreshAndBlacklistsAccess() {
        String access = jwtProvider.generateAccessToken("admin", "ROLE_ADMIN");
        String jti = jwtProvider.getJti(access);

        authService.logout("admin", access);

        verify(tokenStoreService).deleteRefreshToken("admin");
        verify(tokenStoreService).blacklistAccessToken(eq(jti), anyLong());
    }

    @Test
    @DisplayName("STOMP CONNECT 시 유효한 Access Token이면 사용자 Principal이 설정된다")
    void stompInterceptor_validToken_authenticatesUser() {
        String access = jwtProvider.generateAccessToken("admin", "ROLE_ADMIN");
        when(tokenStoreService.isBlacklisted(jwtProvider.getJti(access))).thenReturn(false);

        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setNativeHeader("Authorization", "Bearer " + access);
        accessor.setLeaveMutable(true);
        Message<byte[]> msg = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        stompChannelInterceptor.preSend(msg, messageChannel);

        assertThat(accessor.getUser()).isNotNull();
        assertThat(accessor.getUser().getName()).isEqualTo("admin");
    }

    @Test
    @DisplayName("STOMP CONNECT 시 토큰이 없거나 블랙리스트 토큰이면 연결이 거부된다")
    void stompInterceptor_missingOrBlacklistedToken_rejectsConnect() {
        StompHeaderAccessor missingAccessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        Message<byte[]> missingMsg = MessageBuilder.createMessage(new byte[0], missingAccessor.getMessageHeaders());

        assertThatThrownBy(() -> stompChannelInterceptor.preSend(missingMsg, messageChannel))
                .isInstanceOf(IllegalArgumentException.class);

        String access = jwtProvider.generateAccessToken("admin", "ROLE_ADMIN");
        when(tokenStoreService.isBlacklisted(jwtProvider.getJti(access))).thenReturn(true);

        StompHeaderAccessor blacklistedAccessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        blacklistedAccessor.setNativeHeader("Authorization", "Bearer " + access);
        Message<byte[]> blacklistedMsg = MessageBuilder.createMessage(new byte[0], blacklistedAccessor.getMessageHeaders());

        assertThatThrownBy(() -> stompChannelInterceptor.preSend(blacklistedMsg, messageChannel))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
