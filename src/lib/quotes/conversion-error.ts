export class QuoteConversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "QuoteConversionError"
  }
}
