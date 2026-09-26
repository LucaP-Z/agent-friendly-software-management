"""HTTP API. Everything project-scoped lives under /api/projects/{project_id}/."""

from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from . import gitops, schema
from .registry import Project, Registry, RegistryError, git_toplevel
from .store import ProductStore, Record

router = APIRouter(prefix="/api")


def registry() -> Registry:
    return Registry()


def project_store(project_id: str, reg: Registry = Depends(registry)) -> tuple[Project, ProductStore]:
    proj = reg.get(project_id)
    if proj is None:
        raise HTTPException(404, "unknown project")
    if not Path(proj.path).is_dir():
        raise HTTPException(410, f"{proj.path} no longer exists; unlink this project")
    return proj, ProductStore(Path(proj.path))


def _summary(rec: Record) -> dict[str, Any]:
    return {
        "id": rec.id,
        "type": rec.type.key,
        "title": rec.entity.title,
        "status": rec.entity.status,
        "path": rec.rel,
        "parent": f"F-{rec.id.split('-', 1)[1].split('.')[0]}" if rec.type.parent else None,
    }


def _full(rec: Record) -> dict[str, Any]:
    return {**_summary(rec), "hash": rec.hash, "data": rec.entity.model_dump(mode="json")}


# ------------------------------------------------------------------- schema


@router.get("/schema")
def get_schema() -> dict[str, Any]:
    return schema.describe()


# ----------------------------------------------------------------- projects


class LinkProject(BaseModel):
    path: str
    name: str | None = None


@router.get("/projects")
def list_projects(reg: Registry = Depends(registry)) -> list[dict[str, Any]]:
    return [{**asdict(p), "exists": Path(p.path).is_dir()} for p in reg.list()]


@router.post("/projects", status_code=201)
def link_project(body: LinkProject, reg: Registry = Depends(registry)) -> dict[str, Any]:
    try:
        return asdict(reg.add(body.path, body.name))
    except RegistryError as e:
        raise HTTPException(422, str(e)) from e


@router.delete("/projects/{project_id}", status_code=204)
def unlink_project(project_id: str, reg: Registry = Depends(registry)) -> None:
    """Unlinks only; never touches the repository."""
    if not reg.remove(project_id):
        raise HTTPException(404, "unknown project")


@router.post("/projects/{project_id}/open")
def open_project(project_id: str, reg: Registry = Depends(registry)) -> dict[str, Any]:
    proj = reg.touch(project_id)
    if proj is None:
        raise HTTPException(404, "unknown project")
    return asdict(proj)


@router.get("/projects/{project_id}/status")
def project_status(ps: tuple[Project, ProductStore] = Depends(project_store)) -> dict[str, Any]:
    proj, store = ps
    return {
        "project": asdict(proj),
        "initialized": store.initialized(),
        "branch": gitops.branch(store.root),
    }


@router.post("/projects/{project_id}/init")
def init_project(ps: tuple[Project, ProductStore] = Depends(project_store)) -> dict[str, Any]:
    _, store = ps
    return {"created": store.init()}


# ----------------------------------------------------------------- entities


class CreateEntity(BaseModel):
    type: str
    title: str = ""
    parent: str | None = None


class SaveEntity(BaseModel):
    base_hash: str
    data: dict[str, Any]


class AllocateId(BaseModel):
    key: str


@router.get("/projects/{project_id}/entities")
def list_entities(
    type: str | None = Query(None), ps: tuple[Project, ProductStore] = Depends(project_store)
) -> dict[str, Any]:
    _, store = ps
    scan = store.scan()
    items = [_summary(r) for r in scan.records.values() if type in (None, r.type.key)]
    return {"entities": items, "problems": [asdict(p) for p in scan.problems]}


@router.post("/projects/{project_id}/entities", status_code=201)
def create_entity(body: CreateEntity, ps: tuple[Project, ProductStore] = Depends(project_store)) -> dict[str, Any]:
    return _full(ps[1].create(body.type, body.title, body.parent))


@router.get("/projects/{project_id}/entities/{entity_id}")
def get_entity(entity_id: str, ps: tuple[Project, ProductStore] = Depends(project_store)) -> dict[str, Any]:
    return _full(ps[1].get(entity_id))


@router.put("/projects/{project_id}/entities/{entity_id}")
def save_entity(
    entity_id: str, body: SaveEntity, ps: tuple[Project, ProductStore] = Depends(project_store)
) -> dict[str, Any]:
    rec, changed = ps[1].update(entity_id, body.data, body.base_hash)
    return {**_full(rec), "changed": changed}


@router.post("/projects/{project_id}/ids")
def allocate_id(body: AllocateId, ps: tuple[Project, ProductStore] = Depends(project_store)) -> dict[str, str]:
    """Reserve an id for a nested item (e.g. key "AC-01.2"). Ids are never reused."""
    return {"id": ps[1].allocate(body.key)}


# ---------------------------------------------------------------------- git


class Commit(BaseModel):
    message: str
    paths: list[str]


@router.get("/projects/{project_id}/git")
def git_status(ps: tuple[Project, ProductStore] = Depends(project_store)) -> dict[str, Any]:
    _, store = ps
    items = gitops.changes(store.root)
    return {
        "branch": gitops.branch(store.root),
        "changes": [asdict(c) for c in items],
        "suggested_message": gitops.suggest_message(items),
    }


@router.post("/projects/{project_id}/git/commit")
def git_commit(body: Commit, ps: tuple[Project, ProductStore] = Depends(project_store)) -> dict[str, str]:
    _, store = ps
    return {"commit": gitops.commit(store.root, body.paths, body.message)}


# ----------------------------------------------------------- folder browser


@router.get("/fs/browse")
def browse(path: str | None = None, hidden: bool = False) -> dict[str, Any]:
    """Server-side folder picker (browsers cannot reveal real folder paths)."""
    p = Path(path).expanduser() if path else Path.home()
    if not p.is_absolute() or not p.is_dir():
        raise HTTPException(422, f"{p} is not an absolute directory path")
    p = p.resolve()
    entries = []
    try:
        children = sorted(c for c in p.iterdir() if c.is_dir() and (hidden or not c.name.startswith(".")))
    except PermissionError as e:
        raise HTTPException(403, f"cannot read {p}") from e
    for c in children:
        entries.append({"name": c.name, "path": str(c), "is_git_repo": (c / ".git").exists()})
    return {
        "path": str(p),
        "parent": str(p.parent) if p.parent != p else None,
        "is_git_root": git_toplevel(p) == p,
        "entries": entries,
    }
