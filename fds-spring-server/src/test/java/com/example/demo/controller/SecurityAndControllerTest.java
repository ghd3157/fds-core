package com.example.demo.controller;

import com.example.demo.domain.FraudAlert.ReviewStatus;
import com.example.demo.dto.AlertReviewRequestDto;
import com.example.demo.dto.FraudAlertResponseDto;
import com.example.demo.dto.LogIngestionResponseDto;
import com.example.demo.exception.GlobalExceptionHandler;
import com.example.demo.security.AdminDetailsService;
import com.example.demo.security.JwtProvider;
import com.example.demo.security.SecurityConfig;
import com.example.demo.security.TokenStoreService;
import com.example.demo.service.AlertService;
import com.example.demo.service.DashboardService;
import com.example.demo.service.LogIngestionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = {
        LogIngestionController.class,
        DashboardController.class,
        AlertController.class
})
@Import({SecurityConfig.class, JwtProvider.class, GlobalExceptionHandler.class})
@TestPropertySource(properties = {
        "jwt.secret=dGhpcyBpcyBhIHNlY3VyZSBzZWNyZXQga2V5IGZvciBmZHMgc3lzdGVt",
        "jwt.access-token-expiration-ms=1800000",
        "jwt.refresh-token-expiration-ms=604800000",
        "fds.security.ingest-api-key=test-ingest-key",
        "fds.security.cors-origins=http://localhost:5173"
})
class SecurityAndControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtProvider jwtProvider;
    @Autowired private ObjectMapper objectMapper;

    @MockitoBean private TokenStoreService tokenStoreService;
    @MockitoBean private AdminDetailsService adminDetailsService;
    @MockitoBean private LogIngestionService logIngestionService;
    @MockitoBean private DashboardService dashboardService;
    @MockitoBean private AlertService alertService;

    @Test
    @DisplayName("POST /api/v1/logs는 X-API-Key가 없으면 401 UNAUTHORIZED를 반환한다")
    void ingest_withoutApiKey_returns401() throws Exception {
        mockMvc.perform(post("/api/v1/logs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    @DisplayName("POST /api/v1/logs는 유효한 X-API-Key여도 음수 금액 등 검증 실패 시 400 INVALID_INPUT을 반환한다")
    void ingest_invalidBody_returns400() throws Exception {
        String invalidJson = """
                {
                  "transactionId": "tx-1",
                  "userId": "user-1",
                  "amount": -500,
                  "merchantCategory": "grocery_pos",
                  "transactionDate": "2026-11-22T12:00:00+09:00"
                }
                """;

        mockMvc.perform(post("/api/v1/logs")
                        .header("X-API-Key", "test-ingest-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidJson))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    @DisplayName("POST /api/v1/logs는 유효한 X-API-Key와 본문이면 202 Accepted를 반환한다")
    void ingest_validRequest_returns202() throws Exception {
        when(logIngestionService.ingest(any()))
                .thenReturn(new LogIngestionResponseDto("tx-ok-1", "PENDING"));

        String validJson = """
                {
                  "transactionId": "tx-ok-1",
                  "userId": "user-1",
                  "amount": 45000,
                  "merchantCategory": "grocery_pos",
                  "latitude": 37.5665,
                  "longitude": 126.9780,
                  "transactionDate": "2026-11-22T12:00:00+09:00"
                }
                """;

        mockMvc.perform(post("/api/v1/logs")
                        .header("X-API-Key", "test-ingest-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validJson))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.transactionId").value("tx-ok-1"))
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    @DisplayName("GET /api/v1/dashboard/summary는 JWT 없이 접근 시 401 UNAUTHORIZED를 반환한다")
    void dashboardSummary_withoutJwt_returns401() throws Exception {
        mockMvc.perform(get("/api/v1/dashboard/summary"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    @DisplayName("PATCH /api/v1/alerts/{id}/review는 ROLE_VIEWER 접근 시 403 FORBIDDEN을 반환한다")
    void reviewAlert_asViewer_returns403() throws Exception {
        String viewerToken = jwtProvider.generateAccessToken("viewer", "ROLE_VIEWER");
        when(tokenStoreService.isBlacklisted(any())).thenReturn(false);

        String body = objectMapper.writeValueAsString(
                new AlertReviewRequestDto(ReviewStatus.CONFIRMED_FRAUD, "메모")
        );

        mockMvc.perform(patch("/api/v1/alerts/1/review")
                        .header("Authorization", "Bearer " + viewerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    @DisplayName("PATCH /api/v1/alerts/{id}/review는 ROLE_ADMIN 접근 시 200 OK를 반환한다")
    void reviewAlert_asAdmin_returns200() throws Exception {
        String adminToken = jwtProvider.generateAccessToken("admin", "ROLE_ADMIN");
        when(tokenStoreService.isBlacklisted(any())).thenReturn(false);
        when(alertService.reviewAlert(eq(1L), any(), eq("admin")))
                .thenReturn(FraudAlertResponseDto.builder()
                        .alertId(1L)
                        .reviewStatus("CONFIRMED_FRAUD")
                        .reviewedBy("admin")
                        .build());

        String body = objectMapper.writeValueAsString(
                new AlertReviewRequestDto(ReviewStatus.CONFIRMED_FRAUD, "사기 확정")
        );

        mockMvc.perform(patch("/api/v1/alerts/1/review")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reviewStatus").value("CONFIRMED_FRAUD"))
                .andExpect(jsonPath("$.reviewedBy").value("admin"));
    }
}
