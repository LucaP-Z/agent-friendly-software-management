import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api, type EntityFull } from '@/lib/api'
import { setUnsavedGuard } from '@/lib/unsavedGuard'

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'dirty' } // edited, waiting for the debounce
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string }
  | { kind: 'conflict' }

const DEBOUNCE_MS = 800

/**
 * Autosaves the draft to the entity's file (debounced, one save in flight at a time).
 * Every save carries the hash of the file version it was based on; if the file changed
 * on disk meanwhile the server answers 409 and saving pauses until the user chooses.
 */
export function useAutosave(pid: string, initial: EntityFull) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Record<string, any>>(initial.data)
  const [state, setState] = useState<SaveState>({ kind: 'idle' })

  const draftRef = useRef(initial.data)
  const hashRef = useRef(initial.hash)
  const known = useRef(new Set([initial.hash])) // hashes this editor has seen or produced
  const dirty = useRef(false)
  const saving = useRef(false)
  const paused = useRef(false)
  const again = useRef(false) // a save was requested while one was in flight
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const save = useCallback(async () => {
    if (saving.current) {
      again.current = true
      return
    }
    if (!dirty.current || paused.current) return
    again.current = false
    saving.current = true
    dirty.current = false
    setState({ kind: 'saving' })
    try {
      const res = await api.save(pid, initial.id, hashRef.current, draftRef.current)
      hashRef.current = res.hash
      known.current.add(res.hash)
      setState(dirty.current ? { kind: 'dirty' } : { kind: 'saved', at: Date.now() })
      qc.invalidateQueries({ queryKey: ['entities', pid] })
      qc.invalidateQueries({ queryKey: ['git', pid] })
    } catch (e) {
      dirty.current = true
      if (e instanceof ApiError && e.status === 409) {
        paused.current = true
        setState({ kind: 'conflict' })
      } else {
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    } finally {
      saving.current = false
      // Only retry if new edits arrived meanwhile; a failed save waits for the next edit.
      if (again.current && dirty.current && !paused.current) void save()
    }
  }, [pid, initial.id, qc])

  const edit = useCallback(
    (next: Record<string, any>) => {
      draftRef.current = next
      setDraft(next)
      dirty.current = true
      if (paused.current) return
      setState({ kind: 'dirty' })
      clearTimeout(timer.current)
      timer.current = setTimeout(() => ((timer.current = undefined), void save()), DEBOUNCE_MS)
    },
    [save],
  )

  const adopt = useCallback((e: EntityFull) => {
    clearTimeout(timer.current)
    timer.current = undefined
    hashRef.current = e.hash
    known.current.add(e.hash)
    draftRef.current = e.data
    dirty.current = false
    paused.current = false
    setDraft(e.data)
    setState({ kind: 'idle' })
  }, [])

  /** Called with fresh server data (e.g. after window focus): take over external edits if we have none pending. */
  const offer = useCallback(
    (fresh: EntityFull) => {
      if (known.current.has(fresh.hash) || dirty.current || saving.current) return
      adopt(fresh)
    },
    [adopt],
  )

  /** Bypasses the debounce: used by the header's Retry button and the leave-page confirmation. */
  const retry = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
    void save()
  }, [save])

  const reloadFromDisk = useCallback(async () => adopt(await api.entity(pid, initial.id)), [adopt, pid, initial.id])

  const overwrite = useCallback(async () => {
    const latest = await api.entity(pid, initial.id)
    hashRef.current = latest.hash
    known.current.add(latest.hash)
    paused.current = false
    dirty.current = true
    void save()
  }, [pid, initial.id, save])

  // Flush pending edits when leaving the page.
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      timer.current = undefined
      void save()
    },
    [save],
  )
  // A failed save or an unresolved conflict must not vanish unnoticed: register with the
  // cross-page guard so navigating elsewhere asks first instead of dropping the edit.
  useEffect(() => {
    if (state.kind === 'error') setUnsavedGuard({ id: initial.id, retry })
    else if (state.kind === 'conflict') setUnsavedGuard({ id: initial.id })
    else setUnsavedGuard(null)
    return () => setUnsavedGuard(null)
  }, [state.kind, initial.id, retry])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current || saving.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  return { draft, edit, state, offer, reloadFromDisk, overwrite, retry }
}
