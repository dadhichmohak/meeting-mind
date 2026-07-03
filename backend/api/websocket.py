"""
Manages all live WebSocket connections and broadcasts to them.
"""
import json
import asyncio
from fastapi import WebSocket
from loguru import logger


class ConnectionManager:
    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.append(ws)
        logger.info(f"WS connected ({len(self._connections)} clients)")

    def disconnect(self, ws: WebSocket):
        if ws in self._connections:
            self._connections.remove(ws)
        logger.info(f"WS disconnected ({len(self._connections)} clients)")

    async def broadcast(self, payload: dict):
        msg = json.dumps(payload)
        dead = []
        for ws in self._connections:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections.remove(ws)


manager = ConnectionManager()


async def push_segment(seg_dict: dict):
    await manager.broadcast({"type": "transcript", "data": seg_dict})


async def push_status(status: str, detail: str = ""):
    await manager.broadcast({"type": "status", "status": status, "detail": detail})