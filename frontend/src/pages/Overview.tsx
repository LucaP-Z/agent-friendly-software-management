import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, FolderPlus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useEntities, useSchema, useStatus } from '@/hooks/queries'
import { api } from '@/lib/api'

export default function Overview() {
  const { pid = '' } = useParams()
  const qc = useQueryClient()
  const status = useStatus(pid)
  const schema = useSchema()
  const entities = useEntities(pid)
  const init = useMutation({
    mutationFn: () => api.init(pid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status', pid] })
      qc.invalidateQueries({ queryKey: ['entities', pid] })
      qc.invalidateQueries({ queryKey: ['git', pid] })
    },
  })

  if (!status.data) return null
  const { project, initialized } = status.data

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{project.path}</p>
      </div>

      {!initialized ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <FolderPlus className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="font-medium">This repository has no product/ structure yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Initialising creates the folders, a README and the id counter file under <code>product/</code>. Nothing is committed until you press Commit.
          </p>
          {init.error && <p className="mt-3 text-sm text-destructive">{(init.error as Error).message}</p>}
          <Button className="mt-4" disabled={init.isPending} onClick={() => init.mutate()}>
            Initialise product structure
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {schema.data?.types.map((t) => (
              <Link
                key={t.key}
                to={`t/${t.key}`}
                className="rounded-xl border p-4 transition-colors hover:border-foreground/30 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <p className="text-2xl font-semibold">{entities.data?.entities.filter((e) => e.type === t.key).length ?? 0}</p>
                <p className="text-sm text-muted-foreground">{t.key === 'glossary' ? 'Glossary entries' : t.plural}</p>
              </Link>
            ))}
          </div>
          {!!entities.data?.problems.length && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="size-4 text-amber-600" /> Problems in files ({entities.data.problems.length})
              </h2>
              <ul className="flex flex-col gap-1.5">
                {entities.data.problems.map((p, i) => (
                  <li key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                    <span className="font-mono text-xs">{p.path}</span>
                    <p className="text-muted-foreground">{p.message}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">These files are shown as-is and never modified by the platform. Fix them by hand or through the linked entity.</p>
            </section>
          )}
          {entities.data?.entities.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Start with a persona: use the <b>+</b> next to Personas in the sidebar.
            </p>
          )}
        </>
      )}
    </div>
  )
}
