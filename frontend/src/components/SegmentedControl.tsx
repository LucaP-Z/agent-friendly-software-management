import { useRef } from 'react'
import { cn } from '@/lib/utils'

export type SegmentedOption = { value: string; label: string }

/**
 * A short list of mutually exclusive choices, all visible at once (a radio group that looks like a toggle).
 * Arrow keys move the selection, as in a native radio group.
 */
export function SegmentedControl({ options, value, onChange, label, disabled }: { options: SegmentedOption[]; value: string; onChange: (v: string) => void; label: string; disabled?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (index + step + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-fit gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'h-7 rounded-md px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50',
              on ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
