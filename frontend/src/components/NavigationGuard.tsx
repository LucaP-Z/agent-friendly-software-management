import { useEffect, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getPending, guardedNavigate, resolvePending, subscribePending } from '@/lib/unsavedGuard'

function isPlainLeftClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

/**
 * Renders the confirmation and, while mounted, protects every same-app link click: a
 * capture-phase listener runs before react-router's own click handler, so calling
 * preventDefault() here stops the navigation before it starts (react-router's Link
 * checks event.defaultPrevented). Programmatic navigation (project switcher, "new
 * entity") goes through guardedNavigate directly at its call site.
 */
export function NavigationGuard() {
  const navigate = useNavigate()
  const pending = useSyncExternalStore(subscribePending, getPending)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || !isPlainLeftClick(e)) return
      const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      const href = url.pathname + url.search + url.hash
      // Always intercept first: guardedNavigate itself no-ops instantly when nothing is guarded.
      e.preventDefault()
      guardedNavigate(() => navigate(href))
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [navigate])

  return (
    <Dialog open={!!pending} onOpenChange={(open) => !open && resolvePending(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave without saving?</DialogTitle>
          <DialogDescription>
            {pending?.guard.retry
              ? `${pending.guard.id} has an edit that failed to save. Leaving now abandons it.`
              : `${pending?.guard.id} changed on disk and needs your attention. Leaving now abandons your edit.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => resolvePending(false)}>
            Stay on this page
          </Button>
          {pending?.guard.retry && (
            <Button
              variant="outline"
              onClick={() => {
                pending.guard.retry?.()
                resolvePending(false)
              }}
            >
              Try saving again
            </Button>
          )}
          <Button variant="destructive" onClick={() => resolvePending(true)}>
            Leave without saving
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
