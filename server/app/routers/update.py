"""客户端接口路由：检查更新、下载 APK、版本列表。"""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from app.config import settings
from app.models import UpdateCheckResponse, VersionListItem, VersionListResponse
from app.storage import compare_versions, get_all_versions, get_latest_version

router = APIRouter(prefix="/api/v1", tags=["update"])


@router.get("/check-update", response_model=UpdateCheckResponse)
async def check_update(
    request: Request,
    platform: str = "android",
    version: str = "0.0.0",
):
    """检查更新。

    比较客户端当前版本与服务端最新版本：
    - 当前版本 >= 最新版本：返回 has_update=False
    - 有更新：返回完整更新信息，download_url 为基于 base_url 的绝对地址
    - 当 current_version < min_required_version 时 is_force_update=True
    """
    latest = get_latest_version(platform)

    # 没有任何已发布版本
    if latest is None:
        return UpdateCheckResponse(has_update=False, latest_version=version)

    latest_version = latest["version"]

    # 当前版本已是最新的或更高
    if compare_versions(version, latest_version) >= 0:
        return UpdateCheckResponse(has_update=False, latest_version=latest_version)

    # 存在更新，计算是否需要强制更新并拼装下载地址
    is_force_update = compare_versions(version, latest["min_required_version"]) < 0
    filename = Path(latest["file_path"]).name
    # request.base_url 形如 http://host:8000/，拼接为绝对 URL
    download_url = f"{request.base_url}api/v1/download/{filename}"

    return UpdateCheckResponse(
        has_update=True,
        latest_version=latest_version,
        min_required_version=latest["min_required_version"],
        is_force_update=is_force_update,
        changelog=latest["changelog"],
        download_url=download_url,
        file_size=latest["file_size"],
        published_at=latest["published_at"],
    )


@router.get("/download/{filename}")
async def download_apk(filename: str):
    """下载 APK 文件，以流式方式传输。

    文件不存在时返回 404。
    """
    file_path = settings.APK_STORAGE_DIR / filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(
        path=str(file_path),
        media_type="application/vnd.android.package-archive",
        filename=filename,
    )


@router.get("/versions", response_model=VersionListResponse)
async def list_versions(platform: str = "android"):
    """获取指定平台的所有活跃版本（按发布时间倒序）。"""
    rows = get_all_versions(platform)
    items = [
        VersionListItem(
            version=row["version"],
            changelog=row["changelog"],
            file_size=row["file_size"],
            published_at=row["published_at"],
        )
        for row in rows
    ]
    return VersionListResponse(versions=items)
