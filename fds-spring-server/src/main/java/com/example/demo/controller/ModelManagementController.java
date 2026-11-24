package com.example.demo.controller;

import com.example.demo.service.ModelManagementService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/models")
@RequiredArgsConstructor
public class ModelManagementController {

    private final ModelManagementService modelManagementService;

    /** AI 모델 성능·PSI 드리프트·관리자 피드백 현황·버전 이력 조회 */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getModelStatus() {
        return ResponseEntity.ok(modelManagementService.getModelStatus());
    }

    /** 관리자 피드백(사기확정/오탐) 반영 재학습 및 Champion-Challenger 무중단 핫스왑 (ROLE_ADMIN 전용) */
    @PostMapping("/retrain")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> triggerRetrain(
            @RequestParam(defaultValue = "false") boolean forcePromote,
            Authentication authentication
    ) {
        return ResponseEntity.ok(modelManagementService.triggerRetrain(forcePromote, authentication.getName()));
    }
}
