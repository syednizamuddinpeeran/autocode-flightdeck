from fastapi import FastAPI

from flightdeck.folders import router as folders_router

app = FastAPI(title="Flight deck")
app.include_router(folders_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
