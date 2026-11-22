package com.example.demo.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class HourlyTrafficDto {
    private String hour;        // e.g. "2026-11-22T21:00"
    private String label;       // e.g. "21시"
    private long normalCount;
    private long fraudCount;
}
