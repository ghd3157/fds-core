package com.example.demo.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneId;

@Entity
@Table(name = "admin")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Admin {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 관리자 로그인 아이디 */
    @Column(nullable = false, unique = true, length = 50)
    private String username;

    /** BCrypt 해싱된 비밀번호 */
    @Column(nullable = false)
    private String password;

    /** 권한 (ROLE_ADMIN, ROLE_VIEWER) */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    /** 계정 생성 시각 (KST) */
    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(KST);
        }
    }

    public enum Role {
        ROLE_ADMIN, ROLE_VIEWER
    }
}
