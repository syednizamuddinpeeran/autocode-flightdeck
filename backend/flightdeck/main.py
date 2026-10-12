from fastapi import FastAPI

app = FastAPI(title="Flight deck")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
