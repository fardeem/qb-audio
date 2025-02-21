import asyncio
import json
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter()
event_queue = asyncio.Queue()

@router.get("/events")
async def sse(request: Request):
    """
    SSE endpoint that streams out events as they happen.
    """
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            event = await event_queue.get()
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

async def send_event(event_type: str, data: dict):
    """
    Helper to enqueue a dictionary as an SSE event.
    """
    await event_queue.put({"type": event_type, "data": data}) 