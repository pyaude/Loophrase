"""版本服务接口测试。

使用 pytest + httpx TestClient。所有测试均使用临时目录与临时数据库，
不会污染正式数据。每个测试函数通过 fixture 获得一个全新的客户端。
"""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.storage import init_db

# 测试用的管理 Token
TEST_TOKEN = "test-token"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """创建隔离环境的测试客户端。

    将数据库路径与 APK 目录指向临时目录，并配置测试用 Token，
    每个测试函数前都会获得全新的数据库。
    """
    db_path = tmp_path / "test.db"
    apk_dir = tmp_path / "apks"
    apk_dir.mkdir()

    monkeypatch.setattr(settings, "DB_PATH", db_path)
    monkeypatch.setattr(settings, "APK_STORAGE_DIR", apk_dir)
    monkeypatch.setattr(settings, "ADMIN_TOKEN", TEST_TOKEN)

    # 初始化全新数据库
    init_db()

    with TestClient(app) as test_client:
        yield test_client


def _fake_apk(content: bytes = b"fake apk content for testing") -> bytes:
    """生成一个假的 APK 文件内容（小文件即可）。"""
    return content


def _publish(client, version, token=TEST_TOKEN, **form_fields):
    """向发布接口发起请求的辅助函数。"""
    data = {
        "version": version,
        "platform": "android",
        "changelog": "测试更新日志",
        "min_required_version": "0.0.0",
    }
    data.update(form_fields)

    files = {
        "apk": (
            f"Loophrase-{version}.apk",
            _fake_apk(),
            "application/vnd.android.package-archive",
        )
    }

    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.post("/api/v1/admin/publish", data=data, files=files, headers=headers)


def test_check_update_lower_version_has_update(client):
    """低版本检查应返回 has_update=True，并带完整下载信息。"""
    _publish(client, "0.2.0", changelog="新版本")

    resp = client.get(
        "/api/v1/check-update", params={"platform": "android", "version": "0.1.0"}
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["has_update"] is True
    assert data["latest_version"] == "0.2.0"
    assert data["changelog"] == "新版本"
    assert data["file_size"] == len(_fake_apk())
    # download_url 应为绝对地址，并指向对应文件
    assert data["download_url"].endswith("/api/v1/download/Loophrase-0.2.0.apk")


def test_check_update_latest_version_no_update(client):
    """已是最新版本应返回 has_update=False。"""
    _publish(client, "0.1.0")

    resp = client.get("/api/v1/check-update", params={"version": "0.1.0"})
    assert resp.status_code == 200
    data = resp.json()

    assert data["has_update"] is False
    assert data["latest_version"] == "0.1.0"


def test_check_update_force_update(client):
    """低于 min_required_version 时应返回 is_force_update=True。"""
    _publish(client, "0.3.0", min_required_version="0.2.0")

    # 0.1.0 < 0.2.0 -> 强制更新
    resp = client.get("/api/v1/check-update", params={"version": "0.1.0"})
    data = resp.json()
    assert data["has_update"] is True
    assert data["is_force_update"] is True

    # 0.2.0 == min_required_version -> 非强制（但有更新）
    resp2 = client.get("/api/v1/check-update", params={"version": "0.2.0"})
    data2 = resp2.json()
    assert data2["has_update"] is True
    assert data2["is_force_update"] is False


def test_publish_no_token_returns_401(client):
    """未提供 Token 发布应返回 401。"""
    resp = _publish(client, "0.1.0", token=None)
    assert resp.status_code == 401


def test_publish_duplicate_returns_409(client):
    """重复版本号发布应返回 409。"""
    assert _publish(client, "0.1.0").status_code == 200
    resp = _publish(client, "0.1.0")
    assert resp.status_code == 409


def test_publish_then_check_update(client):
    """正常发布后，check-update 应能检测到新版本。"""
    _publish(client, "0.5.0")

    resp = client.get("/api/v1/check-update", params={"version": "0.4.0"})
    data = resp.json()
    assert data["has_update"] is True
    assert data["latest_version"] == "0.5.0"


def test_versions_list(client):
    """versions 列表应返回全部活跃版本，且按发布时间倒序排列。"""
    _publish(client, "0.1.0", changelog="首个版本")
    _publish(client, "0.2.0", changelog="第二个版本")

    resp = client.get("/api/v1/versions", params={"platform": "android"})
    assert resp.status_code == 200
    data = resp.json()

    versions = [item["version"] for item in data["versions"]]
    assert "0.1.0" in versions
    assert "0.2.0" in versions
    # 后发布的 0.2.0 应排在 0.1.0 之前
    assert versions.index("0.2.0") < versions.index("0.1.0")
