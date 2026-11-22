package com.example.demo.exception;

import lombok.Builder;
import lombok.Getter;

import java.time.OffsetDateTime;
import java.time.ZoneId;

@Getter
@Builder
public class ErrorResponse {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final String code;
    private final String message;
    private final int status;
    private final OffsetDateTime timestamp;
    private final String path;

    public static ErrorResponse of(String code, String message, int status, String path) {
        return ErrorResponse.builder()
                .code(code)
                .message(message)
                .status(status)
                .timestamp(OffsetDateTime.now(KST))
                .path(path)
                .build();
    }
}
