'use client'

import type { CustomField } from '@measured/puck'
import { setDeep, useGetPuck, usePuck } from '@measured/puck'
import { uploadLandingPageAsset } from '@/app/actions/admin/landing-page-assets'
import { capturePuckUpload, isPuckUploadCurrent } from '../../utils/upload-transaction'
import { ImageUploadField } from '@/components/shared/image-upload-field'

/** Capture the block id and current data. Never reuse Puck's index-bound array callback after await. */
function PuckImageField({ value, name, id, readOnly }: Parameters<CustomField<string>['render']>[0]) {
  const getPuck = useGetPuck()
  const state = usePuck()
  const owner = JSON.stringify(capturePuckUpload(state))
  return <ImageUploadField id={id} name={name} value={value ?? ''} label="Image URL" disabled={readOnly} identityKey={`${id}:${name}:${owner}`} uploadAction={uploadLandingPageAsset}
    onChange={(url) => {
      const puck = getPuck()
      if (!puck.getPermissions({ item: puck.selectedItem ?? undefined, root: !puck.selectedItem }).edit) return
      if (puck.selectedItem) {
        const item = puck.selectedItem
        const selector = puck.getSelectorForId(item.props.id)
        if (selector) puck.dispatch({ type: 'replace', destinationIndex: selector.index, destinationZone: selector.zone, data: { ...item, props: setDeep(structuredClone(item.props), name, url) } })
      } else {
        const root = puck.appState.data.root
        puck.dispatch({ type: 'replaceRoot', root: { ...root, props: setDeep(structuredClone(root.props ?? root), name, url) as NonNullable<typeof root.props> } })
      }
    }}
    createUploadCommit={() => {
      const initial = getPuck()
      const itemId = initial.selectedItem?.props.id
      const transaction = capturePuckUpload(initial)
      return (url) => {
        const puck = getPuck()
        if (!isPuckUploadCurrent(transaction, puck)) return
        if (!puck.getPermissions({ item: puck.selectedItem ?? undefined, root: !itemId }).edit) return
        if (itemId) {
          const selector = puck.getSelectorForId(itemId)
          const item = puck.getItemById(itemId)
          if (!selector || !item) return
          puck.dispatch({ type: 'replace', destinationIndex: selector.index, destinationZone: selector.zone, data: { ...item, props: setDeep(structuredClone(item.props), name, url) } })
        } else {
          const root = puck.appState.data.root
          puck.dispatch({ type: 'replaceRoot', root: { ...root, props: setDeep(structuredClone(root.props ?? root), name, url) as NonNullable<typeof root.props> } })
        }
      }
    }} />
}

export function imageUploadField(label: string): CustomField<string> & { valueType: 'string' } {
  return { type: 'custom', label, valueType: 'string', render: PuckImageField }
}
