"use client"

import * as React from "react"
import { toast } from "sonner"
import { saveCommunicationSignature } from "@/actions/communications"
import { signatureTextSchema, type EmailSignatureDto } from "@/lib/communications/signature-input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function SignatureEditor({ initialValue, onInsert }: { initialValue: EmailSignatureDto; onInsert: (text: string) => void }) {
  const [text, setText] = React.useState(initialValue.text)
  const [version, setVersion] = React.useState(initialValue.version)
  const [pending, startTransition] = React.useTransition()
  function save() {
    const parsed = signatureTextSchema.safeParse(text)
    if (!parsed.success) return toast.error(parsed.error.issues[0].message)
    startTransition(async () => {
      try {
        const result = await saveCommunicationSignature({ text: parsed.data, version })
        if (!result.success) throw new Error(result.error)
        setText(result.signature.text); setVersion(result.signature.version)
        toast.success("Signature personnelle enregistrée.")
      } catch (error) { toast.error(error instanceof Error ? error.message : "Enregistrement de la signature impossible.") }
    })
  }
  return <fieldset disabled={pending} className="space-y-1.5">
    <Label htmlFor="email-signature">Signature personnelle</Label>
    <Textarea id="email-signature" value={text} onChange={event => setText(event.target.value)} rows={4} maxLength={4000} />
    <div className="flex flex-wrap gap-2">
      <Button demoMutation type="button" variant="outline" onClick={save}>Enregistrer ma signature</Button>
      <Button demoMutation type="button" variant="outline" disabled={!text.trim()} onClick={() => {
        const parsed = signatureTextSchema.safeParse(text)
        if (!parsed.success) return toast.error(parsed.error.issues[0].message)
        try { onInsert(parsed.data) }
        catch (error) { toast.error(error instanceof Error ? error.message : "Signature invalide.") }
      }}>Insérer ma signature</Button>
    </div>
  </fieldset>
}
