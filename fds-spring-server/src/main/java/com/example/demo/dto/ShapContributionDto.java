package com.example.demo.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class ShapContributionDto {
    private String feature;
    private String label;
    private Double value;
    private Double shap;
}
