import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useGit } from '@/hooks/queries'
import { api } from '@/lib/api'

export function CommitDialog({ pid, open, onOpenChange }: { pid: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const git = useGit(pid)
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const changes = git.data?.changes ?? []
  const selected = changes.filter((c) => !skipped.has(c.path)).map((c) => c.path)
  const text = message ?? git.data?.suggested_message ?? ''

  const commit = useMutation({
    mutationFn: () => api.commit(pid, text, selected),
    onSuccess: (r) => {
      toast.success(`Committed ${r.commit}`)
      setMessage(null)
      setSkipped(new Set())
      qc.invalidateQueries({ queryKey: ['git', pid] })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Commit changes</DialogTitle>
          <DialogDescription>
            Edits are saved to files automatically. Committing records the selected files on <b>{git.data?.branch ?? '…'}</b>; nothing is pushed.
          </DialogDescription>
        </DialogHeader>
        {changes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No uncommitted changes under product/</p>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="max-h-56 overflow-y-auto rounded-lg border">
              {changes.map((c) => (
                <li key={c.path}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={!skipped.has(c.path)}
                      onChange={(e) =>
                        setSkipped((s) => {
                          const n = new Set(s)
                          if (e.target.checked) n.delete(c.path)
                          else n.add(c.path)
                          return n
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{c.path}</span>
                    <Badge variant={c.status === 'deleted' ? 'destructive' : 'secondary'}>{c.status}</Badge>
                  </label>
                </li>
              ))}
            </ul>
            <Textarea rows={2} value={text} onChange={(e) => setMessage(e.target.value)} aria-label="Commit message" />
            {commit.error && <p className="text-sm text-destructive">{(commit.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={!selected.length || !text.trim() || commit.isPending} onClick={() => commit.mutate()}>
                Commit {selected.length} file{selected.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
