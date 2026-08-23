"use client"

import * as React from "react"
import SignaturePad from "react-signature-canvas"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Trash2 } from "lucide-react"

interface SignatureCanvasProps {
  onSave: (signatureData: string) => void
  disabled?: boolean
}

export function SignatureCanvas({ onSave, disabled }: SignatureCanvasProps) {
  const sigPad = React.useRef<SignaturePad>(null)

  const clear = () => {
    sigPad.current?.clear()
  }

  const save = () => {
    if (sigPad.current?.isEmpty()) return
    const data = sigPad.current?.getTrimmedCanvas().toDataURL("image/png")
    if (data) onSave(data)
  }

  return (
    <Card className="p-4 space-y-4 border-dashed border-2 bg-muted/30">
      <div className="bg-white rounded-md border shadow-inner">
        <SignaturePad
          ref={sigPad}
          canvasProps={{
            className: "signature-canvas w-full h-48 cursor-crosshair",
          }}
          clearOnResize={false}
        />
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={clear}
            disabled={disabled}
            className="h-8 gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Effacer
          </Button>
        </div>
        
        <Button 
          onClick={save} 
          disabled={disabled}
          className="h-8 bg-success hover:bg-success/90"
        >
          Confirmer la signature
        </Button>
      </div>
    </Card>
  )
}
