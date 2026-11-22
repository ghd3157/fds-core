package com.example.demo;

import com.example.demo.domain.Admin;
import com.example.demo.repository.AdminRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.ZoneId;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${fds.security.admin-username:admin}")
    private String adminUsername;

    @Value("${fds.security.admin-password:admin1234!}")
    private String adminPassword;

    @Value("${fds.security.viewer-username:viewer}")
    private String viewerUsername;

    @Value("${fds.security.viewer-password:viewer1234!}")
    private String viewerPassword;

    @Override
    public void run(String... args) {
        initAccount(adminUsername, adminPassword, Admin.Role.ROLE_ADMIN);
        initAccount(viewerUsername, viewerPassword, Admin.Role.ROLE_VIEWER);
    }

    private void initAccount(String username, String rawPassword, Admin.Role role) {
        if (adminRepository.findByUsername(username).isEmpty()) {
            Admin account = Admin.builder()
                    .username(username)
                    .password(passwordEncoder.encode(rawPassword))
                    .role(role)
                    .createdAt(LocalDateTime.now(KST))
                    .build();
            adminRepository.save(account);
            log.info("[System] 기본 계정 생성 완료 | username={} | role={}", username, role);
        }
    }
}
