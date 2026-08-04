package com.example.demo.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class CategoryStatDto {

    /** 가맹점 카테고리명 (예: grocery_pos, entertainment) */
    private String category;

    /** 해당 카테고리의 사기 탐지 건수 */
    private long count;
}
