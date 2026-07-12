package com.example.demo;

import com.example.demo.domain.Admin;
import com.example.demo.repository.AdminRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        // "admin" 아이디가 존재하지 않을 때만 기본 계정 생성
        if (adminRepository.findByUsername("admin").isEmpty()) {
            Admin defaultAdmin = Admin.builder()
                    .username("admin")
                    .password(passwordEncoder.encode("1234"))
                    .role(Admin.Role.ROLE_ADMIN)
                    .build();

            adminRepository.save(defaultAdmin);
            log.info("✅ [System] 기본 관리자 계정 생성 완료 (ID: admin)");
        }
    }
}
