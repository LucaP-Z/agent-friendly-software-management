import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, type Project } from '@/lib/api'
import { FolderBrowser } from './FolderBrowser'

export function LinkProjectDialog({ open, onOpenChange, onLinked }: { open: boolean; onOpenChange: (o: boolean) => void; onLinked: (p: Project) => void }) {
  const qc = useQueryClient()
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [browsing, setBrowsing] = useState(false)
  const link = useMutation({
    mutationFn: () => api.linkProject(path.trim(), name.trim()),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setPath('')
      setName('')
      onOpenChange(false)
      onLinked(p)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link a git repository</DialogTitle>
          <DialogDescription>Paste the absolute path of a local repository, or browse for it. The platform never modifies the repository until you edit something.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repo-path">Repository path</Label>
            <div className="flex gap-2">
              <Input id="repo-path" placeholder="/Users/you/code/my-product" value={path} onChange={(e) => setPath(e.target.value)} />
              <Button variant="outline" type="button" onClick={() => setBrowsing((b) => !b)}>
                Browse…
              </Button>
            </div>
          </div>
          {browsing && (
            <FolderBrowser
              start={path.startsWith('/') ? path : undefined}
              onPick={(p) => {
                setPath(p)
                setBrowsing(false)
              }}
            />
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repo-name">Display name (optional)</Label>
            <Input id="repo-name" placeholder="Defaults to the folder name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {link.error && <p className="text-sm text-destructive">{(link.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!path.trim() || link.isPending} onClick={() => link.mutate()}>
              Link repository
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
