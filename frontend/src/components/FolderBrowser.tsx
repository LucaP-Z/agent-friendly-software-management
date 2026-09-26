import { useQuery } from '@tanstack/react-query'
import { ArrowUp, Folder, GitBranch } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

/** Server-side folder picker: browsers cannot reveal real folder paths, so the backend lists them. */
export function FolderBrowser({ start, onPick }: { start?: string; onPick: (path: string) => void }) {
  const [path, setPath] = useState<string | undefined>(start || undefined)
  const q = useQuery({ queryKey: ['browse', path], queryFn: () => api.browse(path), retry: false })
  const d = q.data

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label="Parent folder" disabled={!d?.parent} onClick={() => d?.parent && setPath(d.parent)}>
          <ArrowUp />
        </Button>
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{d?.path ?? '…'}</code>
        <Button size="sm" disabled={!d?.is_git_root} onClick={() => d && onPick(d.path)}>
          <GitBranch /> Use this repository
        </Button>
      </div>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && !d.is_git_root && <p className="text-xs text-muted-foreground">Open a folder that is the root of a git repository (it shows a branch icon).</p>}
      <ul className="max-h-64 overflow-y-auto rounded-lg border">
        {d?.entries.length === 0 && <li className="p-3 text-sm text-muted-foreground">No sub-folders</li>}
        {d?.entries.map((e) => (
          <li key={e.path}>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => setPath(e.path)}>
              {e.is_git_repo ? <GitBranch className="size-4 text-emerald-600" /> : <Folder className="size-4 text-muted-foreground" />}
              {e.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
