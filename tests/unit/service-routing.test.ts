import { describe, expect, it } from "vitest"

import { recommendServiceAssignee, serviceRoutingTags, type ServiceRoutingCandidate } from "@/lib/operations/service-routing"

const candidate = (input: Partial<ServiceRoutingCandidate> & Pick<ServiceRoutingCandidate, "id">): ServiceRoutingCandidate => ({
  id: input.id,
  role: input.role || "SERVICE",
  available: input.available ?? true,
  capacity: input.capacity ?? 10,
  activeTickets: input.activeTickets ?? 0,
  skills: input.skills || [],
  territories: input.territories || [],
})

describe("recommendServiceAssignee", () => {
  it("prioritizes skill and territory before load", () => {
    const result = recommendServiceAssignee({ requiredSkill: "Pompe", territory: "Nantes" }, [
      candidate({ id: "general", activeTickets: 0 }),
      candidate({ id: "skilled", activeTickets: 4, skills: ["pompe"], territories: ["Nantes"] }),
    ])
    expect(result?.membershipId).toBe("skilled")
    expect(result?.reason).toContain("compétence « Pompe »")
  })

  it("uses the lowest utilization among matching members", () => {
    const result = recommendServiceAssignee({ requiredSkill: "SAV" }, [
      candidate({ id: "busy", activeTickets: 8, capacity: 10, skills: ["SAV"] }),
      candidate({ id: "free", activeTickets: 2, capacity: 5, skills: ["SAV"] }),
    ])
    expect(result?.membershipId).toBe("free")
  })

  it("leaves a standard ticket unassigned when every capacity is reached", () => {
    expect(recommendServiceAssignee({ priority: "NORMAL" }, [candidate({ id: "full", activeTickets: 10, capacity: 10 })])).toBeNull()
  })

  it("allows an explicit urgent overflow and explains it", () => {
    const result = recommendServiceAssignee({ priority: "URGENT" }, [candidate({ id: "full", activeTickets: 10, capacity: 10 })])
    expect(result).toMatchObject({ membershipId: "full", capacityOverflow: true })
    expect(result?.reason).toContain("urgence")
  })

  it("ignores unavailable and unrelated roles", () => {
    expect(recommendServiceAssignee({}, [candidate({ id: "offline", available: false }), candidate({ id: "sales", role: "SALES" })])).toBeNull()
  })
})

describe("serviceRoutingTags", () => {
  it("keeps unique non-empty text tags", () => {
    expect(serviceRoutingTags([" Pompe ", "", "Pompe", 12, "Nantes"])).toEqual(["Pompe", "Nantes"])
  })
})
