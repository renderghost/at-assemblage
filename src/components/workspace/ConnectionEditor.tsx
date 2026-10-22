import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import type { GraphItem } from '../../graph/model'
import { useCreateConnection } from '../../queries/semble'
import { typeInfo } from '../../services/sources/semble/connectionTypes'
import { isDuplicateLink } from '../../services/sources/semble/mapping'
import { useUiStore, type LinkDraft } from '../../state/uiStore'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useTypeRecommendation } from '../../queries/suggestions'
import { TypePicker } from './TypePicker'
import { useWorkspace } from './WorkspaceContext'

const NOTE_MAX = 1000

const schema = z.object({
  type: z.string().min(1, 'Choose a connection type.'),
  note: z.string().max(NOTE_MAX, `Notes are limited to ${NOTE_MAX} characters.`),
})
type FormValues = z.infer<typeof schema>

function Endpoint({ label, item }: { label: string; item: GraphItem }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface-2 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className="truncate text-[13px] font-semibold" title={item.title}>
        {item.title}
      </div>
      <div className="truncate font-mono text-[11.5px] text-ink-3" title={item.url ?? item.id}>
        {item.url ?? item.id}
      </div>
    </div>
  )
}

function EditorForm({ draft, source, target }: { draft: LinkDraft; source: GraphItem; target: GraphItem }) {
  const { data } = useWorkspace()
  const setDraft = useUiStore((s) => s.setDraft)
  const create = useCreateConnection()
  const recommendation = useTypeRecommendation(source, target)
  const { defaultConnectionType, recommendedType } = useUiStore((s) => s.preferences)
  // Preferences → Recommended type: "badge" only marks it in the picker.
  const preselect = recommendedType === 'preselect' ? recommendation : null
  const explicitType = typeInfo(draft.type)?.value
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: explicitType ?? preselect?.type ?? defaultConnectionType, note: draft.note ?? '' },
  })
  const type = useWatch({ control, name: 'type' })
  const note = useWatch({ control, name: 'note' })
  const duplicate = isDuplicateLink(data.links, source.id, target.id, type)

  // The recommendation may arrive after the form opens: preselect it unless the type was given
  // explicitly (e.g. from a suggestion) or the user has already chosen one.
  useEffect(() => {
    if (preselect && !explicitType && !dirtyFields.type) setValue('type', preselect.type)
  }, [preselect, explicitType, dirtyFields.type, setValue])

  const onSubmit = handleSubmit((values) => {
    // Close immediately: the optimistic edge shows progress on the canvas.
    setDraft(null)
    create.mutate({
      source,
      target,
      sourceId: source.id,
      targetId: target.id,
      type: values.type,
      note: values.note,
      existing: data.links,
    })
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Endpoint label="From" item={source} />
        <span aria-hidden="true" className="text-ink-3">
          →
        </span>
        <Endpoint label="To" item={target} />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          icon="swap"
          onClick={() =>
            setDraft({ sourceId: target.id, targetId: source.id, type: dirtyFields.type || explicitType ? type : undefined, note })
          }
        >
          Swap direction
        </Button>
      </div>

      <div>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <TypePicker
              name="new-connection-type"
              value={field.value}
              onChange={(v) => field.onChange(v)}
              recommendation={recommendation}
            />
          )}
        />
        {errors.type ? <p className="mt-1 text-[13px] text-danger">{errors.type.message}</p> : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="connection-note" className="flex justify-between text-sm font-medium">
          <span>
            Note <span className="font-normal text-ink-3">(optional)</span>
          </span>
          <span className={`text-[12px] font-normal ${note.length > NOTE_MAX ? 'text-danger' : 'text-ink-3'}`}>
            {note.length}/{NOTE_MAX}
          </span>
        </label>
        <textarea
          id="connection-note"
          rows={3}
          className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
          placeholder={typeInfo(type)?.notePlaceholder ?? 'Why are these connected?'}
          aria-invalid={!!errors.note}
          {...register('note')}
        />
        {errors.note ? <p className="text-[13px] text-danger">{errors.note.message}</p> : null}
      </div>

      {duplicate ? (
        <Alert tone="warning">You already have a connection of this type in this direction.</Alert>
      ) : null}

      <p className="text-[12px] text-ink-3">
        Saves a <code className="font-mono">network.cosmik.connection</code> record to your PDS. It will appear in
        Semble.
      </p>

      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button onClick={() => setDraft(null)}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={duplicate}>
          Save connection
        </Button>
      </div>
    </form>
  )
}

/** Opens whenever a drag between two cards leaves a draft. Never writes without the explicit Save. */
export function ConnectionEditor() {
  const draft = useUiStore((s) => s.draft)
  const setDraft = useUiStore((s) => s.setDraft)
  const { resolveItem } = useWorkspace()
  const source = draft ? resolveItem(draft.sourceId) : undefined
  const target = draft ? resolveItem(draft.targetId) : undefined
  const open = !!(draft && source && target)

  return (
    <Dialog open={open} title="New connection" onClose={() => setDraft(null)} width="w-[560px]">
      {open ? <EditorForm key={`${draft.sourceId}>${draft.targetId}`} draft={draft} source={source} target={target} /> : null}
    </Dialog>
  )
}
