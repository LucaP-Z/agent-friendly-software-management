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
