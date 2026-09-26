import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronRight, FolderGit2, GitCommitHorizontal, Plus, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom'
import { BranchMenu } from '@/components/BranchMenu'
import { CommitDialog } from '@/components/CommitDialog'
import { NewEntityDialog } from '@/components/NewEntityDialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useEntities, useGit, useSchema, useStatus } from '@/hooks/queries'
import { api, lastProject, type Summary, type TypeInfo } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useOpenProject } from '@/hooks/useOpenProject'

function EntityLink({ e, indent }: { e: Summary; indent?: boolean }) {
  return (
    <NavLink
      to={`e/${e.id}`}
      className={({ isActive }) =>
        cn('flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted', indent && 'ml-4', isActive && 'bg-muted font-medium')
      }
    >
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{e.id}</span>
      <span className={cn('truncate', !e.title && 'italic text-muted-foreground')}>{e.title || 'Untitled'}</span>
      {e.status !== 'draft' && <span className="ml-auto text-[10px] uppercase text-muted-foreground">{e.status}</span>}
    </NavLink>
  )
}

function Section({ pid, type, entities, capType }: { pid: string; type: TypeInfo; entities: Summary[]; capType?: TypeInfo }) {
  const [creating, setCreating] = useState<{ type: TypeInfo; parent?: string } | null>(null)
  const items = entities.filter((e) => e.type === type.key)
  return (
    <div className="mb-3">
      <div className="mb-0.5 flex items-center justify-between px-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{type.plural}</span>
        <Button variant="ghost" size="icon-xs" aria-label={`New ${type.label.toLowerCase()}`} onClick={() => setCreating({ type })}>
          <Plus />
        </Button>
      </div>
      {items.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">None yet</p>}
      {items.map((e) => (
        <div key={e.id}>
          <EntityLink e={e} />
          {capType &&
            entities
              .filter((c) => c.type === 'capability' && c.parent === e.id)
              .map((c) => <EntityLink key={c.id} e={c} indent />)}
          {capType && (
            <button
              type="button"
              className="ml-4 flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setCreating({ type: capType, parent: e.id })}
            >
              <Plus className="size-3" /> capability
            </button>
          )}
        </div>
      ))}
      {creating && <NewEntityDialog pid={pid} type={creating.type} parent={creating.parent} open onOpenChange={(o) => !o && setCreating(null)} />}
    </div>
  )
}

export default function ProjectLayout() {
  const { pid = '' } = useParams()
  const nav = useNavigate()
  const openProject = useOpenProject()
  const [committing, setCommitting] = useState(false)
  const status = useStatus(pid)
  const schema = useSchema()
  const entities = useEntities(pid)
  const git = useGit(pid)
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.projects })

  useEffect(() => {
    if (status.data) lastProject.set(pid)
  }, [status.data, pid])

  if (status.error) return <Navigate to="/projects" replace />
  const types = schema.data?.types ?? []
  const byKey = new Map(types.map((t) => [t.key, t]))
  const initialized = status.data?.initialized
  const pending = git.data?.changes.length ?? 0

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <Link to="/projects" className="text-sm font-semibold tracking-tight">
          AFSP
        </Link>
        <ChevronRight className="size-4 text-muted-foreground" />
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'max-w-64')}>
            <FolderGit2 />
            <span className="truncate">{status.data?.project.name ?? '…'}</span>
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-64">
            {projects.data?.map((p) => (
              <DropdownMenuItem key={p.id} disabled={p.exists === false} onClick={() => p.id !== pid && openProject(p.id)}>
                {p.id === pid ? <Check /> : <span className="size-4" />}
                <span className="truncate">{p.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => nav('/projects')}>
              <Settings2 /> Manage projects…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {status.data && <BranchMenu pid={pid} current={status.data.branch} branches={git.data?.branches ?? []} />}
        <div className="ml-auto">
          <Button variant={pending ? 'default' : 'outline'} size="sm" disabled={!initialized} onClick={() => setCommitting(true)}>
            <GitCommitHorizontal /> Commit{pending ? ` (${pending})` : ''}
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 overflow-y-auto border-r p-3">
          <NavLink to="." end className={({ isActive }) => cn('mb-3 block rounded-md px-2 py-1 text-sm hover:bg-muted', isActive && 'bg-muted font-medium')}>
            Overview
          </NavLink>
          {initialized &&
            ['persona', 'need', 'feature', 'constraint', 'enabler', 'glossary']
              .map((k) => byKey.get(k))
              .filter((t): t is TypeInfo => !!t)
              .map((t) => <Section key={t.key} pid={pid} type={t} entities={entities.data?.entities ?? []} capType={t.key === 'feature' ? byKey.get('capability') : undefined} />)}
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <CommitDialog pid={pid} open={committing} onOpenChange={setCommitting} />
    </div>
  )
}
