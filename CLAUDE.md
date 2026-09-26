# CLAUDE.md

Platform for spec-driven, agent-built software. This repo is the **platform's own code**; the product repos it manages are separate git repos linked at runtime (never put a managed product in here).

## Ground rules

- The contract in `docs/contract.md` is the spec for UI ↔ file behaviour. Change the contract and the code together.
- `backend/src/afsp/models.py` is the single source of truth for entity fields. The UI renders forms from its JSON Schema (`GET /api/schema`), so add a field there (with `x-*` hints) rather than in the frontend. Field order = frontmatter key order.
- Files are the source of truth: no caches, no database yet. Never write files outside `product/` of a linked repo; never commit or push except through the explicit Commit endpoint.
- Files the platform can't parse must never be modified or hidden; report them as problems.
- Ids are allocated by the server and never reused (`product/.counters.json`).

## Commands

```bash
uv run --directory backend pytest                 # backend tests
npm --prefix frontend run build                   # typecheck + build
uv run --directory backend uvicorn afsp.main:app --port 8000 --reload
npm --prefix frontend run dev
```

Use `AFSP_HOME=/tmp/some-dir` when running the server for experiments so the real project registry (`~/.agentic-dev`) is untouched. `afsp-test-sandbox` (a plain git repo next to this one) is the scratch product repo for manual testing.

## Conventions

- Backend: Python 3.12+, Pydantic models, subprocess calls to git always as argument lists (no shell) with `--` before paths; validate every client-supplied path against the scan/pending-changes list, never build file paths from client input.
- Frontend: shadcn/ui (Base UI flavour, components in `src/components/ui`), TanStack Query, React Router. Keep components in `components/`, pages in `pages/`, non-component helpers in `lib/` or `hooks/`.
