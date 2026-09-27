"""ProductStore: reads and writes the `product/` tree of one linked repo.

Files are the source of truth. Nothing is cached: every call scans the tree, so
edits made by hand, by git or by agents are always visible.
"""

import json
import os
import re
import tempfile
import threading
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from . import contract
from .models import TOP_LEVEL_PREFIXES, TYPES, Entity, EntityType
from .gitops import PRODUCT_DIR

COUNTERS_FILE = ".counters.json"
_locks: dict[str, threading.RLock] = {}


class StoreError(ValueError):
    """Client-correctable problem (maps to HTTP 4xx)."""

    status = 422


class NotFound(StoreError):
    status = 404


class Conflict(StoreError):
    status = 409


@dataclass
class Record:
    id: str
    type: EntityType
    path: Path  # absolute
    rel: str  # repo-relative posix path
    hash: str
    entity: Entity
    front: dict[str, Any]


@dataclass
class Problem:
    path: str
    message: str
    kind: str = "parse"  # "parse" | "link" | "layout"


@dataclass
class Scan:
    records: dict[str, Record] = field(default_factory=dict)
    problems: list[Problem] = field(default_factory=list)


def slugify(text: str, fallback: str = "untitled") -> str:
    s = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:48].strip("-")
    return s or fallback


def _walk_ids(model: BaseModel) -> list[str]:
    """Every id in an entity, nested items included."""
    ids: list[str] = []
    for name in type(model).model_fields:
        v = getattr(model, name)
        if name == "id" and isinstance(v, str) and v:
            ids.append(v)
        elif isinstance(v, BaseModel):
            ids += _walk_ids(v)
        elif isinstance(v, list):
            for i in v:
                if isinstance(i, BaseModel):
                    ids += _walk_ids(i)
    return ids


def _links(model: BaseModel) -> list[tuple[str, list[str], str]]:
    """(field name, referenced ids, allowed type keys) for every link field, nested included."""
    out: list[tuple[str, list[str], str]] = []
    for name, f in type(model).model_fields.items():
        v = getattr(model, name)
        extra = f.json_schema_extra if isinstance(f.json_schema_extra, dict) else {}
        allowed = extra.get("x-link")
        if allowed:
            out.append((name, [v] if isinstance(v, str) and v else list(v) if isinstance(v, list) else [], ",".join(allowed)))
        if isinstance(v, BaseModel):
            out += _links(v)
        elif isinstance(v, list):
            for i in v:
                if isinstance(i, BaseModel):
                    out += _links(i)
    return out


class ProductStore:
    def __init__(self, root: Path):
        self.root = root
        self.product = root / PRODUCT_DIR
        self._lock = _locks.setdefault(str(root), threading.RLock())

    # ------------------------------------------------------------------ setup

    def initialized(self) -> bool:
        return (self.product / COUNTERS_FILE).is_file()

    def init(self) -> list[str]:
        """Create the product/ skeleton. Idempotent; never overwrites files."""
        created: list[str] = []
        with self._lock:
            self.product.mkdir(exist_ok=True)
            for d in sorted({t.dirname for t in TYPES.values()}):
                (self.product / d).mkdir(exist_ok=True)
                keep = self.product / d / ".gitkeep"
                if not any((self.product / d).iterdir()):
                    keep.touch()
                    created.append(f"{PRODUCT_DIR}/{d}/")
            for name, content in ((COUNTERS_FILE, "{}\n"), ("README.md", README)):
                f = self.product / name
                if not f.exists():
                    f.write_text(content, "utf-8")
                    created.append(f"{PRODUCT_DIR}/{name}")
        return created

    # ------------------------------------------------------------------- scan

    def scan(self) -> Scan:
        scan = Scan()
        if not self.product.is_dir():
            return scan
        for path in sorted(self.product.rglob("*.md")):
            rel = path.relative_to(self.root).as_posix()
            if path.name == "README.md" and path.parent == self.product:
                continue
            try:
                raw = path.read_bytes()
                etype, eid = contract.identify(raw)
                entity, front = contract.parse(raw, etype.model)
            except (contract.ContractError, OSError) as e:
                scan.problems.append(Problem(rel, str(e)))
                continue
            if eid in scan.records:
                scan.problems.append(Problem(rel, f"duplicate id {eid} (also in {scan.records[eid].rel})", "layout"))
                continue
            scan.records[eid] = Record(eid, etype, path, rel, contract.file_hash(raw), entity, front)
        for rec in scan.records.values():
            for name, ids, allowed in _links(rec.entity):
                for ref in ids:
                    if allowed != "ac" and ref not in scan.records:
                        scan.problems.append(Problem(rec.rel, f"{rec.id}.{name} links to unknown {ref}", "link"))
        return scan

    def get(self, eid: str, scan: Scan | None = None) -> Record:
        rec = (scan or self.scan()).records.get(eid)
        if rec is None:
            raise NotFound(f"no entity {eid}")
        return rec

    # -------------------------------------------------------------------- ids

    def _counters(self) -> dict[str, int]:
        f = self.product / COUNTERS_FILE
        try:
            return {k: int(v) for k, v in json.loads(f.read_text("utf-8") or "{}").items()}
        except (OSError, ValueError) as e:
            raise StoreError(f"{PRODUCT_DIR}/{COUNTERS_FILE} is unreadable: {e}") from e

    def _next_number(self, key: str, scan: Scan) -> int:
        sep = "-" if key in TOP_LEVEL_PREFIXES else "."
        pat = re.compile(re.escape(key) + re.escape(sep) + r"(\d+)")
        seen = [0, self._counters().get(key, 0)]
        for rec in scan.records.values():
            for i in _walk_ids(rec.entity):
                m = pat.fullmatch(i)
                if m:
                    seen.append(int(m.group(1)))
        return max(seen) + 1

    def allocate(self, key: str, scan: Scan | None = None) -> str:
        """Reserve the next id for a counter key (e.g. "P", "C-01", "AC-01.2"). Never reused."""
        if not re.fullmatch(r"[A-Z]+(-\d{2,}(\.\d+)?)?", key):
            raise StoreError(f"bad counter key {key!r}")
        with self._lock:
            if not self.initialized():
                raise StoreError("project has no product/ structure yet")
            scan = scan or self.scan()
            n = self._next_number(key, scan)
            counters = self._counters()
            counters[key] = n
            self._atomic_write(self.product / COUNTERS_FILE, (json.dumps(counters, indent=2, sort_keys=True) + "\n").encode())
            sep = "-" if key in TOP_LEVEL_PREFIXES else "."
            num = f"{n:02d}" if key in TOP_LEVEL_PREFIXES else str(n)
            return f"{key}{sep}{num}"

    # ----------------------------------------------------------------- create

    def create(self, type_key: str, title: str = "", parent: str | None = None) -> Record:
        etype = TYPES.get(type_key)
        if etype is None:
            raise StoreError(f"unknown entity type {type_key!r}")
        with self._lock:
            if not self.initialized():
                raise StoreError("project has no product/ structure yet")
            scan = self.scan()
            if etype.parent:
                if not parent:
                    raise StoreError(f"a {etype.label.lower()} needs a parent {etype.parent}")
                prec = scan.records.get(parent)
                if prec is None or prec.type.key != etype.parent:
                    raise StoreError(f"{parent} is not a {etype.parent}")
                num = parent.split("-", 1)[1]
                eid = self.allocate(f"C-{num}", scan)
                folder = prec.path.parent
            else:
                eid = self.allocate(etype.prefix, scan)
                folder = self.product / etype.dirname
            slug = slugify(title)
            if etype.key == "feature":
                folder = folder / f"{eid}-{slug}"
                path = folder / "feature.md"
            else:
                path = folder / f"{eid}-{slug}.md"
            entity = etype.model(id=eid, title=title.strip())
            raw = contract.render(entity)
            self._atomic_write(path, raw, exclusive=True)
            return self.get(eid)

    # ----------------------------------------------------------------- update

    def update(self, eid: str, data: dict[str, Any], base_hash: str) -> tuple[Record, bool]:
        """Save form data to the entity's file. Returns (record, changed)."""
        with self._lock:
            scan = self.scan()
            rec = self.get(eid, scan)
            if rec.hash != base_hash:
                raise Conflict("file changed on disk since it was loaded")
            data = {**data, "id": eid}
            try:
                new = rec.type.model.model_validate(data)
            except Exception as e:
                raise StoreError(f"invalid data: {e}") from e
            self._assign_nested_ids(new, scan)
            self._check_nested(new)
            self._check_links(new, rec.entity)
            if new == rec.entity:
                return rec, False
            self._atomic_write(rec.path, contract.render(new, rec.front))
            return self.get(eid), True

    def _assign_nested_ids(self, entity: Entity, scan: Scan) -> None:
        """Safety net: items sent without an id get one allocated, in order."""
        num = entity.id.split("-", 1)[1]
        if entity.id.startswith("F-"):
            groups = [("acceptance_criteria", f"AC-{num}"), ("success_criteria", f"SC-{num}")]
        elif entity.id.startswith("C-"):
            groups = [
                ("acceptance_criteria", f"AC-{num}"),
                ("use_cases", f"UC-{num}"),
                ("edge_cases", f"EC-{num}"),
            ]
        else:
            return
        for attr, key in groups:
            for item in getattr(entity, attr):
                if not item.id:
                    item.id = self.allocate(key, scan)

    def _check_nested(self, entity: Entity) -> None:
        num = entity.id.split("-", 1)[1]
        seen: set[str] = set()
        for i in _walk_ids(entity):
            if i == entity.id:
                continue
            if i in seen:
                raise StoreError(f"duplicate id {i}")
            seen.add(i)
            if not i.split("-", 1)[1].startswith(num + "."):
                raise StoreError(f"{i} does not belong to {entity.id}")

    def _check_links(self, new: Entity, old: Entity) -> None:
        """Reject newly introduced dangling links (pre-existing ones must not block saves)."""
        scan = self.scan()
        own_acs = {i for i in _walk_ids(new) if i.startswith("AC-")}
        old_links = {(n, r) for n, refs, _ in _links(old) for r in refs}
        for name, refs, allowed in _links(new):
            for ref in refs:
                if (name, ref) in old_links:
                    continue
                if allowed == "ac":
                    if ref not in own_acs:
                        raise StoreError(f"{name}: {ref} is not an acceptance criterion of {new.id}")
                    continue
                target = scan.records.get(ref)
                if target is None:
                    raise StoreError(f"{name}: {ref} does not exist")
                if target.type.key not in allowed.split(","):
                    raise StoreError(f"{name}: {ref} is a {target.type.key}, expected {allowed}")

    # ------------------------------------------------------------------- misc

    @staticmethod
    def _atomic_write(path: Path, data: bytes, exclusive: bool = False) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        if exclusive and path.exists():
            raise StoreError(f"{path.name} already exists")
        mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
        fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            os.chmod(tmp, mode)
            os.replace(tmp, path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise


README = """# Product definition

Generated by the Agentic Development System. Each entity is a Markdown file with
YAML frontmatter (id, status, links); the body holds free-form notes.

```
personas/       P-01-<slug>.md
needs/          N-01-<slug>.md
features/       F-01-<slug>/feature.md
                F-01-<slug>/C-01.2-<slug>.md     capabilities of the feature
constraints/    CON-01-<slug>.md
enablers/       EN-01-<slug>.md
glossary/       G-01-<slug>.md
.counters.json  id high-water marks: ids are never reused
```

Edit through the platform UI or by hand; the UI always reads the files from disk.
"""
