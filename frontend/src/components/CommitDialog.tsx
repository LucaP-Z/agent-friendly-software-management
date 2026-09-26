import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GitBranch } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useGit } from '@/hooks/queries'
import { api } from '@/lib/api'

const NEW = '__new__'
const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

export function CommitDialog({ pid, open, onOpenChange }: { pid: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const git = useGit(pid)
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [branchChoice, setBranchChoice] = useState<string | null>(null) // null = stay on the current branch
  const [newName, setNewName] = useState('')

  const current = git.data?.branch ?? ''
  const changes = git.data?.changes ?? []
  const selected = changes.filter((c) => !skipped.has(c.path)).map((c) => c.path)
  const text = message ?? git.data?.suggested_message ?? ''
  const choice = branchChoice ?? current
  const creating = choice === NEW
  const target = creating ? newName.trim() : choice
  const switching = !!target && target !== current

  const commit = useMutation({
    mutationFn: () => api.commit(pid, text, selected, switching ? target : undefined, creating),
    onSuccess: (r) => {
      toast.success(`Committed ${r.commit}${switching ? ` on ${target}` : ''}`)
      setMessage(null)
      setSkipped(new Set())
      setBranchChoice(null)
      setNewName('')
      for (const key of ['git', 'status', 'entities']) qc.invalidateQueries({ queryKey: [key, pid] })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Commit changes</DialogTitle>
          <DialogDescription>Edits are saved to files automatically. Committing records the files you select in git; nothing is pushed.</DialogDescription>
        </DialogHeader>
        {changes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No uncommitted changes under product/</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Files to commit</Label>
              <ul className="max-h-48 overflow-y-auto rounded-lg border">
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
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="commit-branch" className="flex items-center gap-1.5">
                <GitBranch className="size-3.5" /> Branch
              </Label>
              <select id="commit-branch" className={selectClass} value={choice} onChange={(e) => setBranchChoice(e.target.value)}>
                {(git.data?.branches ?? []).map((b) => (
                  <option key={b} value={b}>
                    {b}
                    {b === current ? ' (current)' : ''}
                  </option>
                ))}
                <option value={NEW}>＋ New branch…</option>
              </select>
              {creating && <Input autoFocus placeholder="new-branch-name, e.g. spec/invoicing" value={newName} onChange={(e) => setNewName(e.target.value)} />}
              {switching && (
                <p className="text-xs text-muted-foreground">
                  {creating ? 'Creates' : 'Switches to'} <b>{target}</b> first; your files stay as they are and move with you.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="commit-message">Commit message</Label>
              <Textarea id="commit-message" rows={2} value={text} onChange={(e) => setMessage(e.target.value)} />
            </div>

            {commit.error && <p className="text-sm text-destructive">{(commit.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={!selected.length || !text.trim() || !target || commit.isPending} onClick={() => commit.mutate()}>
                Commit {selected.length} file{selected.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
