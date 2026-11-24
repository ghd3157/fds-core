package com.example.demo.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CopilotReportResponseDto {
    private Long alertId;
    private String riskLevel;
    private String summary;
    private List<String> recommendedActions;
    private String customerSmsDraft;
    private String generator;
    private String generatedAt;
}
