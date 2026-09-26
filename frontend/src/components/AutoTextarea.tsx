import { useCallback, useEffect, useLayoutEffect, useRef, type ComponentProps } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * A textarea that grows with its content and cannot be resized by hand.
 * Sizes itself in JS so it behaves the same in every browser (not only where
 * CSS `field-sizing` exists). `minRows` sets the resting height.
 */
export function AutoTextarea({ minRows = 2, className, value, ...props }: ComponentProps<'textarea'> & { minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const fit = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px` // + borders
  }, [])

  useLayoutEffect(fit, [value, fit])

  // Wrapping changes when the available width does (window or sidebar resize).
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let width = el.offsetWidth
    const ro = new ResizeObserver(() => {
      if (el.offsetWidth !== width) {
        width = el.offsetWidth
        fit()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  return <Textarea ref={ref} rows={minRows} value={value} className={cn('field-sizing-fixed min-h-0 resize-none overflow-hidden', className)} {...props} />
}
