import { describe, expect, it } from 'vitest'
import { UploadLifecycle } from '@/components/shared/upload-lifecycle'
import { capturePuckUpload, isPuckUploadCurrent } from '@/lib/puck/utils/upload-transaction'

function document() {
  const item = { type: 'ImageGallery', props: { id: 'gallery', images: [{ src: '', alt: 'first' }, { src: '', alt: 'second' }] } }
  return { appState: { data: { root: { props: {} }, content: [item, { type: 'Image', props: { id: 'other', src: '' } }] } }, selectedItem: item }
}

describe('delayed uploads in editors', () => {
  it('rejects completions after deleting an array item with the same empty URL as its replacement', () => {
    const puck = document()
    const transaction = capturePuckUpload(puck)
    puck.selectedItem.props.images.splice(0, 1)
    expect(isPuckUploadCurrent(transaction, puck)).toBe(false)
  })

  it('rejects array reorders, even when both URL values are empty', () => {
    const puck = document()
    const transaction = capturePuckUpload(puck)
    puck.selectedItem.props.images.reverse()
    expect(isPuckUploadCurrent(transaction, puck)).toBe(false)
  })

  it('uses Puck array item ids when the entire reordered items are identical', () => {
    const puck = document()
    puck.selectedItem.props.images.forEach((image) => { image.alt = '' })
    const state = { ...puck, appState: { ...puck.appState, ui: { arrayState: { images: { items: [{ _arrayId: 'item-a' }, { _arrayId: 'item-b' }] } } } } }
    const transaction = capturePuckUpload(state)
    const before = JSON.stringify(state.appState.data)
    state.selectedItem.props.images.reverse()
    state.appState.ui.arrayState.images.items.reverse()
    expect(JSON.stringify(state.appState.data)).toBe(before)
    expect(isPuckUploadCurrent(transaction, state)).toBe(false)
  })

  it('rejects block moves, deletion, selecting another empty block, and unrelated edits', () => {
    const puck = document()
    const transaction = capturePuckUpload(puck)
    const moved = structuredClone(puck)
    moved.appState.data.content.reverse()
    expect(isPuckUploadCurrent(transaction, moved)).toBe(false)
    const removed = structuredClone(puck)
    removed.appState.data.content.shift()
    expect(isPuckUploadCurrent(transaction, removed)).toBe(false)
    expect(isPuckUploadCurrent(transaction, { ...puck, selectedItem: { props: { id: 'other' } } })).toBe(false)
    puck.selectedItem.props.images[0].alt = 'changed during upload'
    expect(isPuckUploadCurrent(transaction, puck)).toBe(false)
  })

  it('allows the same stable field and page-root uploads when their document is unchanged', () => {
    const puck = document()
    expect(isPuckUploadCurrent(capturePuckUpload(puck), puck)).toBe(true)
    const root = { ...puck, selectedItem: null }
    expect(isPuckUploadCurrent(capturePuckUpload(root), root)).toBe(true)
  })

  it('never commits an earlier request, an unmounted request, or a changed-and-restored owner', () => {
    const lifecycle = new UploadLifecycle()
    lifecycle.observe('block-a:empty')
    const first = lifecycle.begin()
    const second = lifecycle.begin()
    expect(lifecycle.isCurrent(first)).toBe(false)
    expect(lifecycle.isCurrent(second)).toBe(true)
    lifecycle.observe('block-b:empty')
    lifecycle.observe('block-a:empty')
    expect(lifecycle.isCurrent(second)).toBe(false)
    expect(lifecycle.isLatest(second)).toBe(true)
    const third = lifecycle.begin()
    lifecycle.dispose()
    expect(lifecycle.isCurrent(third)).toBe(false)
    lifecycle.activate()
    expect(lifecycle.isCurrent(third)).toBe(false)
  })
})
