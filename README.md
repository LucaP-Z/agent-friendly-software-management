# agent-friendly-software-management
Software management platform to centralise software design, with a built-in MCP server for agents to know what they're building. Also includes multi-agent real-time development surveillance dashboard.

## Status

**Phase 1: web UI + UI↔files contract.** Link local git repos as projects, switch between them, and define the product (personas, needs, features, capabilities with acceptance criteria / use cases / edge cases, constraints, enablers, glossary) through forms that auto-save to Markdown + YAML files under `product/`. Commits are explicit. No database, CLI or MCP server yet.

The contract is specified in [docs/contract.md](docs/contract.md); the product model follows the Foundation Spec (section 3).

## Run it

Requires Python ≥ 3.12 with [uv](https://docs.astral.sh/uv/), and Node ≥ 20.

```bash
# terminal 1: API on http://127.0.0.1:8000
uv run --directory backend uvicorn afsp.main:app --host 127.0.0.1 --port 8000 --reload

# terminal 2: UI on http://127.0.0.1:5173 (proxies /api to the backend)
npm --prefix frontend install
npm --prefix frontend run dev
```

Then open http://127.0.0.1:5173, **Link repository**, pick a git repo root and press **Initialise product structure**.

Linked projects are remembered in `~/.agentic-dev/projects.json` (set `AFSP_HOME` to use another folder, e.g. for testing).

To serve the UI from the backend alone: `npm --prefix frontend run build`, and the API server then serves `frontend/dist`.

## Tests

```bash
uv run --directory backend pytest
npm --prefix frontend run build    # typechecks and builds
```

## Layout

```
backend/    FastAPI app (src/afsp) and tests
frontend/   React + Vite + TypeScript + shadcn/ui
docs/       contract.md: the UI ↔ files contract
```
