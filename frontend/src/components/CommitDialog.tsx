import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, GitBranch } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AutoTextarea } from '@/components/AutoTextarea'
import { DiffView } from '@/components/DiffView'
import { useGit } from '@/hooks/queries'
import { api, type Change } from '@/lib/api'
import { cn } from '@/lib/utils'

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const current = git.data?.branch ?? ''
  const changes = git.data?.changes ?? []
  const selected = changes.filter((c) => !skipped.has(c.path)).map((c) => c.path)
  const text = message ?? git.data?.suggested_message ?? ''
  const choice = branchChoice ?? current
  const creating = choice === NEW
  const target = creating ? newName.trim() : choice
  const switching = !!target && target !== current

  const canCommit = selected.length > 0 && !!text.trim() && !!target

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
      <DialogContent
        className="sm:max-w-2xl [&>*]:min-w-0"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canCommit) {
            e.preventDefault()
            commit.mutate()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Commit changes</DialogTitle>
          <DialogDescription>Edits are saved to files automatically. Committing records the files you select in git; nothing is pushed.</DialogDescription>
        </DialogHeader>
        {changes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No uncommitted changes under product/</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center">
                <Label>Files to commit</Label>
                <span className="ml-auto text-xs text-muted-foreground">
                  {selected.length} of {changes.length} selected
                </span>
              </div>
              <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
                {changes.map((c) => {
                  const open = expanded.has(c.path)
                  return (
                    <li key={c.path}>
                      <div className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50">
                        <input
                          type="checkbox"
                          aria-label={`Include ${c.path}`}
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
                        <StatusLetter status={c.status} />
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={`${open ? 'Hide' : 'Show'} changes in ${c.path}`}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          onClick={() =>
                            setExpanded((s) => {
                              const n = new Set(s)
                              if (n.has(c.path)) n.delete(c.path)
                              else n.add(c.path)
                              return n
                            })
                          }
                        >
                          <span className="min-w-0 flex-1 truncate font-mono text-xs">{c.path}</span>
                          <Counts c={c} />
                          {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                        </button>
                      </div>
                      {open && (
                        <div className="border-t bg-muted/30">
                          <DiffView pid={pid} path={c.path} stamp={`${c.status}:${c.added}:${c.removed}`} />
                        </div>
                      )}
                    </li>
                  )
                })}
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
              {creating && (
                <Input aria-label="New branch name" autoFocus placeholder="new-branch-name, e.g. spec/invoicing" value={newName} onChange={(e) => setNewName(e.target.value)} />
              )}
              {switching && (
                <p className="text-xs text-muted-foreground">
                  {creating ? 'Creates' : 'Switches to'} <b>{target}</b> first; your files stay as they are and move with you.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="commit-message">Commit message</Label>
              <AutoTextarea id="commit-message" minRows={2} value={text} onChange={(e) => setMessage(e.target.value)} />
            </div>

            {commit.error && <p className="text-sm text-destructive">{(commit.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={!canCommit || commit.isPending} onClick={() => commit.mutate()}>
                Commit {selected.length} file{selected.length === 1 ? '' : 's'}
                <kbd className="ml-1 rounded bg-primary-foreground/20 px-1.5 py-0.5 font-mono text-[11px]">⌘⏎</kbd>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const LETTER = {
  modified: { l: 'M', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300', label: 'Modified' },
  added: { l: 'A', cls: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300', label: 'Added' },
  deleted: { l: 'D', cls: 'bg-red-500/15 text-red-800 dark:text-red-300', label: 'Deleted' },
} as const

function StatusLetter({ status }: { status: Change['status'] }) {
  const s = LETTER[status]
  return (
    <span title={s.label} aria-label={s.label} className={cn('flex size-[18px] shrink-0 items-center justify-center rounded font-mono text-[10.5px] font-semibold', s.cls)}>
      {s.l}
    </span>
  )
}

function Counts({ c }: { c: Change }) {
  return (
    <span className="shrink-0 font-mono text-xs tabular-nums">
      {c.added > 0 && <span className="text-emerald-700 dark:text-emerald-400">+{c.added}</span>}
      {c.added > 0 && c.removed > 0 && ' '}
      {c.removed > 0 && <span className="text-red-700 dark:text-red-400">−{c.removed}</span>}
    </span>
  )
}
