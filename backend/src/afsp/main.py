"""FastAPI app. Run: uv run uvicorn afsp.main:app --port 8000"""

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .api import router
from .store import StoreError
from .gitops import GitError

DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000", "http://127.0.0.1:8000"]

app = FastAPI(title="Agentic Development System", docs_url="/api/docs", openapi_url="/api/openapi.json")

# Local-only tool that writes to your repos: refuse foreign hosts (DNS rebinding) and foreign origins (CSRF).
app.add_middleware(CORSMiddleware, allow_origins=DEV_ORIGINS, allow_methods=["*"], allow_headers=["*"])
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]", "testserver"])


@app.middleware("http")
async def reject_foreign_origin(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin and origin not in DEV_ORIGINS and request.method not in ("GET", "HEAD", "OPTIONS"):
        return JSONResponse({"detail": "foreign origin"}, status_code=403)
    return await call_next(request)


@app.exception_handler(StoreError)
async def store_error(_: Request, exc: StoreError):
    return JSONResponse({"detail": str(exc)}, status_code=exc.status)


@app.exception_handler(GitError)
async def git_error(_: Request, exc: GitError):
    return JSONResponse({"detail": str(exc)}, status_code=422)


app.include_router(router)

_dist = Path(__file__).resolve().parents[3] / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (_dist / path).resolve()
        return FileResponse(f if f.is_file() and _dist in f.parents else _dist / "index.html")
