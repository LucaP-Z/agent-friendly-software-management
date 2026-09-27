/**
 * Cross-component guard against silently dropping a broken edit when the user
 * navigates elsewhere in the app. At most one entity editor is mounted at a
 * time (routing), so a small module-level store is enough: `useAutosave`
 * registers itself here while its last save attempt failed or is paused on a
 * conflict; every place that navigates programmatically, plus a single
 * capture-phase click listener for <Link> clicks, goes through
 * `guardedNavigate` so leaving always asks first instead of losing the edit.
 */

export type UnsavedGuard = { id: string; retry?: () => void }
type Pending = { guard: UnsavedGuard; proceed: () => void } | null

let guard: UnsavedGuard | null = null
let pending: Pending = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function setUnsavedGuard(next: UnsavedGuard | null) {
  guard = next
}

export function subscribePending(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getPending() {
  return pending
}

/** Runs `proceed` right away if nothing is guarded; otherwise asks for confirmation first. */
export function guardedNavigate(proceed: () => void) {
  if (!guard) {
    proceed()
    return
  }
  pending = { guard, proceed }
  notify()
}

/** `leave: false` = stay (dialog dismissed or "try again" was clicked); `true` = discard and go. */
export function resolvePending(leave: boolean) {
  const was = pending
  pending = null
  notify()
  if (leave && was) {
    guard = null // the user chose to discard this failure; do not ask again for it
    was.proceed()
  }
}
