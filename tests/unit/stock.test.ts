import { describe, expect, it } from "vitest"

import { calculateStockBalance, calculateStockTransferBalances } from "@/lib/operations/stock"

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

  it("moves the same quantity between two warehouses without changing the total", () => {
    const result = calculateStockTransferBalances({
      source: { quantity: 12, reservedQuantity: 2 },
      destination: { quantity: 3, reservedQuantity: 1 },
      transferQuantity: 4,
    })
    expect(result).toEqual({
      source: { quantity: 8, reservedQuantity: 2 },
      destination: { quantity: 7, reservedQuantity: 1 },
    })
    expect(result.source.quantity + result.destination.quantity).toBe(15)
  })

  it("refuses transfers that would move reserved or unavailable stock", () => {
    expect(() => calculateStockTransferBalances({
      source: { quantity: 5, reservedQuantity: 4 },
      destination: { quantity: 0, reservedQuantity: 0 },
      transferQuantity: 2,
    })).toThrow("Réservation incompatible")
    expect(() => calculateStockTransferBalances({
      source: { quantity: 5, reservedQuantity: 0 },
      destination: { quantity: 0, reservedQuantity: 0 },
      transferQuantity: 0,
    })).toThrow("entier positif")
  })
})
