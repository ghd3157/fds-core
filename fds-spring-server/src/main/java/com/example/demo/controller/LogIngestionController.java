package com.example.demo.controller;

import com.example.demo.dto.PaymentLogRequestDto;
import com.example.demo.service.LogIngestionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/logs")
@RequiredArgsConstructor
public class LogIngestionController {

    private final LogIngestionService logIngestionService;

    /** 외부 결제 로그 수신 → DB 저장 + Kafka 전송 */
    @PostMapping
    public ResponseEntity<Void> ingest(@RequestBody PaymentLogRequestDto dto) {
        logIngestionService.ingest(dto);
        return ResponseEntity.accepted().build();
    }
}
