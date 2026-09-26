"""Thin, shell-free wrapper over the git CLI for the linked product repos."""

import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

PRODUCT_DIR = "product"


class GitError(RuntimeError):
    pass


MAX_DIFF_CHARS = 200_000


@dataclass
class Change:
    path: str  # repo-relative, posix
    status: str  # "added" | "modified" | "deleted"
    added: int = 0  # lines added / removed (for the commit dialog)
    removed: int = 0


def _git(root: Path, *args: str, timeout: int = 30) -> str:
    try:
        r = subprocess.run(
            ["git", "-C", str(root), *args],
            capture_output=True, text=True, timeout=timeout,
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0", "LC_ALL": "C"},
        )
    except subprocess.TimeoutExpired as e:
        raise GitError(f"git {args[0]} timed out") from e
    if r.returncode != 0:
        raise GitError((r.stderr or r.stdout).strip() or f"git {args[0]} failed")
    return r.stdout


def branch(root: Path) -> str:
    try:
        return _git(root, "symbolic-ref", "--short", "HEAD").strip()
    except GitError:
        return "(detached)"


def changes(root: Path) -> list[Change]:
    """Uncommitted changes under product/."""
    out = _git(root, "status", "--porcelain=v1", "-z", "-uall", "--", PRODUCT_DIR)
    result: list[Change] = []
    entries = out.split("\0")
    i = 0
    while i < len(entries):
        e = entries[i]
        i += 1
        if len(e) < 4:
            continue
        xy, path = e[:2], e[3:]
        if xy[0] in "RC":
            i += 1  # skip the original-path entry of a rename/copy
        if xy == "??" or "A" in xy:
            status = "added"
        elif "D" in xy:
            status = "deleted"
        else:
            status = "modified"
        result.append(Change(path, status))
    result.sort(key=lambda c: c.path)
    _fill_stats(root, result)
    return result


def _has_head(root: Path) -> bool:
    try:
        _git(root, "rev-parse", "--verify", "-q", "HEAD")
        return True
    except GitError:
        return False


def _tracked(root: Path, path: str) -> bool:
    try:
        _git(root, "ls-files", "--error-unmatch", "--", path)
        return True
    except GitError:
        return False


def _read_lines(root: Path, path: str) -> list[str]:
    try:
        return (root / path).read_bytes()[:MAX_DIFF_CHARS].decode("utf-8", "replace").splitlines()
    except OSError:
        return []


def _fill_stats(root: Path, items: list[Change]) -> None:
    """Attach +/- line counts: from numstat for tracked files, by counting lines for new ones."""
    if not items:
        return
    numstat: dict[str, tuple[int, int]] = {}
    if _has_head(root):
        for rec in _git(root, "diff", "--numstat", "-z", "HEAD", "--", PRODUCT_DIR).split("\0"):
            parts = rec.split("\t", 2)
            if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit():
                numstat[parts[2]] = (int(parts[0]), int(parts[1]))
    for c in items:
        if c.path in numstat:
            c.added, c.removed = numstat[c.path]
        elif c.status == "added":
            c.added = len(_read_lines(root, c.path))


def diff(root: Path, path: str) -> tuple[str, bool]:
    """Unified diff hunks of one pending file against HEAD. Returns (text, truncated)."""
    pending = {c.path: c for c in changes(root)}
    if path not in pending:
        raise GitError(f"not a pending change under {PRODUCT_DIR}/: {path}")
    if not _tracked(root, path) or not _has_head(root):
        lines = _read_lines(root, path)
        text = f"@@ -0,0 +1,{len(lines)} @@\n" + "\n".join("+" + ln for ln in lines) if lines else ""
    else:
        raw = _git(root, "diff", "--no-color", "-U3", "HEAD", "--", path)
        text = raw[raw.index("@@"):] if "@@" in raw else ""
    if len(text) > MAX_DIFF_CHARS:
        return text[:MAX_DIFF_CHARS], True
    return text, False


_ID = re.compile(r"^([A-Z]+-\d{2,}(?:\.\d+)?)(?:-|\.md$)")


def _entity_id(path: str) -> str | None:
    """The entity id a product file belongs to (feature.md belongs to its folder's id)."""
    parts = path.split("/")
    name = parts[-1]
    if name == "feature.md" and len(parts) >= 2:
        name = parts[-2]
    m = _ID.match(name)
    return m.group(1) if m else None


def suggest_message(items: list[Change]) -> str:
    added: list[str] = []
    updated: list[str] = []
    for c in items:
        eid = _entity_id(c.path)
        if eid:
            (added if c.status == "added" else updated).append(eid)
    parts = []
    if any(c.path.endswith(f"{PRODUCT_DIR}/README.md") and c.status == "added" for c in items):
        parts.append("initialise product structure")
    if added:
        parts.append("add " + ", ".join(sorted(dict.fromkeys(added))))
    if updated:
        parts.append("update " + ", ".join(sorted(dict.fromkeys(updated))))
    if not parts and items:
        parts.append("update product files")
    return "spec: " + "; ".join(parts) if parts else "spec: update"


def branches(root: Path) -> list[str]:
    """Local branch names (the current branch is included even in a repo with no commits yet)."""
    found = _git(root, "for-each-ref", "--format=%(refname:short)", "refs/heads").split()
    current = branch(root)
    if current != "(detached)" and current not in found:
        found.append(current)
    return sorted(found)


def commit(root: Path, paths: list[str], message: str, target_branch: str | None = None, create_branch: bool = False) -> str:
    """Commit exactly `paths` (all must be pending changes under product/). Returns the short hash.

    If `target_branch` differs from the current branch, switch to it first (creating it when
    `create_branch`). Everything is validated before anything is changed; uncommitted files
    travel with the switch, and git refuses it if they would be overwritten.
    """
    message = message.strip()
    if not message:
        raise GitError("commit message is empty")
    if not paths:
        raise GitError("nothing selected to commit")
    pending = {c.path for c in changes(root)}
    unknown = [p for p in paths if p not in pending]
    if unknown:
        raise GitError(f"not pending changes under {PRODUCT_DIR}/: {', '.join(unknown)}")

    current = branch(root)
    switch: list[str] | None = None
    if target_branch and target_branch != current:
        existing = branches(root)
        if create_branch:
            if target_branch in existing:
                raise GitError(f"branch {target_branch!r} already exists")
            if target_branch.startswith("-") or not _check_ref(root, target_branch):
                raise GitError(f"{target_branch!r} is not a valid branch name")
            switch = ["switch", "-c", target_branch]
        else:
            if target_branch not in existing:
                raise GitError(f"no such branch {target_branch!r}")
            switch = ["switch", target_branch]
    elif create_branch and target_branch == current:
        raise GitError(f"branch {target_branch!r} already exists")

    if switch:
        _git(root, *switch)
    _git(root, "add", "--all", "--", *paths)
    _git(root, "commit", "-m", message, "--", *paths, timeout=60)
    return _git(root, "rev-parse", "--short", "HEAD").strip()


def _check_ref(root: Path, name: str) -> bool:
    try:
        _git(root, "check-ref-format", "--branch", name)
        return True
    except GitError:
        return False
