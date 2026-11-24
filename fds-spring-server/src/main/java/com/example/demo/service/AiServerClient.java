package com.example.demo.service;

import com.example.demo.dto.CopilotReportResponseDto;
import com.example.demo.exception.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Python FastAPI AI/MLOps 서버 호출용 HTTP 클라이언트
 */
@Slf4j
@Service
public class AiServerClient {

    private final RestClient restClient;

    public AiServerClient(@Value("${fds.ai-server.base-url:http://localhost:8000}") String baseUrl) {
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .build();
    }

    public Map<String, Object> getModelStatus() {
        try {
            return restClient.get()
                    .uri("/api/v1/model/status")
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {});
        } catch (Exception e) {
            log.error("[AI Client] Failed to fetch model status | error={}", e.getMessage());
            throw new BusinessException(HttpStatus.BAD_GATEWAY, "AI_SERVER_UNAVAILABLE",
                    "AI 서버와 통신할 수 없습니다. Python AI 서버 실행 상태를 확인하세요.");
        }
    }

    public Map<String, Object> triggerRetrain(Map<String, Object> payload) {
        try {
            return restClient.post()
                    .uri("/api/v1/model/retrain")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {});
        } catch (Exception e) {
            log.error("[AI Client] Retrain request failed | error={}", e.getMessage());
            throw new BusinessException(HttpStatus.BAD_GATEWAY, "AI_RETRAIN_FAILED",
                    "AI 모델 재학습 요청 중 오류가 발생했습니다: " + e.getMessage());
        }
    }

    public CopilotReportResponseDto generateCopilotReport(Map<String, Object> payload) {
        try {
            return restClient.post()
                    .uri("/api/v1/copilot/report")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(CopilotReportResponseDto.class);
        } catch (Exception e) {
            log.error("[AI Client] Copilot report request failed | error={}", e.getMessage());
            throw new BusinessException(HttpStatus.BAD_GATEWAY, "AI_COPILOT_FAILED",
                    "AI 관제 리포트 생성 중 오류가 발생했습니다. Python AI 서버를 확인하세요.");
        }
    }
}
