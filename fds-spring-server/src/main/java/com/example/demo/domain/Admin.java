package com.example.demo.domain;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "admin")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Admin {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 관리자 로그인 아이디 */
    @Column(nullable = false, unique = true, length = 50)
    private String username;

    /** BCrypt 해싱된 비밀번호 */
    @Column(nullable = false)
    private String password;

    /** 권한 (예: ROLE_ADMIN, ROLE_VIEWER) */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    public enum Role {
        ROLE_ADMIN, ROLE_VIEWER
    }
}
