from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from backend.api.routes.meetings import router as meetings_router
from backend.api.routes.upload import router as upload_router
from backend.api.websocket import manager
from backend.utils.logger import setup_logger
from backend.config import Config

setup_logger()

app = FastAPI(title="MetMind", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[Config.FRONTEND_URL, "http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meetings_router)
app.include_router(upload_router)


@app.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0", "groq_model": Config.GROQ_MODEL}


@app.get("/config")
def get_config():
    """Expose non-sensitive config to frontend."""
    return {
        "groq_available": bool(Config.GROQ_API_KEY),
        "groq_model": Config.GROQ_MODEL,
        "backend_host": Config.BACKEND_HOST,
        "backend_port": Config.BACKEND_PORT,
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except Exception:
        manager.disconnect(ws)