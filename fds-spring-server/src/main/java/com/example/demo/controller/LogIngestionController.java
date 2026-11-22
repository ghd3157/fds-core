package com.example.demo.controller;

import com.example.demo.dto.LogIngestionResponseDto;
import com.example.demo.dto.PaymentLogRequestDto;
import com.example.demo.service.LogIngestionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/logs")
@RequiredArgsConstructor
public class LogIngestionController {

    private final LogIngestionService logIngestionService;

    /** 외부 결제 로그 수신 (X-API-Key 인증) → DB 저장(PENDING) + afterCommit Kafka 발행 */
    @PostMapping
    public ResponseEntity<LogIngestionResponseDto> ingest(@Valid @RequestBody PaymentLogRequestDto dto) {
        LogIngestionResponseDto response = logIngestionService.ingest(dto);
        return ResponseEntity.accepted().body(response);
    }
}
