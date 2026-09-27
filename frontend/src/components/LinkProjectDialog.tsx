import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, type FolderListing, type Project } from '@/lib/api'
import { FolderBrowser } from './FolderBrowser'

export function LinkProjectDialog({ open, onOpenChange, onLinked }: { open: boolean; onOpenChange: (o: boolean) => void; onLinked: (p: Project) => void }) {
  const qc = useQueryClient()
  const [where, setWhere] = useState<FolderListing | null>(null)
  const [name, setName] = useState('')
  const repo = where?.is_git_root ? where : null
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.projects })
  const existing = repo ? projects.data?.find((p) => p.path === repo.path) : undefined
  const folderName = repo?.path.split('/').filter(Boolean).pop()

  const link = useMutation({
    mutationFn: () => api.linkProject(repo!.path, name.trim()),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setName('')
      onOpenChange(false)
      onLinked(p)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Add a project</DialogTitle>
          <DialogDescription>Choose the folder of a git repository on this computer. Nothing in it changes until you edit something.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {open && <FolderBrowser onLocation={setWhere} />}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repo-name">Name (optional)</Label>
            <Input id="repo-name" placeholder={folderName ?? 'Defaults to the folder name'} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {existing && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              This repository is already a project (“{existing.name}”).
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false)
                  onLinked(existing)
                }}
              >
                Open it
              </Button>
            </p>
          )}
          {link.error && <p className="text-sm text-destructive">{(link.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!repo || !!existing || link.isPending} onClick={() => link.mutate()}>
              {existing ? 'Already added' : repo ? `Add “${folderName}”` : 'Choose a git repository'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
