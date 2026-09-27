import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from afsp.main import app


def run(*args: str, cwd: Path) -> None:
    subprocess.run(args, cwd=cwd, check=True, capture_output=True)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    r = tmp_path / "product-repo"
    r.mkdir()
    run("git", "init", "-b", "main", cwd=r)
    run("git", "config", "user.name", "Test", cwd=r)
    run("git", "config", "user.email", "test@example.com", cwd=r)
    run("git", "config", "commit.gpgsign", "false", cwd=r)
    return r


@pytest.fixture
def client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setenv("AFSP_HOME", str(tmp_path / "home"))
    return TestClient(app)


@pytest.fixture
def project(client: TestClient, repo: Path) -> str:
    pid = client.post("/api/projects", json={"path": str(repo)}).json()["id"]
    assert client.post(f"/api/projects/{pid}/init").status_code == 200
    return pid
