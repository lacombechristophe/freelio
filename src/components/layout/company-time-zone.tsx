"use client"

import { createContext, useContext, type ReactNode } from "react"

const CompanyTimeZone = createContext("Europe/Paris")

export function CompanyTimeZoneProvider({ timeZone, children }: { timeZone: string; children: ReactNode }) {
  return <CompanyTimeZone value={timeZone}>{children}</CompanyTimeZone>
}

export function useCompanyTimeZone() {
  return useContext(CompanyTimeZone)
}
