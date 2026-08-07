"""FastAPI 应用入口。

启动时初始化数据库与存储目录，挂载客户端接口与管理接口路由，
并启用 CORS（开发期允许所有来源）。
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import admin, update
from app.storage import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化数据库与存储目录。"""
    settings.APK_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    settings.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    init_db()
    yield


app = FastAPI(title="Loophrase Update Service", lifespan=lifespan)

# CORS 中间件：开发期允许所有来源
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载路由
app.include_router(update.router)
app.include_router(admin.router)
