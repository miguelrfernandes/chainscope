from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agent_actions import router as agent_actions_router
from app.api.chat import router as chat_router
from app.api.health import router as health_router
from app.api.suggest import router as suggest_router
from app.core.config import get_settings
from app.core.langsmith import configure_langsmith
from app.core.scheduler import init_scheduler, shutdown_scheduler
from app.tools.subgraph_mcp import get_subgraph_tools


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_langsmith()
    await get_subgraph_tools()  # warm the MCP tool cache before first request
    init_scheduler()
    try:
        yield
    finally:
        shutdown_scheduler()


app = FastAPI(title="ChainScope backend", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(chat_router)
app.include_router(suggest_router)
app.include_router(agent_actions_router)

