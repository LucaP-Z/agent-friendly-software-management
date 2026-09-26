import { Trash2, X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { AddRow } from '@/components/AddRow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { defaults, fieldLabel, singular } from '@/lib/formSchema'
import type { JsonSchema, Summary } from '@/lib/api'

export type FormCtx = {
  entityId: string
  entities: Summary[]
  root: Record<string, any>
  standardCategories: string[]
  allocate: (key: string) => Promise<string>
}

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

function Row({ label, hint, children, className }: { label?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <Label className="text-[13px] font-medium">{label}</Label>}
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function label(e: Pick<Summary, 'id' | 'title'>) {
  return `${e.id} — ${e.title || 'Untitled'}`
}

// ------------------------------------------------------------------ link fields

function LinkField({ name, node, value, onChange, ctx }: FieldProps) {
  const allowed: string[] = node['x-link']
  const multi = node.type === 'array'
  const selected: string[] = multi ? (value ?? []) : value ? [value] : []
  const candidates: { id: string; title: string }[] =
    allowed[0] === 'ac'
      ? (ctx.root.acceptance_criteria ?? []).filter((a: any) => a.id).map((a: any) => ({ id: a.id, title: a.then || a.statement || '' }))
      : ctx.entities.filter((e) => allowed.includes(e.type) && e.id !== ctx.entityId)
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const known = new Map(ctx.entities.map((e) => [e.id, e]))
  const remaining = candidates.filter((c) => !selected.includes(c.id))

  const set = (next: string[]) => onChange(multi ? next : (next[0] ?? ''))
  return (
    <div className="flex flex-col gap-1.5" data-field={name}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const c = byId.get(id) ?? known.get(id)
            return (
              <Badge key={id} variant={c ? 'secondary' : 'destructive'} className="gap-1 pr-1">
                {c ? label({ id, title: c.title }) : `${id} (not found)`}
                <button type="button" aria-label={`Remove ${id}`} onClick={() => set(selected.filter((s) => s !== id))}>
                  <X className="size-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}
      {(multi || selected.length === 0) && (
        <select
          className={selectClass}
          value=""
          onChange={(e) => e.target.value && set(multi ? [...selected, e.target.value] : [e.target.value])}
        >
          <option value="">{remaining.length ? `Add ${allowed[0] === 'ac' ? 'criterion' : allowed[0]}…` : `No ${allowed[0]} available`}</option>
          {remaining.map((c) => (
            <option key={c.id} value={c.id}>
              {label(c)}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ generic field

type FieldProps = {
  name: string
  node: JsonSchema
  value: any
  onChange: (v: any) => void
  ctx: FormCtx
}

function StringList({ value, onChange, noun }: { value: string[]; onChange: (v: string[]) => void; noun: string }) {
  const items = value ?? []
  const [added, setAdded] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((s, i) => (
        <div key={i} className="flex gap-1.5">
          <Input
            value={s}
            autoFocus={added && i === items.length - 1}
            onBlur={() => setAdded(false)}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <X />
          </Button>
        </div>
      ))}
      <AddRow compact label={`Add ${noun}`} onClick={() => (setAdded(true), onChange([...items, '']))} />
    </div>
  )
}

function visible(name: string, obj: any, ctx: FormCtx) {
  if (name === 'id') return false
  if (name === 'spans') return ctx.entityId.startsWith('F-')
  if (obj && 'format' in obj) {
    if (['given', 'when', 'then'].includes(name)) return obj.format === 'gwt'
    if (name === 'statement') return obj.format === 'ears'
  }
  return true
}

const SENTENCE_HINTS: Record<string, string> = {
  given: 'the starting situation',
  when: 'the action taken',
  then: 'the observable result',
  statement: 'When …, the system shall …',
}

/** Acceptance criterion as one card that reads like a sentence: keywords in the margin, one line per field. */
function SentenceCard({ rows, value, onChange }: { rows: { key: string; keyword: string }[]; value: any; onChange: (v: any) => void }) {
  const base = useId()
  return (
    <div className="rounded-[10px] border bg-background px-3.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      {rows.map((r, i) => (
        <div key={r.key} className={cn('flex items-baseline gap-3.5 py-2', i < rows.length - 1 && 'border-b')}>
          <label htmlFor={`${base}-${r.key}`} className="w-12 shrink-0 text-right font-mono text-[10.5px] font-medium tracking-[0.08em] text-emerald-700 dark:text-emerald-400">
            {r.keyword}
          </label>
          <input
            id={`${base}-${r.key}`}
            value={value?.[r.key] ?? ''}
            placeholder={SENTENCE_HINTS[r.key]}
            onChange={(e) => onChange({ ...value, [r.key]: e.target.value })}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] leading-6 outline-none placeholder:text-muted-foreground/70"
          />
        </div>
      ))}
    </div>
  )
}

function ObjectFields({ node, value, onChange, ctx, cols }: { node: JsonSchema; value: any; onChange: (v: any) => void; ctx: FormCtx; cols?: boolean }) {
  const props = Object.entries(node.properties ?? {}).filter(([k]) => visible(k, value, ctx))
  if (node.properties && 'format' in node.properties && 'given' in node.properties) {
    // Acceptance criterion: surface/format (and spans) on top, the sentence below.
    const head = props.filter(([k]) => !['given', 'when', 'then', 'statement'].includes(k))
    const rows = value?.format === 'ears' ? [{ key: 'statement', keyword: 'EARS' }] : [{ key: 'given', keyword: 'GIVEN' }, { key: 'when', keyword: 'WHEN' }, { key: 'then', keyword: 'THEN' }]
    return (
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {head.map(([k, sub]) => (
            <Field key={k} name={k} node={sub} value={value?.[k]} onChange={(v) => onChange({ ...value, [k]: v })} ctx={ctx} />
          ))}
        </div>
        <SentenceCard rows={rows} value={value} onChange={onChange} />
      </div>
    )
  }
  return (
    <div className={cn('grid gap-3', cols && 'sm:grid-cols-2')}>
      {props.map(([k, sub]) => (
        <div key={k} className={cn('min-w-0', (sub['x-wide'] || sub['x-ui'] || sub.type === 'array' || sub.type === 'object') && 'sm:col-span-2')}>
          <Field name={k} node={sub} value={value?.[k]} onChange={(v) => onChange({ ...value, [k]: v })} ctx={ctx} />
        </div>
      ))}
    </div>
  )
}

function itemSummary(item: any): string {
  for (const k of ['title', 'metric', 'item', 'trigger', 'expected', 'then', 'statement', 'category']) {
    if (typeof item?.[k] === 'string' && item[k]) return item[k]
  }
  return ''
}

function ObjectList({ name, node, value, onChange, ctx }: FieldProps) {
  const items: any[] = value ?? []
  const itemSchema = node.items!
  const hasId = !!itemSchema.properties && 'id' in itemSchema.properties

  async function add() {
    const item = defaults(itemSchema)
    if (hasId) {
      const prefix = /^\^\(?([A-Z]+)-/.exec(itemSchema.properties!.id.pattern ?? '')?.[1]
      if (prefix) item.id = await ctx.allocate(`${prefix}-${ctx.entityId.split('-', 2)[1]}`)
    }
    onChange([...items, item])
  }

  let missing: string[] = []
  if (name === 'edge_cases') {
    const covered = new Set([...items.map((i) => i.category), ...(ctx.root.not_applicable ?? []).map((n: any) => n.category)])
    missing = ctx.standardCategories.filter((c) => !covered.has(c))
  }

  return (
    <div className="flex flex-col gap-2" data-field={name}>
      {missing.length > 0 && (
        <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          Categories not yet covered or marked not applicable: {missing.join(', ')}
        </p>
      )}
      {items.map((item, i) => (
        <div key={item.id || i} className="rounded-lg border bg-card p-3">
          <div className="mb-2 flex items-center gap-2">
            {item.id && <Badge variant="outline" className="font-mono">{item.id}</Badge>}
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{itemSummary(item)}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove item"
              onClick={() => {
                if (!hasId || !item.id || confirm(`Remove ${item.id}? Its id will not be reused.`)) onChange(items.filter((_, j) => j !== i))
              }}
            >
              <Trash2 />
            </Button>
          </div>
          <ObjectFields node={itemSchema} value={item} ctx={ctx} cols onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} />
        </div>
      ))}
      <AddRow label={`Add ${(itemSchema.title ?? 'item').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}`} onClick={add} />
    </div>
  )
}

export function Field(props: FieldProps) {
  const { node, value, onChange } = props
  const title = fieldLabel(props.name, node)
  let control: ReactNode

  if (node['x-link']) control = <LinkField {...props} />
  else if (node.enum)
    control = (
      <select className={selectClass} value={value ?? ''} disabled={!!node['x-readonly']} onChange={(e) => onChange(e.target.value)}>
        {node.enum.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  else if (node.type === 'string')
    control = node['x-readonly'] ? (
      <p className="font-mono text-sm">{value}</p>
    ) : node['x-ui'] ? (
      <Textarea
        value={value ?? ''}
        rows={node['x-ui'] === 'markdown' ? 8 : 3}
        className={cn(node['x-ui'] === 'markdown' && 'font-mono text-[13px]')}
        onChange={(e) => onChange(e.target.value)}
      />
    ) : (
      <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    )
  else if (node.type === 'integer' || node.type === 'number')
    control = node['x-readonly'] ? (
      <p className="text-sm">{value}</p>
    ) : (
      <Input
        type="number"
        min={0}
        step={node.type === 'integer' ? 1 : 'any'}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? (node.nullable ? null : 0) : Number(e.target.value))}
      />
    )
  else if (node.type === 'array' && node.items?.type === 'string') control = <StringList value={value} onChange={onChange} noun={singular(title ?? 'item')} />
  else if (node.type === 'array') control = <ObjectList {...props} />
  else if (node.type === 'object')
    return (
      <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
        <legend className="px-1 text-[13px] font-medium">{title}</legend>
        <ObjectFields node={node} value={value} onChange={onChange} ctx={props.ctx} cols />
      </fieldset>
    )
  else return null

  const isSection = node.type === 'array' && node.items?.type !== 'string' && !node['x-link']
  return (
    <Row label={title} hint={node.description} className={cn(isSection && 'mt-2')}>
      {control}
    </Row>
  )
}

export function SchemaForm({ schema, value, onChange, ctx }: { schema: JsonSchema; value: any; onChange: (v: any) => void; ctx: FormCtx }) {
  const props = Object.entries(schema.properties ?? {}).filter(([k]) => visible(k, value, ctx))
  return (
    <div className="flex flex-col gap-4">
      {props.map(([k, sub]) => (
        <Field key={k} name={k} node={sub} value={value?.[k]} onChange={(v) => onChange({ ...value, [k]: v })} ctx={ctx} />
      ))}
    </div>
  )
}
