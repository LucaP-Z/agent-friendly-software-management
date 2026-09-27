import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api, type TypeInfo } from '@/lib/api'
import { guardedNavigate } from '@/lib/unsavedGuard'

/** Creating asks for a title first: it becomes the file's slug, which stays fixed afterwards. */
export function NewEntityDialog({ pid, type, parent, open, onOpenChange }: { pid: string; type: TypeInfo; parent?: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState('')
  const nav = useNavigate()
  const qc = useQueryClient()
  const create = useMutation({
    mutationFn: () => api.create(pid, type.key, title.trim(), parent),
    onSuccess: (e) => {
      qc.invalidateQueries({ queryKey: ['entities', pid] })
      qc.invalidateQueries({ queryKey: ['git', pid] })
      setTitle('')
      onOpenChange(false)
      guardedNavigate(() => nav(`/p/${pid}/e/${e.id}`))
    },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {type.label.toLowerCase()}</DialogTitle>
          <DialogDescription>
            The title is used for the file name ({type.prefix}-NN-title.md). The file name stays the same if you rename it later.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim() && !create.isPending) create.mutate()
          }}
        >
          <Input autoFocus placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          {create.error && <p className="text-sm text-destructive">{(create.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
