"use client"

import { useEffect, useMemo, useState } from "react"
import { EditorContent, useEditor, useEditorState } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Bold, Italic, Link2, List, ListOrdered, Redo2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

// This is a compatibility check, not a security filter. Server sanitization
// remains authoritative for previews, drafts and sending.
function supportsSimpleEditing(html: string) {
  if (/<!--|<!doctype|<\/?(?:html|head|body)\b/i.test(html)) return false
  const document = new DOMParser().parseFromString(html, "text/html")
  if (document.head.childElementCount) return false
  const tags = new Set(["P", "BR", "STRONG", "EM", "H1", "H2", "H3", "BLOCKQUOTE", "UL", "OL", "LI", "A"])
  return [...document.body.querySelectorAll("*")].every(element => {
    if (!tags.has(element.tagName)) return false
    if (element.tagName !== "A") return element.attributes.length === 0
    return [...element.attributes].every(attribute => ["href", "rel"].includes(attribute.name))
      && (!element.hasAttribute("href") || /^https?:\/\//i.test(element.getAttribute("href") ?? ""))
      && (!element.hasAttribute("rel") || element.getAttribute("rel") === "noopener noreferrer")
  })
}

type ComposerProps = { value: string; onChange: (value: string) => void; disabled: boolean }

export function EmailComposer({ value, onChange, disabled }: ComposerProps) {
  // Loaded with ssr:false: DOM parsing stays inside the browser-only editor.
  const compatible = useMemo(() => supportsSimpleEditing(value), [value])
  const [mode, setMode] = useState<"simple" | "html">(() => compatible ? "simple" : "html")
  const simple = mode === "simple" && compatible

  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Label id="email-content-label" htmlFor="email-html">{simple ? "Contenu du message" : "Contenu HTML"}</Label>
      <div role="group" aria-label="Mode de rédaction" className="flex gap-1">
        <Button type="button" size="sm" variant={simple ? "secondary" : "ghost"} aria-pressed={simple} disabled={!compatible || disabled} onClick={() => setMode("simple")}>Rédaction simple</Button>
        <Button type="button" size="sm" variant={!simple ? "secondary" : "ghost"} aria-pressed={!simple} disabled={disabled} onClick={() => setMode("html")}>HTML avancé</Button>
      </div>
    </div>
    {!compatible ? <p className="text-xs text-muted-foreground">Ce contenu utilise une mise en forme avancée. Le mode HTML la conserve sans conversion.</p> : null}
    {value.length > 100000 ? <p role="alert" className="text-xs text-danger">La limite de 100 000 caractères HTML est dépassée. Réduisez le message avant de l’enregistrer ou de l’envoyer.</p> : null}
    {simple ? <SimpleEmailEditor value={value} onChange={onChange} disabled={disabled} /> : <Textarea
      id="email-html" name="bodyHtml" value={value} onChange={event => { setMode("html"); onChange(event.target.value) }}
      rows={14} required minLength={10} maxLength={100000} disabled={disabled} className="font-mono text-base sm:text-xs"
    />}
  </div>
}

function SimpleEmailEditor({ value, onChange, disabled }: ComposerProps) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const [linkError, setLinkError] = useState("")
  const editor = useEditor({
    extensions: [StarterKit.configure({
      code: false, codeBlock: false, horizontalRule: false, strike: false, underline: false,
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: false, linkOnPaste: false, HTMLAttributes: { target: null, rel: "noopener noreferrer" } },
    })],
    content: value,
    immediatelyRender: false,
    editable: !disabled,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: { attributes: {
      id: "email-html", role: "textbox", "aria-labelledby": "email-content-label", "aria-multiline": "true",
      "aria-required": "true", "aria-disabled": String(disabled), "aria-readonly": String(disabled),
      class: "h-72 overflow-y-auto rounded-b-md border border-input bg-background px-3 py-3 text-base leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3",
    } },
  })
  const state = useEditorState({ editor, selector: ({ editor }) => ({
    bold: editor?.isActive("bold") ?? false, italic: editor?.isActive("italic") ?? false,
    bullet: editor?.isActive("bulletList") ?? false, ordered: editor?.isActive("orderedList") ?? false,
    link: editor?.isActive("link") ?? false, undo: editor?.can().undo() ?? false, redo: editor?.can().redo() ?? false,
  }) })

  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled, false)
    editor.view.dom.setAttribute("aria-disabled", String(disabled))
    editor.view.dom.setAttribute("aria-readonly", String(disabled))
  }, [editor, disabled])

  function applyLink() {
    try {
      const url = new URL(linkUrl)
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid protocol")
      editor?.chain().focus().extendMarkRange("link").setLink({ href: url.href }).run()
      setLinkOpen(false); setLinkError("")
    } catch { setLinkError("Utilisez une adresse commençant par https:// ou http://.") }
  }

  if (!editor) return <p role="status" className="text-sm text-muted-foreground">Chargement de l’éditeur…</p>
  return <div>
    <div role="toolbar" aria-label="Mise en forme du message" className="flex flex-wrap gap-1 rounded-t-md border border-b-0 border-input bg-muted/40 p-1">
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Gras" aria-pressed={state?.bold} disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()}><Bold /></Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Italique" aria-pressed={state?.italic} disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic /></Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Liste à puces" aria-pressed={state?.bullet} disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()}><List /></Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Liste numérotée" aria-pressed={state?.ordered} disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered /></Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Insérer ou modifier un lien" aria-pressed={state?.link} disabled={disabled} onClick={() => { setLinkUrl(editor.getAttributes("link").href ?? "https://"); setLinkError(""); setLinkOpen(open => !open) }}><Link2 /></Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Annuler la dernière modification" disabled={disabled || !state?.undo} onClick={() => editor.chain().focus().undo().run()}><Undo2 /></Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Rétablir la modification" disabled={disabled || !state?.redo} onClick={() => editor.chain().focus().redo().run()}><Redo2 /></Button>
    </div>
    {linkOpen ? <div className="space-y-2 border border-b-0 border-input bg-card p-3">
      <Label htmlFor="email-link-url">Adresse du lien</Label>
      <Input id="email-link-url" type="url" value={linkUrl} onChange={event => setLinkUrl(event.target.value)} disabled={disabled}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); applyLink() } else if (event.key === "Escape") { event.preventDefault(); setLinkOpen(false); editor.commands.focus() } }} />
      {linkError ? <p role="alert" className="text-xs text-danger">{linkError}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={disabled} onClick={applyLink}>Appliquer le lien</Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled || !state?.link} onClick={() => { editor.chain().focus().unsetLink().run(); setLinkOpen(false) }}>Retirer le lien</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setLinkOpen(false); editor.commands.focus() }}>Annuler</Button>
      </div>
    </div> : null}
    <EditorContent editor={editor} />
  </div>
}
