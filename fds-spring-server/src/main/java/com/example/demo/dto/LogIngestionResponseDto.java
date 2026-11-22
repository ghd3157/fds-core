package com.example.demo.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class LogIngestionResponseDto {
    private String transactionId;
    private String status;
}
