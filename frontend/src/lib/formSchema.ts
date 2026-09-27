import type { JsonSchema } from '@/lib/api'

export function defaults(schema: JsonSchema): any {
  if (schema.default !== undefined && schema.default !== null) return structuredClone(schema.default)
  if (schema.type === 'object')
    return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([k, v]) => [k, defaults(v)]))
  if (schema.type === 'array') return []
  if (schema.type === 'string') return ''
  return null
}

/** Pydantic auto-titles fields "Context Of Use"; show "Context of use" unless the title was set explicitly. */
export function fieldLabel(key: string, node: JsonSchema): string {
  const auto = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  if (node.title && node.title !== auto) return node.title
  const words = key.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** "Goals" -> "goal", "Forbidden synonyms" -> "forbidden synonym" (for "Add …" labels). */
export function singular(label: string): string {
  const w = label.toLowerCase()
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/** A field big enough to be its own jump target: a list of nested items, or a nested object (e.g. "design"). */
export function isOutlineSection(node: JsonSchema): boolean {
  return node.type === 'object' || (node.type === 'array' && node.items?.type !== 'string' && !node['x-link'])
}

export const fieldAnchorId = (key: string) => `field-${key}`

export type OutlineEntry = { key: string; label: string; count: number | null }

/**
 * The right-hand "on this page" list: an always-present "Overview" (everything not big enough to
 * get its own entry — title, status, short fields, links…), one entry per outline section in
 * schema order, and "Notes" (the body) last. Degrades gracefully for simple entities: a persona
 * with no sections still gets [Overview, Notes].
 */
export function outlineEntries(schema: JsonSchema, draft: Record<string, any> | undefined): OutlineEntry[] {
  const entries: OutlineEntry[] = [{ key: 'overview', label: 'Overview', count: null }]
  for (const [key, node] of Object.entries(schema.properties ?? {})) {
    if (key === 'id') continue
    if (key === 'body') entries.push({ key, label: node.title ?? 'Notes', count: null })
    else if (isOutlineSection(node)) {
      const value = draft?.[key]
      entries.push({ key, label: fieldLabel(key, node), count: Array.isArray(value) ? value.length : null })
    }
  }
  return entries
}
