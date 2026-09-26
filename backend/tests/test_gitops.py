from afsp.gitops import Change, suggest_message


def test_suggested_message_names_every_entity_including_nested_ones():
    items = [
        Change("product/README.md", "added"),
        Change("product/.counters.json", "added"),
        Change("product/personas/P-01-ann.md", "added"),
        Change("product/features/F-01-invoicing/feature.md", "added"),
        Change("product/features/F-01-invoicing/C-01.2-send-invoice.md", "added"),
        Change("product/needs/N-03-x.md", "modified"),
    ]
    assert suggest_message(items) == "spec: initialise product structure; add C-01.2, F-01, P-01; update N-03"


def test_suggested_message_fallbacks():
    assert suggest_message([]) == "spec: update"
    assert suggest_message([Change("product/.counters.json", "modified")]) == "spec: update product files"


import subprocess as _sp
from pathlib import Path as _Path

import pytest as _pytest
from fastapi.testclient import TestClient as _Client


def _current(repo: _Path) -> str:
    return _sp.run(["git", "branch", "--show-current"], cwd=repo, capture_output=True, text=True).stdout.strip()


def _prep(client: _Client, project: str) -> tuple[str, list[str]]:
    base = f"/api/projects/{project}"
    client.post(f"{base}/entities", json={"type": "persona", "title": "A"})
    return base, ["product/personas/P-01-a.md"]


def test_git_status_lists_branches(client: _Client, project: str):
    assert client.get(f"/api/projects/{project}/git").json()["branches"] == ["main"]


def test_commit_to_new_branch(client: _Client, project: str, repo: _Path):
    base, paths = _prep(client, project)
    r = client.post(f"{base}/git/commit", json={"message": "m", "paths": paths, "branch": "feature/x", "create_branch": True})
    assert r.status_code == 200 and _current(repo) == "feature/x"
    # in a repo with no commits `main` was never a real branch, so only the new one exists
    assert client.get(f"{base}/git").json()["branches"] == ["feature/x"]


def test_commit_to_existing_other_branch(client: _Client, project: str, repo: _Path):
    _sp.run(["git", "commit", "-q", "--allow-empty", "-m", "root"], cwd=repo, check=True)
    _sp.run(["git", "branch", "other"], cwd=repo, check=True)
    base, paths = _prep(client, project)
    assert client.post(f"{base}/git/commit", json={"message": "m", "paths": paths, "branch": "other"}).status_code == 200
    assert _current(repo) == "other"
    assert _sp.run(["git", "log", "--format=%s", "other"], cwd=repo, capture_output=True, text=True).stdout.split("\n")[0] == "m"
    assert _sp.run(["git", "log", "--format=%s", "main"], cwd=repo, capture_output=True, text=True).stdout.strip() == "root"


@_pytest.mark.parametrize("branch,create", [("nope", False), ("bad name", True), ("-x", True), ("a..b", True), ("main", True)])
def test_bad_branch_choices_change_nothing(client: _Client, project: str, repo: _Path, branch: str, create: bool):
    base, paths = _prep(client, project)
    r = client.post(f"{base}/git/commit", json={"message": "m", "paths": paths, "branch": branch, "create_branch": create})
    assert r.status_code == 422
    assert _current(repo) == "main"
    assert client.get(f"{base}/git").json()["changes"]  # still uncommitted
    assert _sp.run(["git", "rev-parse", "--verify", "-q", "HEAD"], cwd=repo).returncode != 0  # no commit was made


def test_same_branch_is_a_plain_commit(client: _Client, project: str, repo: _Path):
    base, paths = _prep(client, project)
    assert client.post(f"{base}/git/commit", json={"message": "m", "paths": paths, "branch": "main"}).status_code == 200
    assert _current(repo) == "main"


# ---------------------------------------------------------------- diff preview


def _commit_all(repo: _Path) -> None:
    _sp.run(["git", "add", "-A"], cwd=repo, check=True)
    _sp.run(["git", "commit", "-q", "-m", "base"], cwd=repo, check=True)


def test_diff_of_modified_file_and_counts(client: _Client, project: str, repo: _Path):
    base = f"/api/projects/{project}"
    client.post(f"{base}/entities", json={"type": "persona", "title": "A"})
    _commit_all(repo)
    f = repo / "product/personas/P-01-a.md"
    f.write_text(f.read_text().replace("role: ''", "role: CFO"))
    g = client.get(f"{base}/git").json()
    ch = next(c for c in g["changes"] if c["path"] == "product/personas/P-01-a.md")
    assert (ch["status"], ch["added"], ch["removed"]) == ("modified", 1, 1)
    d = client.get(f"{base}/git/diff", params={"path": ch["path"]}).json()
    assert d["diff"].startswith("@@") and "-role: ''" in d["diff"] and "+role: CFO" in d["diff"] and not d["truncated"]


def test_diff_of_new_file_shows_every_line_added(client: _Client, project: str):
    base = f"/api/projects/{project}"
    client.post(f"{base}/entities", json={"type": "persona", "title": "A"})  # repo has no commits: everything is new
    g = client.get(f"{base}/git").json()
    ch = next(c for c in g["changes"] if c["path"] == "product/personas/P-01-a.md")
    d = client.get(f"{base}/git/diff", params={"path": ch["path"]}).json()["diff"]
    lines = d.splitlines()
    assert ch["status"] == "added" and ch["added"] == len(lines) - 1 > 0 and ch["removed"] == 0
    assert lines[0] == f"@@ -0,0 +1,{ch['added']} @@" and all(ln.startswith("+") for ln in lines[1:])


def test_diff_of_deleted_file(client: _Client, project: str, repo: _Path):
    base = f"/api/projects/{project}"
    client.post(f"{base}/entities", json={"type": "persona", "title": "A"})
    _commit_all(repo)
    (repo / "product/personas/P-01-a.md").unlink()
    ch = next(c for c in client.get(f"{base}/git").json()["changes"] if c["path"].endswith("P-01-a.md"))
    assert ch["status"] == "deleted" and ch["removed"] > 0 and ch["added"] == 0
    d = client.get(f"{base}/git/diff", params={"path": ch["path"]}).json()["diff"]
    assert "-id: P-01" in d


@_pytest.mark.parametrize("bad", ["secret.txt", "../etc/passwd", "product/personas", "/etc/passwd", "product/nope.md"])
def test_diff_only_for_pending_paths(client: _Client, project: str, repo: _Path, bad: str):
    (repo / "secret.txt").write_text("x")
    assert client.get(f"/api/projects/{project}/git/diff", params={"path": bad}).status_code == 422


# ---------------------------------------------------------------- switching branches


def _git(repo: _Path, *args: str) -> str:
    return _sp.run(["git", *args], cwd=repo, check=True, capture_output=True, text=True).stdout


def test_switch_to_other_branch_moves_files_with_it(client: _Client, project: str, repo: _Path):
    base = f"/api/projects/{project}"
    client.post(f"{base}/entities", json={"type": "persona", "title": "A"})
    _commit_all(repo)
    _git(repo, "switch", "-q", "-c", "other")
    client.post(f"{base}/entities", json={"type": "persona", "title": "B"})
    _commit_all(repo)
    assert len(client.get(f"{base}/entities").json()["entities"]) == 2
    r = client.post(f"{base}/git/switch", json={"branch": "main"})
    assert r.status_code == 200 and r.json() == {"branch": "main"} and _current(repo) == "main"
    assert [e["id"] for e in client.get(f"{base}/entities").json()["entities"]] == ["P-01"]  # files are what main holds
    assert client.get(f"/api/projects/{project}/status").json()["branch"] == "main"


def test_switch_to_current_branch_is_a_no_op(client: _Client, project: str, repo: _Path):
    _commit_all(repo)
    assert client.post(f"/api/projects/{project}/git/switch", json={"branch": "main"}).status_code == 200


@_pytest.mark.parametrize("bad", ["nope", "", "-c", "main; rm -rf /", "../x"])
def test_switch_to_unknown_branch_is_refused(client: _Client, project: str, repo: _Path, bad: str):
    _commit_all(repo)
    r = client.post(f"/api/projects/{project}/git/switch", json={"branch": bad})
    assert r.status_code == 422 and _current(repo) == "main"


def test_switch_blocked_by_uncommitted_changes_reports_files_and_changes_nothing(client: _Client, project: str, repo: _Path):
    base = f"/api/projects/{project}"
    client.post(f"{base}/entities", json={"type": "persona", "title": "A"})
    _commit_all(repo)
    f = repo / "product/personas/P-01-a.md"
    _git(repo, "switch", "-q", "-c", "other")
    f.write_text(f.read_text().replace("role: ''", "role: on-other"))
    _commit_all(repo)
    _git(repo, "switch", "-q", "main")
    f.write_text(f.read_text().replace("role: ''", "role: my-uncommitted-edit"))  # would be overwritten by `other`
    r = client.post(f"{base}/git/switch", json={"branch": "other"})
    assert r.status_code == 422
    msg = r.json()["detail"]
    assert "P-01-a.md" in msg and "overwritten" in msg
    assert "stash" not in msg.lower() and "abort" not in msg.lower() and "please" not in msg.lower()
    assert _current(repo) == "main" and "my-uncommitted-edit" in f.read_text()  # nothing lost, nothing moved
