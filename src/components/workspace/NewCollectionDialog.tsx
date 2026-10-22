import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useCreateCollection } from '../../queries/create'
import { describeError } from '../../services/atproto/errors'
import { useUiStore } from '../../state/uiStore'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

// Limits from the network.cosmik.collection lexicon.
const NAME_MAX = 100
const DESCRIPTION_MAX = 500

const schema = z.object({
  name: z.string().trim().min(1, 'Give the collection a name.').max(NAME_MAX, `Names are limited to ${NAME_MAX} characters.`),
  description: z.string().max(DESCRIPTION_MAX, `Descriptions are limited to ${DESCRIPTION_MAX} characters.`),
  accessType: z.enum(['CLOSED', 'OPEN']),
})
type FormValues = z.infer<typeof schema>

const inputClass =
  'w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none aria-[invalid=true]:border-danger'

type CollectionFormProps = {
  initial?: FormValues
  submitLabel: string
  busy: boolean
  error?: string | null
  note: string
  onSubmit: (values: FormValues) => void
  onCancel: () => void
  /** Extra action on the left of the footer (e.g. Delete). */
  footerStart?: React.ReactNode
}

/** Name, description and Personal/Open: the fields of a Semble collection, with the lexicon's limits. */
export function CollectionForm({ initial, submitLabel, busy, error, note, onSubmit, onCancel, footerStart }: CollectionFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial ?? { name: '', description: '', accessType: 'CLOSED' },
  })
  const name = useWatch({ control, name: 'name' })
  const description = useWatch({ control, name: 'description' })

  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-1.5">
        <label htmlFor="collection-name" className="flex justify-between text-sm font-medium">
          Name
          <span className="text-[12px] font-normal text-ink-3">
            {name.length}/{NAME_MAX}
          </span>
        </label>
        <input
          id="collection-name"
          autoFocus
          placeholder="Collection name"
          aria-invalid={!!errors.name}
          className={`${inputClass} h-9`}
          {...register('name')}
        />
        {errors.name ? <p className="text-[12px] text-danger">{errors.name.message}</p> : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="collection-description" className="flex justify-between text-sm font-medium">
          <span>
            Description <span className="font-normal text-ink-3">(optional)</span>
          </span>
          <span className="text-[12px] font-normal text-ink-3">
            {description.length}/{DESCRIPTION_MAX}
          </span>
        </label>
        <textarea
          id="collection-description"
          rows={3}
          placeholder="Describe what this collection is about"
          aria-invalid={!!errors.description}
          className={`${inputClass} resize-y py-2`}
          {...register('description')}
        />
        {errors.description ? <p className="text-[12px] text-danger">{errors.description.message}</p> : null}
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Collaboration</legend>
        <div className="space-y-1.5">
          {(
            [
              ['CLOSED', 'Personal', 'Only you can add'],
              ['OPEN', 'Open', 'Anyone can add'],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-[13px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input type="radio" value={value} className="accent-[var(--color-accent)]" {...register('accessType')} />
              <span className="font-medium">{label}</span>
              <span className="text-ink-3">— {hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <p className="text-[12px] text-ink-3">{note}</p>

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <div>{footerStart}</div>
        <div className="flex gap-2">
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}

function NewCollectionForm({ name, onDone }: { name?: string; onDone: () => void }) {
  const create = useCreateCollection()
  return (
    <CollectionForm
      initial={name ? { name, description: '', accessType: 'CLOSED' } : undefined}
      submitLabel="Create collection"
      busy={create.isPending}
      error={create.isError ? `Collection not created. ${describeError(create.error).message}` : null}
      note="Saved to your PDS as a Semble collection; it appears in Semble too."
      onSubmit={(values) => create.mutate(values, { onSuccess: onDone })}
      onCancel={onDone}
    />
  )
}

/** The new-collection form, driven by `newCollectionRequest` in the UI store. */
export function NewCollectionDialog() {
  const request = useUiStore((s) => s.newCollectionRequest)
  const close = useUiStore((s) => s.closeNewCollection)
  return (
    <Dialog open={!!request} title="New collection" onClose={close}>
      <NewCollectionForm name={request?.name} onDone={close} />
    </Dialog>
  )
}
