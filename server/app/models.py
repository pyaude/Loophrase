"""Pydantic 数据模型定义。"""

from typing import Optional

from pydantic import BaseModel


class VersionInfo(BaseModel):
    """版本完整信息（对应数据库一行记录）。"""

    id: int
    version: str
    platform: str
    changelog: Optional[str] = None
    min_required_version: str
    file_size: int
    is_active: bool
    published_at: str
    created_at: Optional[str] = None


class UpdateCheckResponse(BaseModel):
    """检查更新接口响应。

    无更新时仅需 has_update 与 latest_version；
    有更新时附带详细信息（min_required_version、download_url 等）。
    """

    has_update: bool
    latest_version: str
    min_required_version: Optional[str] = None
    is_force_update: Optional[bool] = None
    changelog: Optional[str] = None
    download_url: Optional[str] = None
    file_size: Optional[int] = None
    published_at: Optional[str] = None


class VersionListItem(BaseModel):
    """版本列表中的单条记录。"""

    version: str
    changelog: Optional[str] = None
    file_size: int
    published_at: str


class VersionListResponse(BaseModel):
    """版本列表响应。"""

    versions: list[VersionListItem]


class PublishRequest(BaseModel):
    """发布新版本请求体（管理接口的表单字段定义）。"""

    version: str
    platform: str = "android"
    changelog: str = ""
    min_required_version: str = "0.0.0"
