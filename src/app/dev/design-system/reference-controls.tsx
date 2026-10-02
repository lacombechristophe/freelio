"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function ReferenceControls() {
  const { resolvedTheme, setTheme } = useTheme()
  const [selected, setSelected] = useState(false)
  return <section className="space-y-4" aria-label="Interactions de référence">
    <h2 className="text-lg font-semibold">Sélection, menus et fenêtres</h2>
    <div className="flex flex-wrap items-center gap-4">
      <Button variant="outline" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>Changer de thème</Button>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={selected} onCheckedChange={(checked) => setSelected(checked === true)} />Sélectionner le dossier</label>
      <Select defaultValue="all"><SelectTrigger aria-label="Statut de référence" className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="draft">Brouillon</SelectItem><SelectItem value="paid">Payé</SelectItem></SelectContent></Select>
      <Dialog><DialogTrigger render={<Button variant="outline" />}>Ouvrir la fenêtre</DialogTrigger><DialogContent><DialogTitle>Fenêtre de référence</DialogTitle><DialogDescription>Vérifiez le parcours clavier, Échap et le retour du focus au déclencheur.</DialogDescription></DialogContent></Dialog>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{selected ? "1 dossier sélectionné" : "Aucun dossier sélectionné"}</p>
  </section>
}
