import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Loader2, Pencil } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FormOutline } from '@/components/FormOutline'
import { SchemaForm } from '@/components/SchemaForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAutosave, type SaveState } from '@/hooks/useAutosave'
import { useEntities, useSchema } from '@/hooks/queries'
import { api, type EntityFull, type TypeInfo } from '@/lib/api'

function SaveIndicator({ state }: { state: SaveState }) {
  const pill = 'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium'
  switch (state.kind) {
    case 'dirty':
      return (
        <span className={`${pill} bg-amber-500/15 text-amber-700 dark:text-amber-400`}>
          <Pencil className="size-3" /> Unsaved changes…
        </span>
      )
    case 'saving':
      return (
        <span className={`${pill} bg-sky-500/15 text-sky-700 dark:text-sky-400`}>
          <Loader2 className="size-3 animate-spin" /> Saving…
        </span>
      )
    case 'saved':
      return (
        <span className={`${pill} bg-emerald-500/15 text-emerald-700 dark:text-emerald-400`}>
          <CheckCircle2 className="size-3" /> Saved to file · {new Date(state.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      )
    case 'error':
      return (
        <span className={`${pill} bg-destructive/15 text-destructive`} title={state.message}>
          <AlertTriangle className="size-3" /> Not saved
        </span>
      )
    case 'conflict':
      return (
        <span className={`${pill} bg-orange-500/15 text-orange-700 dark:text-orange-400`}>
          <AlertTriangle className="size-3" /> Conflict — autosave paused
        </span>
      )
    default:
      return <span className={`${pill} bg-muted text-muted-foreground`}>Autosave on</span>
  }
}

function Editor({ pid, initial, latest, type }: { pid: string; initial: EntityFull; latest?: EntityFull; type: TypeInfo }) {
  const schema = useSchema()
  const entities = useEntities(pid)
  const { draft, edit, state, offer, reloadFromDisk, overwrite, retry } = useAutosave(pid, initial)

  useEffect(() => {
    if (latest) offer(latest)
  }, [latest, offer])

  const parent = initial.parent
  return (
    <div className="mx-auto flex max-w-5xl gap-10 px-8 py-8">
      <div className="flex min-w-0 max-w-3xl flex-1 flex-col gap-5">
        <div id="entity-overview" className="flex flex-col gap-2">
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
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <p>{state.message}</p>
            <Button size="sm" variant="outline" onClick={retry} className="shrink-0">
              Retry
            </Button>
          </div>
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
      <FormOutline schema={type.schema} draft={draft} className="sticky top-8 hidden w-48 shrink-0 self-start lg:flex" />
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
