import "server-only"

export class AssetLifecycleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AssetLifecycleError"
  }
}
