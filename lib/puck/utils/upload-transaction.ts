/** Puck array callbacks close over numeric indexes; uploads need a document/owner snapshot. */
interface UploadDocument {
  appState: { data: unknown; ui?: { arrayState?: unknown } }
  selectedItem?: { props: { id: string } } | null
}

export function capturePuckUpload(puck: UploadDocument) {
  return { selectedId: puck.selectedItem?.props.id, document: JSON.stringify(puck.appState.data), arrays: JSON.stringify(puck.appState.ui?.arrayState) }
}

export function isPuckUploadCurrent(transaction: ReturnType<typeof capturePuckUpload>, puck: UploadDocument): boolean {
  return transaction.selectedId === puck.selectedItem?.props.id && transaction.document === JSON.stringify(puck.appState.data) && transaction.arrays === JSON.stringify(puck.appState.ui?.arrayState)
}
