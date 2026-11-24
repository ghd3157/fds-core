package com.example.demo.kafka;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

/**
 * 신규 Kafka 볼륨 기동 시 필수 토픽 3종을 자동 생성한다.
 * - payment-log-topic  (3 partitions, Key: userId)
 * - fraud-result-topic (3 partitions, Key: transactionId)
 * - fds-dlq-topic      (1 partition)
 */
@Configuration
public class KafkaTopicConfig {

    @Bean
    public NewTopic paymentLogTopic(@Value("${fds.topics.payment-log:payment-log-topic}") String name) {
        return TopicBuilder.name(name).partitions(3).replicas(1).build();
    }

    @Bean
    public NewTopic fraudResultTopic(@Value("${fds.topics.fraud-result:fraud-result-topic}") String name) {
        return TopicBuilder.name(name).partitions(3).replicas(1).build();
    }

    @Bean
    public NewTopic dlqTopic(@Value("${fds.topics.dlq:fds-dlq-topic}") String name) {
        return TopicBuilder.name(name).partitions(1).replicas(1).build();
    }
}
