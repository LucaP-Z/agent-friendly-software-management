export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = json?.detail
    const msg = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : res.statusText
    throw new ApiError(res.status, msg)
  }
  return json as T
}

export type Project = {
  id: string
  name: string
  path: string
  added_at: string
  last_opened: string | null
  exists?: boolean
}

export type Summary = {
  id: string
  type: string
  title: string
  status: string
  path: string
  parent: string | null
}

export type EntityFull = Summary & { hash: string; data: Record<string, any> }
export type Problem = { path: string; message: string; kind: string }
export type Change = { path: string; status: 'added' | 'modified' | 'deleted'; added: number; removed: number }
export type FileDiff = { path: string; diff: string; truncated: boolean }
export type GitStatus = { branch: string; branches: string[]; changes: Change[]; suggested_message: string }
export type FolderListing = {
  path: string
  parent: string | null
  is_git_root: boolean
  entries: { name: string; path: string; is_git_repo: boolean }[]
}

export type JsonSchema = {
  type?: string
  title?: string
  description?: string
  default?: any
  enum?: string[]
  pattern?: string
  nullable?: boolean
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  [k: `x-${string}`]: any
}
export type TypeInfo = {
  key: string
  label: string
  plural: string
  prefix: string
  parent: string | null
  schema: JsonSchema
}
export type SchemaDoc = { types: TypeInfo[]; standard_edge_categories: string[] }

const p = (id: string) => `/api/projects/${id}`

export const api = {
  schema: () => req<SchemaDoc>('GET', '/api/schema'),
  projects: () => req<Project[]>('GET', '/api/projects'),
  linkProject: (path: string, name?: string) => req<Project>('POST', '/api/projects', { path, name: name || null }),
  unlinkProject: (id: string) => req<void>('DELETE', p(id)),
  openProject: (id: string) => req<Project>('POST', `${p(id)}/open`),
  status: (id: string) => req<{ project: Project; initialized: boolean; branch: string }>('GET', `${p(id)}/status`),
  init: (id: string) => req<{ created: string[] }>('POST', `${p(id)}/init`),
  entities: (id: string) => req<{ entities: Summary[]; problems: Problem[] }>('GET', `${p(id)}/entities`),
  entity: (id: string, eid: string) => req<EntityFull>('GET', `${p(id)}/entities/${eid}`),
  create: (id: string, type: string, title: string, parent?: string) =>
    req<EntityFull>('POST', `${p(id)}/entities`, { type, title, parent: parent ?? null }),
  save: (id: string, eid: string, base_hash: string, data: unknown) =>
    req<EntityFull & { changed: boolean }>('PUT', `${p(id)}/entities/${eid}`, { base_hash, data }),
  allocate: (id: string, key: string) => req<{ id: string }>('POST', `${p(id)}/ids`, { key }),
  git: (id: string) => req<GitStatus>('GET', `${p(id)}/git`),
  switchBranch: (id: string, branch: string) => req<{ branch: string }>('POST', `${p(id)}/git/switch`, { branch }),
  gitDiff: (id: string, path: string) => req<FileDiff>('GET', `${p(id)}/git/diff?path=${encodeURIComponent(path)}`),
  commit: (id: string, message: string, paths: string[], branch?: string, createBranch = false) =>
    req<{ commit: string }>('POST', `${p(id)}/git/commit`, { message, paths, branch: branch ?? null, create_branch: createBranch }),
  browse: (path?: string) => req<FolderListing>('GET', `/api/fs/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),
}

const LAST = 'afsp:lastProject'
export const lastProject = {
  get: () => {
    try {
      return localStorage.getItem(LAST)
    } catch {
      return null
    }
  },
  set: (id: string) => {
    try {
      localStorage.setItem(LAST, id)
    } catch {
      /* private mode etc. */
    }
  },
}
