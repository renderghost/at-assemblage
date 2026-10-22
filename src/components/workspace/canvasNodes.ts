import type { Annotation, GraphItem } from '../../graph/model'
import type { CardNodeType } from './CardNode'
import type { CollectionNodeType } from './CollectionNode'

export type AppNode = CardNodeType | CollectionNodeType

/** A card node; position is absolute, or relative to `parentId` in container mode. */
export function cardNode(
  item: GraphItem,
  position: { x: number; y: number },
  ctx: { annotations: Map<string, Annotation[]>; badges: { id: string; name: string }[] },
  extra: Partial<CardNodeType> = {},
): CardNodeType {
  return {
    id: item.id,
    type: 'card',
    position,
    ariaLabel: `Card: ${item.title}`,
    data: { item, annotationCount: ctx.annotations.get(item.id)?.length ?? 0, groupBadges: ctx.badges },
    ...extra,
  }
}
