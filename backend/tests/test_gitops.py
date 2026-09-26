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
