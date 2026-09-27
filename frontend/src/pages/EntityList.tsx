import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { NewEntityDialog } from '@/components/NewEntityDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useEntities, useSchema } from '@/hooks/queries'

export default function EntityList() {
  const { pid = '', type: key = '' } = useParams()
  const schema = useSchema()
  const entities = useEntities(pid)
  const [creating, setCreating] = useState(false)
  const type = schema.data?.types.find((t) => t.key === key)
  if (!type) return schema.data ? <p className="p-8 text-sm text-muted-foreground">Unknown type.</p> : null

  const items = (entities.data?.entities ?? []).filter((e) => e.type === key)
  const title = key === 'glossary' ? 'Glossary entries' : type.plural

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-8 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link to={`/p/${pid}`} className="text-xs text-muted-foreground hover:underline">
            ← Overview
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        {type.parent ? (
          <p className="max-w-56 text-right text-xs text-muted-foreground">Capabilities are created from their feature in the sidebar.</p>
        ) : (
          <Button onClick={() => setCreating(true)}>
            <Plus /> New {type.label.toLowerCase()}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No {title.toLowerCase()} yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {items.map((e) => (
            <li key={e.id}>
              <Link to={`/p/${pid}/e/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{e.id}</span>
                <span className={e.title ? 'min-w-0 flex-1 truncate font-medium' : 'min-w-0 flex-1 truncate italic text-muted-foreground'}>{e.title || 'Untitled'}</span>
                {e.parent && <span className="text-xs text-muted-foreground">in {e.parent}</span>}
                <Badge variant={e.status === 'approved' ? 'default' : 'secondary'}>{e.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <NewEntityDialog pid={pid} type={type} open onOpenChange={(o) => !o && setCreating(false)} />}
    </div>
  )
}
