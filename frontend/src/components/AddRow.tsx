import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Full-width dashed row used for every "add an item" action in forms. */
export function AddRow({ label, onClick, compact, className }: { label: string; onClick: () => void; compact?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-muted-foreground/30 text-sm font-medium text-muted-foreground transition-colors',
        'hover:border-muted-foreground/60 hover:bg-muted/40 hover:text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        compact ? 'h-8 text-[13px]' : 'h-10',
        className,
      )}
    >
      <Plus className="size-3.5" />
      {label}
    </button>
  )
}
