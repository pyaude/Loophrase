"""管理接口路由：发布新版本、删除版本。

所有接口均需 Bearer Token 鉴权（ADMIN_TOKEN）。
"""

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile

from app.config import settings
from app.storage import create_version, delete_version, get_version_by_number

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# 单次读取 APK 的块大小（1MB）
_CHUNK_SIZE = 1024 * 1024


async def verify_admin_token(authorization: Optional[str] = Header(default=None)):
    """管理接口鉴权依赖。

    - ADMIN_TOKEN 未配置：返回 503
    - 未提供 Authorization 头：返回 401
    - Token 不匹配：返回 401
    """
    if not settings.ADMIN_TOKEN:
        raise HTTPException(status_code=503, detail="Admin token not configured")

    if not authorization:
        raise HTTPException(status_code=401, detail="未提供认证 Token")

    token = authorization.replace("Bearer ", "", 1)
    if token != settings.ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="无效的 Token")


@router.post("/publish")
async def publish(
    version: str = Form(...),
    platform: str = Form("android"),
    changelog: str = Form(""),
    min_required_version: str = Form("0.0.0"),
    apk: UploadFile = File(...),
    _: None = Depends(verify_admin_token),
):
    """发布新版本。

    接收 multipart/form-data：version、platform、changelog、min_required_version、apk(file)。
    版本号已存在时返回 409，上传体积超限返回 413。
    """
    # 检查版本号是否已存在
    if get_version_by_number(version, platform) is not None:
        raise HTTPException(status_code=409, detail="该版本号已存在")

    # 确保存储目录存在
    settings.APK_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    filename = f"Loophrase-{version}.apk"
    file_path = settings.APK_STORAGE_DIR / filename

    # 流式写入文件，同时校验总大小
    total_size = 0
    too_large = False
    with open(file_path, "wb") as f:
        while True:
            chunk = await apk.read(_CHUNK_SIZE)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > settings.MAX_UPLOAD_SIZE:
                too_large = True
                break
            f.write(chunk)

    # 超限则清理已写入的部分文件
    if too_large:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail="文件大小超过限制")

    # 创建数据库记录
    create_version(
        version=version,
        platform=platform,
        changelog=changelog,
        min_required_version=min_required_version,
        file_path=str(file_path),
        file_size=total_size,
    )

    return {"message": "发布成功", "version": version}


@router.delete("/versions/{version}")
async def delete_version_endpoint(
    version: str,
    platform: str = "android",
    _: None = Depends(verify_admin_token),
):
    """删除指定版本，同时删除对应的 APK 文件。版本不存在返回 404。"""
    record = get_version_by_number(version, platform)
    if record is None:
        raise HTTPException(status_code=404, detail="版本不存在")

    # 删除 APK 文件（忽略可能已不存在的情形）
    file_path = Path(record["file_path"])
    file_path.unlink(missing_ok=True)

    # 删除数据库记录
    delete_version(version, platform)

    return {"message": "删除成功", "version": version}
