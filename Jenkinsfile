pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    environment {
        COMPOSE_PROJECT_NAME = 'fds-core'
        IMAGE_TAG            = "build-${env.BUILD_NUMBER}"
    }

    stages {
        stage('1. Checkout & Environment') {
            steps {
                sh '''
                    echo "=============================================="
                    echo " FDS Core CI/CD Pipeline — Build #${BUILD_NUMBER}"
                    echo " Commit : $(git rev-parse --short HEAD)"
                    echo " Branch : $(git rev-parse --abbrev-ref HEAD)"
                    echo " Docker : $(docker --version)"
                    echo " Compose: $(docker compose version)"
                    echo "=============================================="
                '''
            }
        }

        stage('2. CI — Parallel Build & Automated Tests') {
            parallel {
                stage('Spring Boot Unit & Security Tests') {
                    steps {
                        dir('fds-spring-server') {
                            sh '''
                                sed -i 's/\\r$//' gradlew
                                chmod +x gradlew
                                ./gradlew test --no-daemon
                            '''
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: 'fds-spring-server/build/test-results/test/*.xml'
                        }
                    }
                }

                stage('Python AI Image Build & Pytest') {
                    steps {
                        sh '''
                            docker build -t fds-python-server:${IMAGE_TAG} -t fds-python-server:latest ./fds-python-server
                            docker run --rm -e FDS_DISABLE_KAFKA=true fds-python-server:${IMAGE_TAG} pytest -v
                        '''
                    }
                }

                stage('React Frontend Lint & Production Build') {
                    steps {
                        sh '''
                            docker build -t fds-frontend:${IMAGE_TAG} -t fds-frontend:latest ./fds-frontdend
                        '''
                    }
                }
            }
        }

        stage('3. CI — Spring Boot Docker Image Build') {
            steps {
                sh '''
                    docker build -t fds-spring-server:${IMAGE_TAG} -t fds-spring-server:latest ./fds-spring-server
                '''
            }
        }

        stage('4. CD — Deploy Full Stack via Docker Compose') {
            steps {
                sh '''
                    # 1. 인프라(MariaDB, Redis, Kafka) 기동 및 헬스체크 대기
                    docker compose -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml up -d

                    # 2. 신규 빌드 이미지로 Spring · Python · Frontend 무중단 롤링 재기동
                    IMAGE_TAG=${IMAGE_TAG} docker compose -p ${COMPOSE_PROJECT_NAME} \
                        -f docker-compose.yml -f docker-compose.app.yml \
                        up -d --no-build --force-recreate fds-python-app fds-spring-app fds-frontend-app
                '''
            }
        }

        stage('5. Post-Deploy Smoke & Health Verification') {
            steps {
                sh '''
                    echo "[1/3] Checking Python AI Server (/health)..."
                    for i in $(seq 1 20); do
                        if curl -fsS http://fds-python-app:8000/health | grep -q '"modelLoaded":true'; then
                            echo "Python AI Server is HEALTHY!"
                            curl -fsS http://fds-python-app:8000/health
                            echo ""
                            break
                        fi
                        if [ "$i" -eq 20 ]; then
                            echo "Python AI Server healthcheck FAILED"
                            docker logs --tail 40 fds-python-app
                            exit 1
                        fi
                        sleep 2
                    done

                    echo "[2/3] Checking Spring Boot Backend (POST /api/v1/auth/login)..."
                    for i in $(seq 1 30); do
                        HTTP_CODE=$(curl -s -o /tmp/login_resp.json -w "%{http_code}" \
                            -X POST http://fds-spring-app:8080/api/v1/auth/login \
                            -H "Content-Type: application/json" \
                            -d '{"username":"admin","password":"admin1234!"}' || true)
                        if [ "$HTTP_CODE" = "200" ]; then
                            echo "Spring Boot Backend is HEALTHY! (Login HTTP 200)"
                            break
                        fi
                        if [ "$i" -eq 30 ]; then
                            echo "Spring Boot Backend healthcheck FAILED (HTTP $HTTP_CODE)"
                            docker logs --tail 50 fds-spring-app
                            exit 1
                        fi
                        sleep 3
                    done

                    echo "[3/3] Checking React Frontend (Nginx HTTP 200)..."
                    curl -fsS -I http://fds-frontend-app:80/ | head -n 5
                    echo "All 3 deployed services verified successfully!"
                '''
            }
        }
    }

    post {
        success {
            sh 'echo "🎉 FDS Core CI/CD Build #${BUILD_NUMBER} SUCCEEDED! Deployed tag: ${IMAGE_TAG}"'
        }
        failure {
            sh 'echo "❌ FDS Core CI/CD Build #${BUILD_NUMBER} FAILED — check stage logs above."'
        }
        always {
            // 오래된 dangling 빌드 이미지 정리 (디스크 공간 보호)
            sh 'docker image prune -f || true'
        }
    }
}
