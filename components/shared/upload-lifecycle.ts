/** A completion may only update the same, unchanged field that started it. */
export class UploadLifecycle {
  private sequence = 0
  private active = true
  private owner?: string
  private invalidated = new Set<number>()

  observe(owner: string) {
    if (this.owner !== undefined && this.owner !== owner) this.invalidated.add(this.sequence)
    this.owner = owner
  }

  activate() { this.active = true }
  cancel() { this.sequence++ }
  dispose() { this.active = false; this.cancel() }
  begin() { this.invalidated.clear(); return ++this.sequence }
  isCurrent(request: number) { return this.isLatest(request) && !this.invalidated.has(request) }
  isLatest(request: number) { return this.active && this.sequence === request }
}
