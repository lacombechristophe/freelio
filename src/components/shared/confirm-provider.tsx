"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type ConfirmOptions = {
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type ConfirmContextValue = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null)

/**
 * Promise-based confirmation dialog. Usage:
 *   const confirm = useConfirm()
 *   if (await confirm({ title: "...", description: "..." })) { ... }
 */
export function useConfirm(): ConfirmContextValue {
  const ctx = React.useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>")
  return ctx
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<
    | ({
        open: boolean
        resolve: (v: boolean) => void
      } & ConfirmOptions)
    | null
  >(null)

  const confirm = React.useCallback<ConfirmContextValue>(
    (opts) =>
      new Promise((resolve) => {
        setState({ open: true, resolve, ...opts })
      }),
    []
  )

  function settle(result: boolean) {
    state?.resolve(result)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={!!state?.open}
        onOpenChange={(o) => !o && settle(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{state?.title ?? "Confirmer l'action"}</DialogTitle>
            {state?.description && (
              <DialogDescription>{state.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => settle(false)}>
              {state?.cancelLabel ?? "Annuler"}
            </Button>
            <Button
              type="button"
              variant={state?.destructive ? "destructive" : "default"}
              onClick={() => settle(true)}
            >
              {state?.confirmLabel ?? "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}
