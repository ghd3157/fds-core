from fastapi import FastAPI

app = FastAPI(title="Capstone FDS AI Server")

@app.get("/")
async def root():
    return {"message": "Python AI Server is Running Successfully!"}

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "fds-python-server"}