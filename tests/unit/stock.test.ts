import { describe, expect, it } from "vitest"

import { calculateStockBalance } from "@/lib/operations/stock"

describe("stock operations", () => {
  it("tracks available and reserved quantities", () => {
    expect(calculateStockBalance({ quantity: 10, reservedQuantity: 2, type: "RESERVE", movementQuantity: 3 })).toEqual({ quantity: 10, reservedQuantity: 5 })
    expect(calculateStockBalance({ quantity: 10, reservedQuantity: 5, type: "CONSUME", movementQuantity: 4 })).toEqual({ quantity: 6, reservedQuantity: 1 })
  })

  it("prevents negative stock and over-reservation", () => {
    expect(() => calculateStockBalance({ quantity: 2, reservedQuantity: 0, type: "OUT", movementQuantity: 3 })).toThrow("Stock insuffisant")
    expect(() => calculateStockBalance({ quantity: 5, reservedQuantity: 4, type: "RESERVE", movementQuantity: 2 })).toThrow("Réservation incompatible")
  })

  it("supports signed inventory adjustments", () => {
    expect(calculateStockBalance({ quantity: 5, reservedQuantity: 0, type: "ADJUST", movementQuantity: -2 })).toEqual({ quantity: 3, reservedQuantity: 0 })
  })
})
