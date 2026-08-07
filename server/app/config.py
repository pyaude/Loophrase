"""应用配置。

所有配置项优先从环境变量读取，未设置时使用默认值。
存储路径基于本文件位置计算，确保始终相对于 server/ 项目目录。
"""

import os
from pathlib import Path

# server/ 根目录（server/app/config.py -> server/）
SERVER_ROOT = Path(__file__).resolve().parent.parent

# 默认存储位置：server/apks 与 server/data/versions.db
_DEFAULT_APK_DIR = SERVER_ROOT / "apks"
_DEFAULT_DB_PATH = SERVER_ROOT / "data" / "versions.db"


class Settings:
    """全局配置单例。

    使用简单类实现，在模块导入时从环境变量读取一次。
    测试中可通过 monkeypatch 修改实例属性（如 DB_PATH）来隔离数据。
    """

    # 服务监听地址与端口
    HOST: str = os.environ.get("HOST", "0.0.0.0")
    PORT: int = int(os.environ.get("PORT", "8000"))

    # APK 文件存放目录
    APK_STORAGE_DIR: Path = Path(os.environ.get("APK_STORAGE_DIR", str(_DEFAULT_APK_DIR)))

    # SQLite 数据库文件路径
    DB_PATH: Path = Path(os.environ.get("DB_PATH", str(_DEFAULT_DB_PATH)))

    # 管理接口鉴权 Token（为空表示未配置，发布/删除接口将返回 503）
    ADMIN_TOKEN: str = os.environ.get("ADMIN_TOKEN", "")

    # 单次上传最大体积：500MB
    MAX_UPLOAD_SIZE: int = int(os.environ.get("MAX_UPLOAD_SIZE", str(500 * 1024 * 1024)))


# 模块级单例，供其它模块导入使用
settings = Settings()
