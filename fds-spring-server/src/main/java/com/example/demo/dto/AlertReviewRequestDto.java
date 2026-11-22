package com.example.demo.dto;

import com.example.demo.domain.FraudAlert.ReviewStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class AlertReviewRequestDto {

    @NotNull(message = "reviewStatus는 필수입니다.")
    private ReviewStatus reviewStatus;

    @Size(max = 500, message = "reviewNote는 500자 이하여야 합니다.")
    private String reviewNote;
}
