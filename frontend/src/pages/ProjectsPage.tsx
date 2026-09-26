import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, FolderGit2, Plus, Unlink } from 'lucide-react'
import { useState } from 'react'
import { LinkProjectDialog } from '@/components/LinkProjectDialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useOpenProject } from '@/hooks/useOpenProject'
import { api, lastProject, type Project } from '@/lib/api'

export default function ProjectsPage() {
  const qc = useQueryClient()
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.projects })
  const [linking, setLinking] = useState(false)
  const open = useOpenProject()
  const unlink = useMutation({
    mutationFn: (p: Project) => api.unlinkProject(p.id),
    onSuccess: (_, p) => {
      if (lastProject.get() === p.id) localStorage.removeItem('afsp:lastProject')
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">Each project is a local git repository holding a <code>product/</code> folder.</p>
        </div>
        <Button onClick={() => setLinking(true)}>
          <Plus /> Link repository
        </Button>
      </header>

      {projects.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {projects.error && <p className="text-sm text-destructive">{(projects.error as Error).message}. Is the backend running on port 8000?</p>}
      {projects.data?.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <FolderGit2 className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="font-medium">No repositories linked yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Link a local git repository to start defining your product.</p>
          <Button className="mt-4" onClick={() => setLinking(true)}>
            <Plus /> Link repository
          </Button>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {projects.data?.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl border p-4">
            <FolderGit2 className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{p.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{p.path}</p>
              {p.exists === false && (
                <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="size-3" /> Folder no longer exists
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" disabled={p.exists === false} onClick={() => open(p.id)}>
              Open
            </Button>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Unlink ${p.name}`}
                    onClick={() => confirm(`Unlink "${p.name}"? The repository and its files are left untouched.`) && unlink.mutate(p)}
                  />
                }
              >
                <Unlink />
              </TooltipTrigger>
              <TooltipContent side="bottom">Unlink from this app. Your repository and its files are not deleted.</TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ul>
      <LinkProjectDialog open={linking} onOpenChange={setLinking} onLinked={(p) => open(p.id)} />
    </div>
  )
}
