import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Unified diff hunks of one pending file. Refetched whenever the file's line counts change. */
export function DiffView({ pid, path, stamp }: { pid: string; path: string; stamp: string }) {
  const q = useQuery({ queryKey: ['diff', pid, path, stamp], queryFn: () => api.gitDiff(pid, path), gcTime: 0, retry: false })
  if (q.isLoading) return <p className="px-3 py-2 text-xs text-muted-foreground">Loading diff…</p>
  if (q.error) return <p className="px-3 py-2 text-xs text-destructive">{(q.error as Error).message}</p>
  const text = q.data?.diff ?? ''
  if (!text) return <p className="px-3 py-2 text-xs text-muted-foreground">No text changes to show.</p>
  return (
    <div>
      <pre className="max-h-64 overflow-auto py-1.5 font-mono text-[11.5px] leading-[1.7]" aria-label={`Changes in ${path}`}>
        {text.split('\n').map((line, i) => {
          const sign = line[0]
          return (
            <div
              key={i}
              className={cn(
                'flex gap-2.5 px-3',
                sign === '+' && 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
                sign === '-' && 'bg-red-500/10 text-red-800 dark:text-red-300',
                sign === '@' && 'text-muted-foreground',
                sign !== '+' && sign !== '-' && sign !== '@' && 'text-muted-foreground',
              )}
            >
              <span className="w-2.5 shrink-0 select-none">{sign === '+' || sign === '-' ? sign : ''}</span>
              <span className="whitespace-pre">{sign === '+' || sign === '-' ? line.slice(1) : sign === '@' ? line : line.slice(1)}</span>
            </div>
          )
        })}
      </pre>
      {q.data?.truncated && <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">Diff truncated: the file is large.</p>}
    </div>
  )
}
