import { fieldAnchorId, outlineEntries } from '@/lib/formSchema'
import type { JsonSchema } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Scrolls to a field's section and briefly flashes it, so the eye lands where the click meant to go. */
function goToField(key: string) {
  const el = key === 'overview' ? document.getElementById('entity-overview') : document.getElementById(fieldAnchorId(key))
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (key === 'overview') return // scrolling to the top is enough; there's no single box to flash
  // Restart the animation even on a second click on the same target: remove, force reflow, re-add.
  el.classList.remove('outline-flash')
  void el.offsetWidth
  el.classList.add('outline-flash')
}

/** The right-hand "on this page" list. Purely a navigation aid: no colour coding, no active-item marker. */
export function FormOutline({ schema, draft, className }: { schema: JsonSchema; draft: Record<string, any> | undefined; className?: string }) {
  const entries = outlineEntries(schema, draft)
  if (entries.length <= 1) return null
  return (
    <nav aria-label="On this page" className={cn('flex flex-col gap-0.5', className)}>
      <span className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">On this page</span>
      {entries.map((e) => (
        <button
          key={e.key}
          type="button"
          onClick={() => goToField(e.key)}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <span className="min-w-0 flex-1 truncate">{e.label}</span>
          {e.count !== null && <span className="text-xs tabular-nums text-muted-foreground/70">{e.count}</span>}
        </button>
      ))}
    </nav>
  )
}
