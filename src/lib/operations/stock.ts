export type StockMovementType = "IN" | "OUT" | "RESERVE" | "RELEASE" | "CONSUME" | "ADJUST"

export function calculateStockBalance(input: {
  quantity: number
  reservedQuantity: number
  type: StockMovementType
  movementQuantity: number
}) {
  const magnitude = Math.abs(input.movementQuantity)
  let quantity = input.quantity
  let reservedQuantity = input.reservedQuantity

  if (input.type === "IN") quantity += magnitude
  else if (input.type === "OUT") quantity -= magnitude
  else if (input.type === "RESERVE") reservedQuantity += magnitude
  else if (input.type === "RELEASE") reservedQuantity -= magnitude
  else if (input.type === "CONSUME") {
    quantity -= magnitude
    reservedQuantity = Math.max(0, reservedQuantity - magnitude)
  } else quantity += input.movementQuantity

  if (quantity < 0) throw new Error("Stock insuffisant pour ce mouvement")
  if (reservedQuantity < 0 || reservedQuantity > quantity) throw new Error("Réservation incompatible avec le stock disponible")
  return { quantity, reservedQuantity }
}
