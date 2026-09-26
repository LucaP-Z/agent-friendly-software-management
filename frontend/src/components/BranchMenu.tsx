import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, GitBranch, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Header control: shows the current branch and lets you `git switch` to another local branch. */
export function BranchMenu({ pid, current, branches }: { pid: string; current: string; branches: string[] }) {
  const qc = useQueryClient()
  const list = branches.includes(current) ? branches : [current, ...branches].filter((b) => b !== '(detached)')

  const sw = useMutation({
    mutationFn: (name: string) => api.switchBranch(pid, name),
    onSuccess: (r) => {
      toast.success(`Switched to ${r.branch}`)
      // files on disk can differ between branches: reload everything for this project
      qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === pid })
    },
    onError: (e, name) =>
      // git's message says which files are in the way; no fix is offered here
      toast.error(`Couldn't switch to ${name}`, { description: <span className="whitespace-pre-line font-mono text-xs">{(e as Error).message}</span>, duration: 12000 }),
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Branch: ${current}. Switch branch`}
        disabled={sw.isPending}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'max-w-64 rounded-full font-mono text-xs')}
      >
        {sw.isPending ? <Loader2 className="animate-spin" /> : <GitBranch />}
        <span className="truncate">{sw.isPending ? `Switching to ${sw.variables}…` : current}</span>
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {list.map((b) => (
          <DropdownMenuItem key={b} className="font-mono text-xs" onClick={() => b !== current && sw.mutate(b)}>
            {b === current ? <Check /> : <span className="size-4" />}
            <span className="truncate">{b}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
