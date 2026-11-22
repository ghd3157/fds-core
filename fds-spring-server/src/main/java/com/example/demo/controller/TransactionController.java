package com.example.demo.controller;

import com.example.demo.domain.TransactionLog.ProcessStatus;
import com.example.demo.dto.TransactionDetailResponseDto;
import com.example.demo.dto.TransactionResponseDto;
import com.example.demo.service.TransactionService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/transactions")
@RequiredArgsConstructor
public class TransactionController {

    private final TransactionService transactionService;

    /** 거래 내역 필터·검색·페이징 조회 (transactionDate 내림차순) */
    @GetMapping
    public ResponseEntity<Page<TransactionResponseDto>> getTransactions(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) ProcessStatus status,
            @RequestParam(required = false) Boolean isFraud,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String keyword
    ) {
        return ResponseEntity.ok(
                transactionService.getTransactions(page, size, status, isFraud, category, keyword)
        );
    }

    /** 거래 단건 상세 + 연결된 이상 탐지 알람 조회 */
    @GetMapping("/{transactionId}")
    public ResponseEntity<TransactionDetailResponseDto> getTransactionDetail(
            @PathVariable String transactionId
    ) {
        return ResponseEntity.ok(transactionService.getTransactionDetail(transactionId));
    }
}
