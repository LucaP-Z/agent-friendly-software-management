import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SchemaForm } from '@/components/SchemaForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAutosave, type SaveState } from '@/hooks/useAutosave'
import { useEntities, useSchema } from '@/hooks/queries'
import { api, type EntityFull, type TypeInfo } from '@/lib/api'

function SaveIndicator({ state }: { state: SaveState }) {
  const base = 'flex items-center gap-1.5 text-xs'
  if (state.kind === 'saving')
    return (
      <span className={`${base} text-muted-foreground`}>
        <Loader2 className="size-3 animate-spin" /> Saving…
      </span>
    )
  if (state.kind === 'saved')
    return (
      <span className={`${base} text-emerald-600`}>
        <CheckCircle2 className="size-3" /> Saved to file
      </span>
    )
  if (state.kind === 'error')
    return (
      <span className={`${base} text-destructive`} title={state.message}>
        <AlertTriangle className="size-3" /> Not saved
      </span>
    )
  if (state.kind === 'conflict')
    return (
      <span className={`${base} text-amber-600`}>
        <AlertTriangle className="size-3" /> Conflict
      </span>
    )
  return <span className={`${base} text-muted-foreground`}>Autosave on</span>
}

function Editor({ pid, initial, latest, type }: { pid: string; initial: EntityFull; latest?: EntityFull; type: TypeInfo }) {
  const schema = useSchema()
  const entities = useEntities(pid)
  const { draft, edit, state, offer, reloadFromDisk, overwrite } = useAutosave(pid, initial)

  useEffect(() => {
    if (latest) offer(latest)
  }, [latest, offer])

  const parent = initial.parent
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-8 py-8">
      <div className="flex flex-col gap-2">
        {parent && (
          <Link to={`../e/${parent}`} className="text-xs text-muted-foreground hover:underline">
            ← {parent}
          </Link>
        )}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono">{initial.id}</Badge>
          <span className="text-xs text-muted-foreground">{type.label}</span>
          <span className="ml-auto">
            <SaveIndicator state={state} />
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{draft.title || <span className="text-muted-foreground">Untitled</span>}</h1>
        <p className="font-mono text-xs text-muted-foreground">{initial.path}</p>
      </div>

      {state.kind === 'conflict' && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p>
            <b>This file changed on disk</b> (edited by hand, by git or by an agent) since you opened it. Autosave is paused.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void reloadFromDisk()}>
              Load the disk version (discard my edits)
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void overwrite()}>
              Overwrite with my version
            </Button>
          </div>
        </div>
      )}
      {state.kind === 'error' && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {state.message}
        </p>
      )}

      <SchemaForm
        schema={type.schema}
        value={draft}
        onChange={edit}
        ctx={{
          entityId: initial.id,
          entities: entities.data?.entities ?? [],
          root: draft,
          standardCategories: schema.data?.standard_edge_categories ?? [],
          allocate: async (key) => (await api.allocate(pid, key)).id,
        }}
      />
    </div>
  )
}

export default function EntityPage() {
  const { pid = '', eid = '' } = useParams()
  const schema = useSchema()
  // No cache: an editor must start from what is on disk right now.
  const q = useQuery({ queryKey: ['entity', pid, eid], queryFn: () => api.entity(pid, eid), gcTime: 0, staleTime: 0, refetchOnWindowFocus: 'always', retry: false })

  if (q.error) return <p className="p-8 text-sm text-destructive">{(q.error as Error).message}</p>
  const type = schema.data?.types.find((t) => t.key === q.data?.type)
  if (!q.data || !type) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>
  return <Editor key={`${pid}/${eid}`} pid={pid} initial={q.data} latest={q.data} type={type} />
}
