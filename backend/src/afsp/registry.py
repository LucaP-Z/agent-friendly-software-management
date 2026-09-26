"""Project registry: which local git repos the platform knows about.

Stored as JSON outside every repo (default ~/.agentic-dev/projects.json,
override the folder with AFSP_HOME).
"""

import json
import os
import subprocess
import tempfile
import threading
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path


class RegistryError(ValueError):
    pass


@dataclass
class Project:
    id: str
    name: str
    path: str
    added_at: str
    last_opened: str | None = None


def home_dir() -> Path:
    return Path(os.environ.get("AFSP_HOME") or Path.home() / ".agentic-dev")


def git_toplevel(path: Path) -> Path | None:
    try:
        r = subprocess.run(
            ["git", "-C", str(path), "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return Path(r.stdout.strip()).resolve() if r.returncode == 0 and r.stdout.strip() else None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Registry:
    def __init__(self, file: Path | None = None):
        self.file = file or home_dir() / "projects.json"
        self._lock = threading.Lock()

    def _load(self) -> list[Project]:
        if not self.file.exists():
            return []
        try:
            data = json.loads(self.file.read_text("utf-8"))
            return [Project(**p) for p in data.get("projects", [])]
        except (json.JSONDecodeError, TypeError) as e:
            raise RegistryError(f"{self.file} is corrupt: {e}") from e

    def _save(self, projects: list[Project]) -> None:
        self.file.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.file.parent, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"projects": [asdict(p) for p in projects]}, f, indent=2)
        os.replace(tmp, self.file)

    def list(self) -> list[Project]:
        with self._lock:
            return self._load()

    def get(self, project_id: str) -> Project | None:
        return next((p for p in self.list() if p.id == project_id), None)

    def add(self, path: str, name: str | None = None) -> Project:
        p = Path(path).expanduser()
        if not p.is_absolute():
            raise RegistryError("path must be absolute")
        if not p.is_dir():
            raise RegistryError(f"{p} is not a directory")
        p = p.resolve()
        top = git_toplevel(p)
        if top is None:
            raise RegistryError(f"{p} is not inside a git repository (run `git init` first)")
        if top != p:
            raise RegistryError(f"{p} is not the repository root; use {top}")
        with self._lock:
            projects = self._load()
            if any(Path(x.path) == p for x in projects):
                raise RegistryError("this repository is already linked")
            proj = Project(uuid.uuid4().hex[:8], (name or p.name).strip() or p.name, str(p), _now())
            self._save([*projects, proj])
            return proj

    def remove(self, project_id: str) -> bool:
        with self._lock:
            projects = self._load()
            kept = [p for p in projects if p.id != project_id]
            if len(kept) == len(projects):
                return False
            self._save(kept)
            return True

    def touch(self, project_id: str) -> Project | None:
        with self._lock:
            projects = self._load()
            for p in projects:
                if p.id == project_id:
                    p.last_opened = _now()
                    self._save(projects)
                    return p
        return None
