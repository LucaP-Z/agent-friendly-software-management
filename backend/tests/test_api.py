import subprocess
from pathlib import Path

from fastapi.testclient import TestClient



def run(*args: str, cwd: Path) -> None:
    subprocess.run(args, cwd=cwd, check=True, capture_output=True)


def test_link_rejects_non_git_relative_and_subfolder(client: TestClient, tmp_path: Path, repo: Path):
    plain = tmp_path / "plain"
    plain.mkdir()
    assert client.post("/api/projects", json={"path": str(plain)}).status_code == 422
    assert client.post("/api/projects", json={"path": "relative/path"}).status_code == 422
    sub = repo / "sub"
    sub.mkdir()
    r = client.post("/api/projects", json={"path": str(sub)})
    assert r.status_code == 422 and "repository root" in r.json()["detail"]


def test_link_duplicate_and_switch_between_projects(client: TestClient, tmp_path: Path, repo: Path):
    other = tmp_path / "other"
    other.mkdir()
    run("git", "init", cwd=other)
    a = client.post("/api/projects", json={"path": str(repo), "name": "A"}).json()
    b = client.post("/api/projects", json={"path": str(other), "name": "B"}).json()
    assert client.post("/api/projects", json={"path": str(repo)}).status_code == 422
    for pid in (a["id"], b["id"]):
        client.post(f"/api/projects/{pid}/init")
    client.post(f"/api/projects/{a['id']}/entities", json={"type": "persona", "title": "Only in A"})
    assert len(client.get(f"/api/projects/{a['id']}/entities").json()["entities"]) == 1
    assert client.get(f"/api/projects/{b['id']}/entities").json()["entities"] == []
    assert client.post(f"/api/projects/{b['id']}/open").json()["last_opened"]
    assert len(client.get("/api/projects").json()) == 2


def test_unlink_keeps_repo_files(client: TestClient, project: str, repo: Path):
    client.post(f"/api/projects/{project}/entities", json={"type": "persona", "title": "A"})
    assert client.delete(f"/api/projects/{project}").status_code == 204
    assert (repo / "product" / "personas" / "P-01-a.md").exists()
    assert client.get(f"/api/projects/{project}/status").status_code == 404


def test_status_reports_uninitialized_then_initialized(client: TestClient, repo: Path):
    pid = client.post("/api/projects", json={"path": str(repo)}).json()["id"]
    assert client.get(f"/api/projects/{pid}/status").json()["initialized"] is False
    assert client.post(f"/api/projects/{pid}/entities", json={"type": "persona"}).status_code == 422
    client.post(f"/api/projects/{pid}/init")
    st = client.get(f"/api/projects/{pid}/status").json()
    assert st["initialized"] is True and st["branch"] == "main"


def test_entity_flow_with_conflict(client: TestClient, project: str):
    base = f"/api/projects/{project}/entities"
    e = client.post(base, json={"type": "persona", "title": "Ann"}).json()
    r = client.put(f"{base}/{e['id']}", json={"base_hash": e["hash"], "data": {**e["data"], "role": "CFO"}})
    assert r.status_code == 200 and r.json()["changed"] and r.json()["data"]["role"] == "CFO"
    stale = client.put(f"{base}/{e['id']}", json={"base_hash": e["hash"], "data": e["data"]})
    assert stale.status_code == 409
    assert client.get(f"{base}/P-99").status_code == 404
    assert client.get(f"{base}?type=need").json()["entities"] == []


def test_invalid_payload_is_422_not_500(client: TestClient, project: str):
    base = f"/api/projects/{project}/entities"
    e = client.post(base, json={"type": "persona", "title": "Ann"}).json()
    r = client.put(f"{base}/{e['id']}", json={"base_hash": e["hash"], "data": {"status": "bogus"}})
    assert r.status_code == 422


def test_commit_only_selected_paths(client: TestClient, project: str, repo: Path):
    base = f"/api/projects/{project}"
    client.post(f"{base}/entities", json={"type": "persona", "title": "A"})
    client.post(f"{base}/entities", json={"type": "persona", "title": "B"})
    g = client.get(f"{base}/git").json()
    assert g["branch"] == "main" and "add P-01, P-02" in g["suggested_message"]
    paths = [c["path"] for c in g["changes"]]
    assert "product/personas/P-01-a.md" in paths
    r = client.post(f"{base}/git/commit", json={"message": "spec: add P-01", "paths": ["product/personas/P-01-a.md"]})
    assert r.status_code == 200
    left = [c["path"] for c in client.get(f"{base}/git").json()["changes"]]
    assert "product/personas/P-01-a.md" not in left and "product/personas/P-02-b.md" in left
    log = subprocess.run(["git", "log", "--format=%s"], cwd=repo, capture_output=True, text=True).stdout
    assert log.strip() == "spec: add P-01"


def test_commit_rejects_paths_outside_pending_changes(client: TestClient, project: str, repo: Path):
    (repo / "secret.txt").write_text("x")
    base = f"/api/projects/{project}/git/commit"
    for bad in ("secret.txt", "../etc/passwd", "product/personas"):
        r = client.post(base, json={"message": "m", "paths": [bad]})
        assert r.status_code == 422, bad
    assert client.post(base, json={"message": " ", "paths": ["product/README.md"]}).status_code == 422


def test_folder_browser(client: TestClient, repo: Path):
    r = client.get("/api/fs/browse", params={"path": str(repo.parent)}).json()
    assert r["entries"][0]["is_git_repo"] is True
    assert client.get("/api/fs/browse", params={"path": str(repo)}).json()["is_git_root"] is True
    assert client.get("/api/fs/browse", params={"path": "/nope/nothing"}).status_code == 422


def test_foreign_origin_and_host_rejected(client: TestClient, project: str):
    r = client.post(f"/api/projects/{project}/init", headers={"origin": "https://evil.example"})
    assert r.status_code == 403
    assert client.get("/api/projects", headers={"host": "evil.example"}).status_code == 400
