package com.example.demo.websocket;

import com.example.demo.security.JwtProvider;
import com.example.demo.security.TokenStoreService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * STOMP CONNECT 프레임의 Authorization: Bearer <token> 헤더를 검증하여
 * 미인증 클라이언트의 실시간 알림 구독을 차단한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StompChannelInterceptor implements ChannelInterceptor {

    private final JwtProvider jwtProvider;
    private final TokenStoreService tokenStoreService;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            String authHeader = accessor.getFirstNativeHeader("Authorization");
            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                log.warn("[WebSocket] CONNECT rejected: missing Bearer token");
                throw new IllegalArgumentException("WebSocket 인증 토큰이 필요합니다.");
            }

            String token = authHeader.substring(7);
            if (!jwtProvider.validateAccessToken(token)) {
                log.warn("[WebSocket] CONNECT rejected: invalid Access Token");
                throw new IllegalArgumentException("유효하지 않은 WebSocket 인증 토큰입니다.");
            }

            String jti = jwtProvider.getJti(token);
            if (tokenStoreService.isBlacklisted(jti)) {
                log.warn("[WebSocket] CONNECT rejected: blacklisted token");
                throw new IllegalArgumentException("만료되었거나 로그아웃된 토큰입니다.");
            }

            String username = jwtProvider.getUsername(token);
            String role = jwtProvider.getRole(token);

            UsernamePasswordAuthenticationToken user = new UsernamePasswordAuthenticationToken(
                    username,
                    null,
                    role != null ? List.of(new SimpleGrantedAuthority(role)) : List.of()
            );
            accessor.setUser(user);
            log.info("[WebSocket] STOMP CONNECT authenticated | user={} | role={}", username, role);
        }
        return message;
    }
}
