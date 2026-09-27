import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChevronRight, CornerLeftUp, Folder, GitBranch } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { api, type FolderListing } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * One control: shows where you are, lists the folders inside, and tells you whether
 * this folder is a git repository. Click a folder to open it; type or paste a path
 * and press Enter to jump. The parent decides what to do with the current folder.
 */
export function FolderBrowser({ onLocation }: { onLocation: (l: FolderListing | null) => void }) {
  const [path, setPath] = useState<string | undefined>(undefined)
  const [typed, setTyped] = useState<string | null>(null) // null = show the current folder
  const q = useQuery({ queryKey: ['browse', path], queryFn: () => api.browse(path), retry: false })
  const d = q.data

  useEffect(() => {
    onLocation(d ?? null)
  }, [d, onLocation])

  const go = (p: string | undefined) => {
    setTyped(null)
    setPath(p)
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        aria-label="Folder path"
        className="font-mono text-xs"
        value={typed ?? d?.path ?? ''}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), go((typed ?? '').trim() || undefined))}
        placeholder="Type or paste a path, then press Enter"
      />
      {q.error ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : (
        d && (
          <p className={cn('flex items-center gap-1.5 text-sm', d.is_git_root ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
            {d.is_git_root ? <CheckCircle2 className="size-4" /> : <Folder className="size-4" />}
            {d.is_git_root ? 'This folder is a git repository' : 'Not a git repository — open a folder marked "Git repo"'}
          </p>
        )
      )}
      <ul className="h-64 overflow-y-auto rounded-lg border">
        {d?.parent && (
          <li>
            <button type="button" className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted" onClick={() => go(d.parent!)}>
              <CornerLeftUp className="size-4" /> Parent folder
            </button>
          </li>
        )}
        {d?.entries.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No folders here</li>}
        {d?.entries.map((e) => (
          <li key={e.path}>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => go(e.path)}>
              {e.is_git_repo ? <GitBranch className="size-4 shrink-0 text-emerald-600" /> : <Folder className="size-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              {e.is_git_repo && <Badge variant="secondary">Git repo</Badge>}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
