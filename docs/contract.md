# UI ↔ files contract

This is the contract between what a user does in the web UI and what ends up in the linked git repository. The UI never writes anything except through this contract; the files are the source of truth.

**Where things live**

| Concern | Source of truth |
| --- | --- |
| Which fields each entity has, their order, types, link targets | [`backend/src/afsp/models.py`](../backend/src/afsp/models.py). The UI renders forms from the JSON Schema these models produce (`GET /api/schema`), so there is no second copy to drift. |
| Serialisation rules | [`backend/src/afsp/contract.py`](../backend/src/afsp/contract.py) |
| Layout, ids, validation, atomic writes | [`backend/src/afsp/store.py`](../backend/src/afsp/store.py) |
| Git operations | [`backend/src/afsp/gitops.py`](../backend/src/afsp/gitops.py) |
| Which repos are linked | [`backend/src/afsp/registry.py`](../backend/src/afsp/registry.py), a JSON file outside every repo |

Scope of this version: the product definition layer of the Foundation Spec (section 3). Approvals, PO review, the linter beyond the minimum below, slices, the work database, the CLI and the MCP server are later phases.

## 1. Projects

A **project** is a local git repository whose root contains a `product/` folder.

- Linked projects are stored in `~/.agentic-dev/projects.json` (override the folder with `AFSP_HOME`). Nothing about the platform is stored inside the repository except `product/`.
- Linking requires an **absolute path to the repository root** (not a sub-folder, not a plain folder). The UI offers a server-side folder browser because browsers cannot reveal real paths.
- Unlinking only removes the registry entry. It never touches the repository.
- Every API call is scoped to a project: `/api/projects/{project_id}/…`. Switching project in the UI is switching that id.
- A repository without `product/` is offered **Initialise**, which creates the skeleton below. It never overwrites existing files and commits nothing.

## 2. Layout

```
product/
  README.md                       generated once; describes this layout
  .counters.json                  id high-water marks (see §4)
  personas/       P-01-accountant-ann.md
  needs/          N-01-get-paid-on-time.md
  features/
    F-01-invoicing/
      feature.md                  the feature (id F-01)
      C-01.1-create-invoice.md    its capabilities (ids C-01.n)
      C-01.2-send-invoice.md
  constraints/    CON-01-<slug>.md
  enablers/       EN-01-<slug>.md
  glossary/       G-01-<slug>.md
```

- **Filename = `<id>-<slug>.md`.** The slug comes from the title at creation and **never changes**, even if the title does, so git history follows the file.
- The **id in the frontmatter is authoritative**, not the filename. A file is found by scanning `product/**/*.md`, so moving files by hand is safe.
- A capability lives in the folder of its feature, which is found by the number in its id (`C-01.2` → feature `F-01`).
- There is no delete. An entity is retired by setting `status: retired`. (Hand-deleting a file is possible; its id is still never reused, see §4.)

## 3. File format

```markdown
---
id: C-01.1
title: Create invoice
status: draft            # draft | approved | superseded | retired
version: 1
priority: must
depends_on: []
budget_usd:
acceptance_criteria:
  - id: AC-01.1.1
    surface: both        # ui | api | both
    format: gwt          # gwt | ears
    given: a client with a billing address
    when: the accountant submits an invoice with one line
    then: it is saved as Draft with the next sequential number
use_cases:
  - id: UC-01.1.1
    actor: P-01
    trigger: ''
    steps: []
    outcome: ''
    verified_by:
      - AC-01.1.1
edge_cases: []
not_applicable: []
design:
  mockups: []
  flows: []
---

Free-form Markdown notes (the "Notes" field in the UI).
```

**Serialisation rules**

1. Frontmatter is YAML between `---` lines. The Markdown body is the `body` field, stored verbatim after the closing `---` and a blank line, with leading/trailing blank lines trimmed.
2. Keys are written **in the model's field order**; nested items likewise. Every known field is always written, except: an `ears` criterion omits `given/when/then`, a `gwt` criterion omits `statement`, and `spans` is omitted when empty.
3. **Unknown keys are preserved**, at the top level and inside nested items (matched by their `id`), and written after the known keys. Hand-added fields and future fields survive a UI save. YAML comments are not preserved.
4. Multi-line strings are written as block scalars (`|`) so diffs stay readable.
5. **Deterministic:** parsing a file and writing it back unchanged yields identical bytes, and saving a form with no changes does not touch the file (no write, same hash, no diff).
6. Writes are atomic (temp file + rename) and keep the file's existing permissions.

## 4. Ids

| Entity | Id | Counter key |
| --- | --- | --- |
| Persona / Need / Feature | `P-01` / `N-01` / `F-01` | `P` / `N` / `F` |
| Constraint / Enabler / Glossary term | `CON-01` / `EN-01` / `G-01` | `CON` / `EN` / `G` |
| Capability | `C-01.2` (feature number, then a sequence) | `C-01` |
| Success criterion (feature) | `SC-01.1` | `SC-01` |
| Feature-wide acceptance criterion | `AC-01.3` | `AC-01` |
| Acceptance criterion (capability) | `AC-01.2.3` | `AC-01.2` |
| Use case / Edge case (capability) | `UC-01.2.1` / `EC-01.2.4` | `UC-01.2` / `EC-01.2` |

- **The server allocates ids; the client never invents them.** Adding a nested item in the UI calls `POST /ids` first, so the id exists (and is reserved) before the item does.
- **Never reused.** `.counters.json` records the highest number ever issued per key, and allocation takes the maximum of that counter and every id found in the files. Deleting a file or removing an item, even by hand, cannot cause reuse. Commit this file with the rest.
- Nested ids must belong to their parent (`AC-01.2.x` only inside `C-01.2`) and be unique within the entity. An item saved without an id gets one allocated as a safety net.
- Ids are names, not addresses: an item that later moves keeps its id.

## 5. Saving (auto-save) and concurrency

- The UI saves **automatically** about 0.8 s after the last edit, one save in flight at a time, and flushes on leaving the page. Files are written immediately; **nothing is committed** (see §7).
- The UI **reads from disk every time** (no cache): opening an entity, or returning to the window, re-reads the file, so edits made by hand, by git or by agents appear. If the file changed and the form has no unsaved edits, the form updates silently.
- **Optimistic concurrency.** Every load returns a `hash` (SHA-256 of the file bytes). `PUT` must send it as `base_hash`. If the file changed on disk since, the server answers **409** and writes nothing. The UI pauses auto-save and offers *Load the disk version* or *Overwrite with my version*.
- **Drafts may be incomplete.** Auto-save must accept half-filled forms, so saves enforce only the minimum in §6.

## 6. Validation on save

Enforced (a failing save returns **422** with a message and writes nothing):

- The payload matches the entity's schema (types, enums, id patterns). The entity's own `id` cannot be changed.
- Nested ids are well-formed, unique, and belong to the entity (§4).
- **Links resolve, to the right type.** `x-link` fields (personas on a need, `depends_on`, `actor`, …) must reference existing entities of the allowed types. `verified_by` must reference acceptance criteria of the same capability. Only **newly introduced** dangling links are rejected, so a pre-existing bad link never blocks saving other fields.

Not enforced yet: completeness (e.g. at least one criterion), testability wording, glossary use, approval rules, cycle checks. Those belong to the spec linter and PO review.

**Files the platform cannot read** (invalid YAML, unknown id, duplicate id) are never modified and never hidden: they are listed as *Problems* on the project overview. Dangling links found on disk are listed the same way.

## 7. Git

- Auto-save only writes files. **Commits happen only when the user presses Commit.**
- The Commit dialog lists uncommitted changes under `product/` (added / modified / deleted), all pre-selected. The message is pre-filled (`spec: initialise product structure; add P-01, C-01.2; update N-01`) and editable.
- The server commits **only the selected paths** (`git add --all -- <paths>` then `git commit -m … -- <paths>`) on the repository's **current branch**. Anything else staged or modified stays untouched. Paths must be current pending changes under `product/`; anything else is refused.
- Nothing is ever pushed, and the platform never creates or switches branches.
- Commits use the repository's own git identity. If none is configured, git's error is shown in the dialog.

## 8. API summary

| Method and path | Purpose |
| --- | --- |
| `GET /api/schema` | Entity types and their JSON Schema (drives the forms) |
| `GET/POST /api/projects`, `DELETE /api/projects/{id}` | List, link, unlink |
| `POST /api/projects/{id}/open` | Mark as last opened |
| `GET /api/projects/{id}/status`, `POST …/init` | Branch and initialised flag; create `product/` |
| `GET/POST /api/projects/{id}/entities` | List summaries plus file problems; create (`type`, `title`, `parent` for capabilities) |
| `GET/PUT /api/projects/{id}/entities/{eid}` | Load (with `hash`); save (`base_hash`, `data`) |
| `POST /api/projects/{id}/ids` | Reserve a nested id (`key`, e.g. `AC-01.2`) |
| `GET /api/projects/{id}/git`, `POST …/git/commit` | Pending changes and suggested message; commit selected paths |
| `GET /api/fs/browse` | Server-side folder picker |

## 9. Local-only safety

The server is meant to run on `127.0.0.1` for one user. It rejects requests whose `Host` is not localhost/127.0.0.1 (DNS rebinding) and state-changing requests from foreign `Origin`s (CSRF), because it can write to the user's repositories. There is no authentication.

## 10. Open items (deliberately deferred)

- Approval and change requests: today `status` and `version` are plain fields and any status can be set. "In PO review" and review comments are operational data and will live in the work database.
- Feature status roll-up from capabilities (Foundation Spec §3, open question). It will be computed, never stored.
- Attachments for designs (`design.mockups` / `flows` are plain references for now).
- Slices, ADRs, tech specs, bugs, and the spec linter.
