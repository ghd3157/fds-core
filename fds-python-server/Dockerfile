FROM python:3.12-slim
WORKDIR /app

# LightGBM OpenMP 런타임(libgomp1) 및 헬스체크용 curl 설치
RUN apt-get update && \
    apt-get install -y --no-install-recommends libgomp1 curl tzdata && \
    rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Seoul
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY pytest.ini ./
COPY app ./app
COPY training ./training
COPY models ./models
COPY tests ./tests

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
