package com.example.demo.dto;

import jakarta.validation.constraints.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentLogRequestDto {

    @NotBlank(message = "transactionId는 필수입니다.")
    @Size(max = 100, message = "transactionId는 100자 이하여야 합니다.")
    private String transactionId;

    @NotBlank(message = "userId는 필수입니다.")
    @Size(max = 100, message = "userId는 100자 이하여야 합니다.")
    private String userId;

    @NotNull(message = "amount는 필수입니다.")
    @DecimalMin(value = "1.0", message = "amount는 1원 이상이어야 합니다.")
    private BigDecimal amount;

    @NotBlank(message = "merchantCategory는 필수입니다.")
    @Size(max = 50, message = "merchantCategory는 50자 이하여야 합니다.")
    private String merchantCategory;

    @DecimalMin(value = "-90.0", message = "latitude는 -90 이상이어야 합니다.")
    @DecimalMax(value = "90.0", message = "latitude는 90 이하여야 합니다.")
    private Double latitude;

    @DecimalMin(value = "-180.0", message = "longitude는 -180 이상이어야 합니다.")
    @DecimalMax(value = "180.0", message = "longitude는 180 이하여야 합니다.")
    private Double longitude;

    @NotNull(message = "transactionDate는 필수입니다.")
    private OffsetDateTime transactionDate;
}
