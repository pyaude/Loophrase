"""SQLite 版本元数据存储层。

使用标准库 sqlite3，不依赖 ORM。所有函数在调用时动态读取 settings.DB_PATH，
因此测试中可通过修改 settings.DB_PATH 指向临时数据库来隔离数据。
"""

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional

from app.config import settings


@contextmanager
def _get_db():
    """获取数据库连接的上下文管理器，退出时自动关闭连接。"""
    conn = sqlite3.connect(settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def _now_iso() -> str:
    """返回当前 UTC 时间的 ISO 8601 字符串（精度到秒，带 Z 后缀）。"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def init_db() -> None:
    """初始化数据库：创建表与索引（如果不存在）。

    同时确保数据库文件所在目录存在。
    """
    settings.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_version (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                version              TEXT NOT NULL UNIQUE,
                platform             TEXT NOT NULL DEFAULT 'android',
                changelog            TEXT,
                min_required_version TEXT NOT NULL DEFAULT '0.0.0',
                file_path            TEXT NOT NULL,
                file_size            INTEGER NOT NULL,
                is_active            INTEGER NOT NULL DEFAULT 1,
                published_at         TEXT NOT NULL,
                created_at           TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_version_platform
            ON app_version(platform, is_active)
            """
        )
        conn.commit()


def compare_versions(v1: str, v2: str) -> int:
    """语义化版本比较（MAJOR.MINOR.PATCH），不依赖外部包。

    返回值：v1 < v2 返回 -1，相等返回 0，v1 > v2 返回 1。
    """
    parts1 = [int(x) for x in v1.split(".")]
    parts2 = [int(x) for x in v2.split(".")]
    for a, b in zip(parts1, parts2):
        if a != b:
            return -1 if a < b else 1
    if len(parts1) < len(parts2):
        return -1
    elif len(parts1) > len(parts2):
        return 1
    return 0


def get_latest_version(platform: str = "android") -> Optional[dict]:
    """获取指定平台下最新的活跃版本（按语义化版本号比较）。"""
    with _get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM app_version WHERE platform = ? AND is_active = 1",
            (platform,),
        ).fetchall()

    if not rows:
        return None

    # 在 Python 中按语义化版本号找出最新（SQLite 无法直接比较 semver）
    latest_row = rows[0]
    for row in rows[1:]:
        if compare_versions(row["version"], latest_row["version"]) > 0:
            latest_row = row
    return dict(latest_row)


def get_version_by_number(version: str, platform: str = "android") -> Optional[dict]:
    """按版本号获取特定版本记录，不存在返回 None。"""
    with _get_db() as conn:
        row = conn.execute(
            "SELECT * FROM app_version WHERE version = ? AND platform = ?",
            (version, platform),
        ).fetchone()
    return dict(row) if row else None


def get_all_versions(platform: str = "android") -> list[dict]:
    """获取指定平台下所有活跃版本，按发布时间倒序排列。"""
    with _get_db() as conn:
        rows = conn.execute(
            """
            SELECT version, changelog, file_size, published_at
            FROM app_version
            WHERE platform = ? AND is_active = 1
            ORDER BY published_at DESC, id DESC
            """,
            (platform,),
        ).fetchall()
    return [dict(row) for row in rows]


def create_version(
    version: str,
    platform: str,
    changelog: str,
    min_required_version: str,
    file_path: str,
    file_size: int,
) -> None:
    """创建一条新的版本记录。"""
    published_at = _now_iso()
    with _get_db() as conn:
        conn.execute(
            """
            INSERT INTO app_version
                (version, platform, changelog, min_required_version,
                 file_path, file_size, is_active, published_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            """,
            (
                version,
                platform,
                changelog,
                min_required_version,
                str(file_path),
                file_size,
                published_at,
            ),
        )
        conn.commit()


def delete_version(version: str, platform: str = "android") -> int:
    """删除指定版本记录，返回实际删除的行数（0 表示版本不存在）。"""
    with _get_db() as conn:
        cur = conn.execute(
            "DELETE FROM app_version WHERE version = ? AND platform = ?",
            (version, platform),
        )
        conn.commit()
        return cur.rowcount
