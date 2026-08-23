"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion"
import {
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  CircleDollarSign,
  CloudDownload,
  Code2,
  Database,
  Clock3,
  FileCheck2,
  FileJson2,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Menu,
  ReceiptText,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  TimerReset,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react"
import { Children, useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const navItems = [
  { label: "Produit", href: "/fonctionnalites" },
  { label: "Solutions", href: "/#workflow" },
  { label: "Factur-X", href: "/conformite" },
  { label: "Tarifs", href: "/tarifs" },
  { label: "Ressources", href: "/faq" },
]

const workflowSteps = [
  {
    label: "Devis",
    title: "Une proposition prête à décider.",
    copy: "Le besoin, le budget et les lignes de prestation restent rattachés au client. Le devis part avec le bon contexte, sans reconstruction.",
    icon: FileCheck2,
  },
  {
    label: "Contrat",
    title: "L’accord devient un cadre de travail.",
    copy: "Une fois signé, le contrat ouvre la mission avec les jalons, les dates et les conditions déjà validées.",
    icon: BriefcaseBusiness,
  },
  {
    label: "Mission & temps",
    title: "Le réalisé alimente la suite.",
    copy: "Temps, avancement et validations remontent dans le dossier. Vous voyez ce qui est livré, facturable ou encore à arbitrer.",
    icon: TimerReset,
  },
  {
    label: "Facture & paiement",
    title: "La mission reste suivie jusqu’au virement.",
    copy: "Factur-X, échéance, relances et preuve de paiement partagent la même histoire, jusqu’à l’encaissement.",
    icon: ReceiptText,
  },
]

const sidebarItems = [
  { icon: LayoutDashboard, label: "Cockpit", active: true },
  { icon: UsersRound, label: "CRM" },
  { icon: FileText, label: "Devis" },
  { icon: BriefcaseBusiness, label: "Contrats" },
  { icon: FolderKanban, label: "Projets" },
  { icon: Clock3, label: "Temps" },
  { icon: ReceiptText, label: "Factures" },
  { icon: WalletCards, label: "Paiements" },
  { icon: BarChart3, label: "Rapports" },
]

function useMarketingReducedMotion() {
  const motionPreference = useReducedMotion()
  const [mediaPreference, setMediaPreference] = useState(false)

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updatePreference = () => setMediaPreference(media.matches)
    updatePreference()
    media.addEventListener("change", updatePreference)
    return () => media.removeEventListener("change", updatePreference)
  }, [])

  return Boolean(motionPreference || mediaPreference)
}

export function MarketingScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 150,
    damping: 32,
    restDelta: 0.001,
  })

  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-freelio-accent"
      style={{ scaleX }}
    />
  )
}

export function MarketingDesktopNav() {
  const pathname = usePathname()

  return (
    <nav className="hidden items-center gap-6 md:flex" aria-label="Navigation principale">
      {navItems.map((item) => {
        const active = !item.href.includes("#") && pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-11 items-center px-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent focus-visible:ring-offset-4",
              active ? "text-freelio-ink" : "text-freelio-muted hover:text-freelio-ink",
            )}
          >
            {item.label}
            {active && (
              <motion.span
                layoutId="marketing-active-nav"
                aria-hidden
                className="absolute inset-x-1 bottom-1 h-0.5 origin-center rounded-full bg-freelio-accent"
                transition={{ type: "spring", duration: 0.35, bounce: 0 }}
              />
            )}
          </Link>
        )
      })}
    </nav>
  )
}

export function HeroIntroMotion({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useMarketingReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : "ready"}
      animate="visible"
      variants={{ visible: { transition: { delayChildren: delay, staggerChildren: reduceMotion ? 0 : 0.09 } } }}
    >
      {Children.map(children, (child) => (
        <motion.div
          variants={{
            ready: { opacity: 1, y: reduceMotion ? 0 : 8 },
            visible: { opacity: 1, y: 0, transition: { type: "spring", duration: 0.38, bounce: 0 } },
          }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}

export function SectionReveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useMarketingReducedMotion()
  return (
    <motion.div
      className={cn("marketing-section-reveal", className)}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      animate={reduceMotion ? { opacity: 1, y: 0 } : undefined}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ type: "spring", duration: 0.48, bounce: 0, delay }}
    >
      {children}
    </motion.div>
  )
}

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="md:hidden">
      <button
        type="button"
        aria-controls="marketing-mobile-nav"
        aria-expanded={open}
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        onClick={() => setOpen((value) => !value)}
        className="grid size-11 place-items-center rounded-md border border-freelio-line bg-white text-freelio-ink transition-[background-color,border-color,transform] hover:bg-freelio-surface-2 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="marketing-mobile-nav"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            className="absolute inset-x-4 top-[68px] z-10 origin-top overflow-hidden rounded-freelio-frame border border-freelio-line bg-white p-3 shadow-freelio-panel"
          >
            <nav className="divide-y divide-freelio-line" aria-label="Navigation mobile">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={!item.href.includes("#") && pathname === item.href ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn("flex min-h-12 items-center justify-between rounded-md px-2 text-sm font-semibold", !item.href.includes("#") && pathname === item.href ? "bg-freelio-accent-soft text-freelio-accent" : "text-freelio-ink")}
                >
                  {item.label}
                  <ChevronRight className="size-4 text-freelio-muted" />
                </Link>
              ))}
            </nav>
            <Link
              href="/auth/login"
              onClick={() => setOpen(false)}
              className="group mt-3 flex h-11 items-center justify-center gap-2 rounded-md bg-freelio-accent px-4 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-freelio-accent-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent focus-visible:ring-offset-2"
            >
              Essayer gratuitement
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function HeroProductScene() {
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = useMarketingReducedMotion()
  const tiltX = useMotionValue(0)
  const tiltY = useMotionValue(0)
  const smoothTiltX = useSpring(tiltX, { stiffness: 170, damping: 26, mass: 0.7 })
  const smoothTiltY = useSpring(tiltY, { stiffness: 170, damping: 26, mass: 0.7 })
  const { scrollYProgress } = useScroll({
    target: sceneRef,
    offset: ["start end", "end start"],
  })
  const quoteY = useTransform(scrollYProgress, [0, 1], [22, -26])
  const contractY = useTransform(scrollYProgress, [0, 1], [46, -18])
  const invoiceY = useTransform(scrollYProgress, [0, 1], [8, -38])
  const paymentY = useTransform(scrollYProgress, [0, 1], [42, -12])
  const cockpitY = useTransform(scrollYProgress, [0, 1], [18, -12])

  return (
    <motion.div
      ref={sceneRef}
      className="relative mx-auto w-full max-w-[1536px]"
      aria-label="Aperçu du cockpit Freelio et des documents reliés"
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.48, ease: [0.2, 0, 0, 1], delay: 0.12 }}
      onPointerMove={(event) => {
        if (reduceMotion || event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
        const bounds = event.currentTarget.getBoundingClientRect()
        const x = (event.clientX - bounds.left) / bounds.width - 0.5
        const y = (event.clientY - bounds.top) / bounds.height - 0.5
        tiltX.set(y * -1.3)
        tiltY.set(x * 1.6)
      }}
      onPointerLeave={() => {
        tiltX.set(0)
        tiltY.set(0)
      }}
    >
      <div className="relative hidden min-h-[690px] lg:block">
        <RouteDrawing reduceMotion={reduceMotion} />

        <motion.div
          style={reduceMotion ? undefined : { y: quoteY }}
          className="absolute left-[1.5%] top-6 z-20 w-[230px] xl:left-[3%] xl:w-[250px]"
        >
          <QuoteDocument />
        </motion.div>

        <motion.div
          style={reduceMotion ? undefined : { y: contractY }}
          className="absolute left-0 top-[318px] z-10 w-[210px] -rotate-3 xl:left-[1%] xl:w-[232px]"
        >
          <ContractDocument />
        </motion.div>

        <div className="absolute left-1/2 top-[110px] z-20 w-[min(780px,61vw)] -translate-x-1/2">
          <motion.div
            className="marketing-tilt-scene"
            style={reduceMotion ? undefined : { y: cockpitY, rotateX: smoothTiltX, rotateY: smoothTiltY, transformPerspective: 1400 }}
          >
            <CockpitPanel />
          </motion.div>
        </div>

        <motion.div
          style={reduceMotion ? undefined : { y: invoiceY }}
          className="absolute right-[1.5%] top-4 z-20 w-[236px] xl:right-[3%] xl:w-[258px]"
        >
          <InvoiceDocument />
        </motion.div>

        <motion.div
          style={reduceMotion ? undefined : { y: paymentY }}
          className="absolute right-[0.5%] top-[392px] z-30 w-[210px] rotate-2 xl:right-[2%] xl:w-[228px]"
        >
          <PaymentCard />
        </motion.div>

        <motion.div
          animate={reduceMotion ? undefined : { y: [0, -7, 0] }}
          transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[84px] right-[20%] z-30 w-[205px] -rotate-2 xl:right-[22%]"
        >
          <TimeCard />
        </motion.div>

        <HeroMetricRail />
      </div>

      <div className="px-4 pb-8 sm:px-8 lg:hidden">
        <CockpitPanel compact />
        <div className="mt-3 hidden gap-3 sm:grid sm:grid-cols-2">
          <QuoteDocument compact />
          <PaymentCard compact />
        </div>
        <HeroMetricRail compact />
      </div>
    </motion.div>
  )
}

const heroRoutePath = "M 205 120 C 260 120, 272 180, 272 226 L 272 292 C 272 334, 314 342, 358 342 L 505 342 C 548 342, 560 390, 604 390 L 814 390 C 856 390, 860 458, 900 458 L 1058 458 C 1108 458, 1122 384, 1170 384 L 1272 384 C 1316 384, 1320 314, 1320 278 L 1320 138"

function RouteDrawing({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 1536 690"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-0 size-full overflow-visible"
    >
      <motion.path
        className="marketing-route-flow"
        d={heroRoutePath}
        fill="none"
        stroke="var(--color-freelio-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
        whileInView={reduceMotion ? undefined : { pathLength: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: 1.55, ease: [0.2, 0, 0, 1] }}
      />
      <motion.path
        d={heroRoutePath}
        fill="none"
        stroke="var(--color-freelio-accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="3 18"
        opacity={reduceMotion ? 0 : 0.38}
        animate={reduceMotion ? undefined : { strokeDashoffset: [0, -42] }}
        transition={{ duration: 1.9, repeat: Infinity, ease: "linear" }}
      />
      {[205, 358, 604, 900, 1170, 1320].map((cx, index) => {
        const coordinates = [
          [cx, 120],
          [cx, 342],
          [cx, 390],
          [cx, 458],
          [cx, 384],
          [cx, 138],
        ][index]
        return (
          <motion.circle
            key={cx}
            cx={coordinates[0]}
            cy={coordinates[1]}
            r="5"
            fill="white"
            stroke="var(--color-freelio-accent)"
            strokeWidth="2"
            initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
            whileInView={reduceMotion ? undefined : { scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", duration: 0.35, bounce: 0, delay: 0.45 + index * 0.12 }}
          />
        )
      })}
    </motion.svg>
  )
}

function CockpitPanel({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-freelio-frame border border-freelio-line-strong bg-white shadow-freelio-stage", compact && "shadow-freelio-panel")}>
      <div className="flex h-11 items-center justify-between border-b border-freelio-line bg-white px-3 sm:px-4">
        <div className="flex items-center gap-2">
          <BrandMark small />
          <span className="text-[11px] font-bold text-freelio-ink">Freelio</span>
        </div>
        <div className="hidden h-7 w-[180px] items-center gap-2 rounded-md border border-freelio-line bg-freelio-surface-2 px-2.5 sm:flex">
          <Search className="size-3 text-freelio-muted" />
          <span className="text-[8px] text-freelio-muted">Rechercher un client, un document…</span>
        </div>
        <div className="flex items-center gap-2 text-freelio-muted">
          <Bell className="size-3.5" />
          <span className="grid size-6 place-items-center rounded-full bg-freelio-accent-soft text-[8px] font-bold text-freelio-accent">JM</span>
        </div>
      </div>

      <div className={cn("grid", compact ? "grid-cols-1" : "grid-cols-[126px_minmax(0,1fr)]")}>
        {!compact && (
          <aside className="border-r border-freelio-line bg-freelio-surface-2 px-2.5 py-4">
            <div className="space-y-1">
              {sidebarItems.map(({ icon: Icon, label, active }) => (
                <span
                  key={label}
                  className={cn(
                    "flex h-7 items-center gap-2 rounded-md px-2 text-[8px] font-medium",
                    active ? "bg-freelio-accent text-white shadow-[0_1px_2px_rgba(10,99,246,0.24)]" : "text-freelio-muted",
                  )}
                >
                  <Icon className="size-3" />
                  {label}
                </span>
              ))}
            </div>
            <div className="mt-4 border-t border-freelio-line pt-3">
              <span className="flex h-7 items-center gap-2 px-2 text-[8px] text-freelio-muted"><Settings2 className="size-3" />Réglages</span>
            </div>
          </aside>
        )}

        <div className="min-w-0 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] text-freelio-muted">Mardi 16 juin</p>
              <p className="marketing-display mt-1 text-base font-bold text-freelio-ink sm:text-lg">Bonjour Julien</p>
            </div>
            <span className="hidden h-8 items-center gap-1.5 rounded-md bg-freelio-accent px-3 text-[9px] font-semibold text-white sm:inline-flex">
              <span className="text-sm leading-none">+</span>Nouveau
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 divide-x divide-y divide-freelio-line overflow-hidden rounded-md border border-freelio-line sm:grid-cols-4 sm:divide-y-0">
            {[
              ["Chiffre d’affaires", "12 840 €", "+ 18 %"],
              ["Temps à facturer", "18h45", "2 340 €"],
              ["À relancer", "3 280 €", "1 facture"],
              ["Trésorerie", "14 560 €", "+ 8 %"],
            ].map(([label, value, note], index) => (
              <div key={label} className={cn("min-w-0 p-2.5", index === 2 && "sm:border-l-0")}>
                <p className="truncate text-[7px] font-medium text-freelio-muted">{label}</p>
                <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-freelio-ink sm:text-[15px]">{value}</p>
                <p className={cn("mt-1 text-[7px] font-medium", index === 2 ? "text-freelio-danger" : "text-freelio-success")}>{note}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[1.18fr_0.82fr]">
            <div className="overflow-hidden rounded-md border border-freelio-line">
              <div className="flex items-center justify-between border-b border-freelio-line px-3 py-2.5">
                <p className="text-[9px] font-semibold text-freelio-ink">Missions en cours</p>
                <span className="font-mono text-[7px] text-freelio-muted">4 ACTIVES</span>
              </div>
              {[ 
                ["Atelier Rivet", "Refonte site", "60 %", "8 160 €"],
                ["Maison Lune", "Application mobile", "35 %", "6 000 €"],
                ["Studio Sept", "Identité visuelle", "90 %", "2 400 €"],
              ].map(([client, mission, progress, budget]) => (
                <div key={client} className="grid grid-cols-[1fr_52px_58px] items-center gap-2 border-b border-freelio-line px-3 py-2 last:border-0">
                  <div className="min-w-0"><p className="truncate text-[8px] font-semibold text-freelio-ink">{client}</p><p className="truncate text-[7px] text-freelio-muted">{mission}</p></div>
                  <div><div className="h-1 overflow-hidden rounded-full bg-freelio-line"><span className="block h-full rounded-full bg-freelio-accent" style={{ width: progress }} /></div><p className="mt-1 text-right font-mono text-[7px] text-freelio-muted">{progress}</p></div>
                  <p className="text-right font-mono text-[7px] font-medium text-freelio-ink">{budget}</p>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-freelio-line bg-freelio-surface-2 p-3">
              <div className="flex items-center justify-between"><p className="text-[9px] font-semibold text-freelio-ink">Temps suivi</p><Clock3 className="size-3 text-freelio-accent" /></div>
              <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-freelio-ink">18:45 h</p>
              <p className="mt-1 text-[7px] font-medium text-freelio-success">+ 2:30 h cette semaine</p>
              <div className="mt-4 flex h-16 items-end gap-1.5 border-b border-freelio-line px-1">
                {[38, 55, 72, 48, 82, 64, 34].map((height, index) => (
                  <span key={index} className={cn("flex-1 rounded-t-sm", index === 4 ? "bg-freelio-accent" : "bg-freelio-accent/20")} style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="mt-1 flex justify-between font-mono text-[6px] text-freelio-muted"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
            </div>
          </div>

          <div className="mt-3 hidden grid-cols-[1fr_auto] items-center gap-4 rounded-md border border-freelio-line px-3 py-2.5 sm:grid">
            <div className="flex items-center gap-3"><CheckCircle2 className="size-3.5 text-freelio-success" /><div><p className="text-[8px] font-semibold text-freelio-ink">Factur-X prêt à émettre</p><p className="mt-0.5 text-[7px] text-freelio-muted">Données structurées et mentions vérifiées</p></div></div>
            <span className="rounded-md bg-freelio-success-soft px-2 py-1 text-[7px] font-semibold text-freelio-success">CONFORME</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function QuoteDocument({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-freelio-line-strong bg-white p-4 shadow-freelio-float", compact && "h-full shadow-none")}>
      <div className="flex items-start justify-between gap-3 border-b border-freelio-line pb-3">
        <div><p className="text-[10px] font-bold text-freelio-ink">DEVIS</p><p className="font-mono text-[7px] text-freelio-muted">DEV-2026-041</p></div>
        <span className="rounded-md bg-freelio-success-soft px-2 py-1 text-[8px] font-semibold text-freelio-success">Accepté</span>
      </div>
      <div className="mt-3 flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-freelio-accent-soft text-[8px] font-bold text-freelio-accent">AR</span><div><p className="text-[8px] font-semibold text-freelio-ink">Atelier Rivet</p><p className="text-[7px] text-freelio-muted">Refonte du site vitrine</p></div></div>
      <div className="mt-4 space-y-2">
        {[ ["Direction artistique", "3 200 €"], ["Conception UI", "2 400 €"], ["Intégration", "1 200 €"] ].map(([label, value]) => <div key={label} className="flex items-center justify-between border-b border-freelio-line pb-2 text-[7px]"><span className="text-freelio-muted">{label}</span><span className="font-mono font-medium text-freelio-ink">{value}</span></div>)}
      </div>
      <div className="mt-3 flex items-end justify-between"><span className="text-[7px] text-freelio-muted">Total TTC</span><span className="font-mono text-sm font-semibold text-freelio-ink">8 160 €</span></div>
    </div>
  )
}

function ContractDocument() {
  return (
    <div className="rounded-lg border border-freelio-line-strong bg-white p-4 shadow-freelio-float">
      <div className="flex items-start justify-between border-b border-freelio-line pb-3"><div><p className="text-[10px] font-bold text-freelio-ink">CONTRAT</p><p className="font-mono text-[7px] text-freelio-muted">CTR-2026-041</p></div><span className="rounded-md bg-freelio-success-soft px-2 py-1 text-[8px] font-semibold text-freelio-success">Signé</span></div>
      <div className="mt-4 space-y-3 text-[7px] text-freelio-muted"><p>Entre Atelier Rivet et Julien Martin</p><p>Mission : refonte du site vitrine</p><p>Budget : 8 160 € TTC</p><p>Du 12 mai au 30 juin 2026</p></div>
      <div className="mt-5 h-px bg-freelio-line" />
      <div className="mt-3 flex items-end justify-between"><span className="text-[7px] text-freelio-muted">Signature électronique</span><span className="marketing-display -rotate-6 text-lg italic text-freelio-ink">J. Martin</span></div>
    </div>
  )
}

function InvoiceDocument() {
  return (
    <div className="rounded-lg border border-freelio-line-strong bg-white p-4 shadow-freelio-float">
      <div className="flex items-start justify-between gap-3 border-b border-freelio-line pb-3"><div><p className="text-[10px] font-bold text-freelio-ink">FACTURE</p><p className="font-mono text-[7px] text-freelio-muted">FAC-2026-041</p></div><span className="rounded-md bg-freelio-accent-soft px-2 py-1 text-[8px] font-semibold text-freelio-accent">Factur-X</span></div>
      <div className="mt-4 grid grid-cols-2 gap-4 text-[7px]"><div><p className="text-freelio-muted">Émetteur</p><p className="mt-1 font-semibold text-freelio-ink">Julien Martin</p><p className="mt-1 leading-4 text-freelio-muted">Paris · France<br />SIRET vérifié</p></div><div><p className="text-freelio-muted">Client</p><p className="mt-1 font-semibold text-freelio-ink">Atelier Rivet</p><p className="mt-1 leading-4 text-freelio-muted">Échéance<br />2 juillet 2026</p></div></div>
      <div className="mt-4 border-y border-freelio-line py-3">
        {[ ["Direction artistique", "3 200 €"], ["Conception UI", "2 400 €"], ["Intégration", "1 200 €"] ].map(([label, value]) => <div key={label} className="flex justify-between py-1 text-[7px]"><span className="text-freelio-muted">{label}</span><span className="font-mono text-freelio-ink">{value}</span></div>)}
      </div>
      <div className="mt-3 flex items-end justify-between"><span className="text-[7px] text-freelio-muted">Total TTC</span><span className="font-mono text-sm font-semibold text-freelio-accent">8 160 €</span></div>
    </div>
  )
}

function PaymentCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-freelio-success/30 bg-white p-4 shadow-freelio-float", compact && "h-full shadow-none")}>
      <div className="flex items-center gap-2 text-freelio-success"><span className="grid size-6 place-items-center rounded-full bg-freelio-success text-white"><Check className="size-3.5" /></span><span className="text-xs font-semibold">Paiement reçu</span></div>
      <p className="mt-4 text-[8px] text-freelio-muted">Atelier Rivet</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-freelio-ink">8 160,00 €</p>
      <p className="mt-3 border-t border-freelio-line pt-3 text-[7px] leading-4 text-freelio-muted">Virement bancaire reçu le 2 juin 2026<br />Réf. TRX-2026-0873</p>
      <span className="mt-3 inline-flex rounded-md bg-freelio-success-soft px-2 py-1 text-[8px] font-semibold text-freelio-success">Payé</span>
    </div>
  )
}

function TimeCard() {
  return (
    <div className="rounded-lg border border-freelio-line-strong bg-white p-3 shadow-freelio-float">
      <div className="flex items-center justify-between"><div><p className="text-[8px] font-semibold text-freelio-ink">Temps suivi</p><p className="mt-0.5 text-[7px] text-freelio-muted">Refonte du site</p></div><span className="grid size-7 place-items-center rounded-full bg-freelio-accent text-white"><Clock3 className="size-3.5" /></span></div>
      <p className="mt-4 font-mono text-2xl font-semibold tabular-nums text-freelio-accent">18:45</p>
      <div className="mt-3 flex items-center justify-between border-t border-freelio-line pt-2 text-[7px]"><span className="text-freelio-muted">Cette semaine</span><span className="font-medium text-freelio-ink">+ 3h20</span></div>
    </div>
  )
}

function HeroMetricRail({ compact = false }: { compact?: boolean }) {
  const metrics = [
    { icon: Bell, label: "À relancer aujourd’hui", value: "3 280 €", tone: "danger" },
    { icon: Clock3, label: "Temps à facturer", value: "18h45", tone: "accent" },
    { icon: CircleDollarSign, label: "TVA collectée", value: "73 %", tone: "success" },
  ]

  return (
    <div className={cn("grid overflow-hidden rounded-lg border border-freelio-line-strong bg-white shadow-freelio-panel", compact ? "mt-3 grid-cols-1 divide-y divide-freelio-line" : "absolute bottom-2 left-1/2 z-30 w-[58%] -translate-x-1/2 grid-cols-3 divide-x divide-freelio-line")}>
      {metrics.map(({ icon: Icon, label, value, tone }) => (
        <div key={label} className="flex min-w-0 items-center gap-3 px-4 py-3">
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", tone === "danger" && "bg-freelio-danger-soft text-freelio-danger", tone === "accent" && "bg-freelio-accent-soft text-freelio-accent", tone === "success" && "bg-freelio-success-soft text-freelio-success")}><Icon className="size-4" /></span>
          <div className="min-w-0"><p className="truncate text-[8px] text-freelio-muted">{label}</p><p className={cn("mt-0.5 font-mono text-base font-semibold tabular-nums", tone === "danger" && "text-freelio-danger", tone === "accent" && "text-freelio-accent", tone === "success" && "text-freelio-success")}>{value}</p></div>
          <ArrowRight className="ml-auto size-3 text-freelio-muted" />
        </div>
      ))}
    </div>
  )
}

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span aria-hidden className={cn("relative block shrink-0", small ? "size-5" : "size-8")}>
      <span className="absolute left-[14%] top-[8%] h-[32%] w-[62%] skew-y-[-24deg] rounded-[2px] bg-freelio-accent" />
      <span className="absolute left-[14%] top-[36%] h-[28%] w-[48%] skew-y-[-24deg] rounded-[2px] bg-freelio-accent" />
      <span className="absolute bottom-[5%] left-[14%] h-[44%] w-[24%] skew-y-[-24deg] rounded-[2px] bg-freelio-accent" />
    </span>
  )
}

type RouteVisualVariant = "features" | "pricing" | "compliance" | "faq"

export function RouteHeroVisual({ variant }: { variant: RouteVisualVariant }) {
  const reduceMotion = useMarketingReducedMotion()
  const labels = {
    features: "Dossier 26-041 · Vue produit",
    pricing: "Coût mensuel · Simulation",
    compliance: "Facture FAC-2026-041 · Préparation",
    faq: "Centre de réponses · Freelio",
  }

  const list = {
    hidden: {},
    visible: {
      transition: { staggerChildren: reduceMotion ? 0 : 0.09 },
    },
  }
  const item = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 12 },
    visible: { opacity: 1, y: 0, transition: { type: "spring" as const, duration: 0.4, bounce: 0 } },
  }

  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      animate={reduceMotion ? "visible" : undefined}
      whileInView="visible"
      viewport={{ once: true, amount: 0.12 }}
      variants={list}
      className="marketing-route-visual overflow-hidden rounded-freelio-frame border border-freelio-line-strong bg-white shadow-freelio-stage"
    >
      <div className="flex h-11 items-center justify-between border-b border-freelio-line bg-freelio-surface-2 px-4">
        <div className="flex items-center gap-2"><BrandMark small /><span className="text-[10px] font-semibold text-freelio-ink">{labels[variant]}</span></div>
        <div className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-freelio-success shadow-[0_0_0_3px_var(--color-freelio-success-soft)]" /><span className="text-[8px] font-medium text-freelio-muted">À jour</span></div>
      </div>
      <div className="min-h-[340px] p-4 sm:p-6 lg:min-h-[390px] lg:p-8">
        {variant === "features" && <FeaturesVisual item={item} />}
        {variant === "pricing" && <PricingVisual item={item} />}
        {variant === "compliance" && <ComplianceVisual item={item} reduceMotion={Boolean(reduceMotion)} />}
        {variant === "faq" && <FaqVisual item={item} />}
      </div>
    </motion.div>
  )
}

type MotionItem = {
  hidden: { opacity: number; y: number }
  visible: { opacity: number; y: number; transition: { type: "spring"; duration: number; bounce: number } }
}

function FeaturesVisual({ item }: { item: MotionItem }) {
  const stages = [
    { icon: FileCheck2, label: "Devis", value: "8 160 €", status: "Accepté" },
    { icon: BriefcaseBusiness, label: "Contrat", value: "Signé", status: "07 mai" },
    { icon: TimerReset, label: "Mission", value: "18h45", status: "60 %" },
    { icon: ReceiptText, label: "Facture", value: "Factur-X", status: "Émise" },
    { icon: WalletCards, label: "Paiement", value: "8 160 €", status: "Reçu" },
  ]

  return (
    <div className="relative h-full min-h-[300px]">
      <span aria-hidden className="absolute left-[8%] right-[8%] top-[76px] h-px bg-freelio-accent-line" />
      <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stages.map(({ icon: Icon, label, value, status }, index) => (
          <motion.div key={label} variants={item} className={cn("marketing-variant-item relative rounded-lg border bg-white p-3 shadow-freelio-float", index === 2 ? "border-freelio-accent-line sm:-translate-y-2" : "border-freelio-line")}>
            <span className={cn("grid size-8 place-items-center rounded-md", index === 2 ? "bg-freelio-accent text-white" : "bg-freelio-accent-soft text-freelio-accent")}><Icon className="size-3.5" /></span>
            <p className="mt-5 text-[9px] font-semibold text-freelio-muted">0{index + 1} · {label}</p>
            <p className="mt-2 font-mono text-sm font-semibold tabular-nums text-freelio-ink">{value}</p>
            <p className={cn("mt-2 text-[8px] font-medium", index === 4 ? "text-freelio-success" : "text-freelio-accent")}>{status}</p>
          </motion.div>
        ))}
      </div>
      <motion.div variants={item} className="marketing-variant-item mt-5 grid gap-px overflow-hidden rounded-lg border border-freelio-line bg-freelio-line sm:grid-cols-[1.25fr_0.75fr]">
        <div className="bg-white p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold text-freelio-ink">Mission · Refonte Atelier Rivet</p><span className="rounded-md bg-freelio-accent-soft px-2 py-1 text-[8px] font-semibold text-freelio-accent">EN COURS</span></div><div className="mt-4 space-y-3">{[["Cadrage", "100%"], ["Design", "82%"], ["Intégration", "57%"]].map(([label, progress]) => <div key={label}><div className="flex justify-between text-[8px]"><span className="text-freelio-muted">{label}</span><span className="font-mono text-freelio-ink">{progress}</span></div><div className="mt-1.5 h-1 rounded-full bg-freelio-line"><div className="h-full rounded-full bg-freelio-accent" style={{ width: progress }} /></div></div>)}</div></div>
        <div className="bg-freelio-surface-2 p-4"><p className="text-[9px] font-semibold text-freelio-ink">Prochaine action</p><p className="marketing-display mt-4 text-xl font-bold text-freelio-ink">Facturer 6h20</p><p className="mt-2 text-[8px] leading-4 text-freelio-muted">Le temps validé et les lignes du devis sont déjà disponibles.</p><span className="mt-4 inline-flex rounded-md bg-freelio-accent px-2.5 py-1.5 text-[8px] font-semibold text-white">Préparer la facture</span></div>
      </motion.div>
    </div>
  )
}

function PricingVisual({ item }: { item: MotionItem }) {
  const tools = [
    ["CRM", "12 €"],
    ["Facturation", "19 €"],
    ["Suivi du temps", "8 €"],
    ["Signature", "14 €"],
  ]
  return (
    <div className="grid min-h-[300px] gap-5 lg:grid-cols-[0.9fr_auto_1.1fr] lg:items-center">
      <motion.div variants={item} className="marketing-variant-item rounded-lg border border-freelio-line bg-white p-4"><div className="flex items-center justify-between border-b border-freelio-line pb-3"><p className="text-[10px] font-semibold text-freelio-ink">Outils séparés</p><span className="font-mono text-[9px] text-freelio-danger">53 € / mois</span></div><div className="mt-2">{tools.map(([label, value]) => <div key={label} className="flex items-center justify-between border-b border-freelio-line py-2.5 text-[9px] last:border-0"><span className="text-freelio-muted">{label}</span><span className="font-mono text-freelio-ink">{value}</span></div>)}</div><p className="mt-3 text-[8px] text-freelio-muted">4 abonnements · 4 historiques · ressaisies</p></motion.div>
      <motion.div variants={item} className="marketing-variant-item hidden size-10 place-items-center rounded-full border border-freelio-line bg-freelio-surface-2 text-freelio-accent lg:grid"><ArrowRight className="size-4" /></motion.div>
      <motion.div variants={item} className="marketing-variant-item relative overflow-hidden rounded-lg border border-freelio-accent-line bg-freelio-accent-soft p-5"><span className="absolute right-0 top-0 bg-freelio-accent px-3 py-1.5 text-[8px] font-semibold text-white">RECOMMANDÉ</span><p className="text-[9px] font-semibold uppercase text-freelio-accent">Freelio Solo</p><div className="mt-5 flex items-end gap-2"><p className="font-mono text-4xl font-semibold tabular-nums text-freelio-ink">19 €</p><p className="pb-1 text-[9px] text-freelio-muted">/ mois HT</p></div><div className="mt-5 grid grid-cols-2 gap-2">{["Clients & CRM", "Devis & contrats", "Projets & temps", "Factur-X", "Relances", "Exports"].map((feature) => <p key={feature} className="flex items-center gap-1.5 text-[8px] text-freelio-ink"><Check className="size-3 text-freelio-success" />{feature}</p>)}</div><div className="mt-5 flex items-center justify-between border-t border-freelio-accent-line pt-4"><span className="text-[8px] text-freelio-muted">Économie estimée</span><span className="font-mono text-lg font-semibold text-freelio-success">34 € / mois</span></div></motion.div>
    </div>
  )
}

function ComplianceVisual({ item, reduceMotion }: { item: MotionItem; reduceMotion: boolean }) {
  const checks = [
    [ShieldCheck, "SIRET et mentions", "Vérifiés"],
    [FileJson2, "Données structurées", "XML prêt"],
    [Database, "Piste d’audit", "Archivée"],
    [CloudDownload, "Exports", "Disponibles"],
  ] as const
  return (
    <div className="grid min-h-[300px] gap-5 sm:grid-cols-[1.1fr_0.9fr]">
      <motion.div variants={item} className="marketing-variant-item relative min-h-[285px] rounded-lg border border-freelio-line bg-freelio-surface-2 p-5">
        <div className="absolute left-[10%] top-8 w-[56%] rotate-[-3deg] rounded-md border border-freelio-line bg-white p-4 shadow-freelio-float"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold text-freelio-ink">FACTURE</p><p className="font-mono text-[7px] text-freelio-muted">FAC-2026-041</p></div><FileText className="size-4 text-freelio-muted" /></div><div className="mt-5 h-2 w-2/5 bg-freelio-ink" /><div className="mt-3 space-y-2"><div className="h-1.5 w-full bg-freelio-line" /><div className="h-1.5 w-4/5 bg-freelio-line" /><div className="h-1.5 w-3/5 bg-freelio-line" /></div><p className="mt-7 text-right font-mono text-lg font-semibold text-freelio-ink">8 160 €</p></div>
        <motion.div animate={reduceMotion ? undefined : { y: [0, -5, 0] }} transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-5 right-[8%] w-[52%] rotate-2 rounded-md border border-freelio-accent-line bg-white p-4 shadow-freelio-float"><div className="flex items-center justify-between"><div><p className="text-[9px] font-semibold text-freelio-accent">FACTUR-X</p><p className="mt-1 text-[7px] text-freelio-muted">PDF + données structurées</p></div><Code2 className="size-4 text-freelio-accent" /></div><div className="mt-4 rounded-md bg-freelio-ink p-3 font-mono text-[6px] leading-3 text-white/70">&lt;ram:Invoice&gt;<br />&nbsp;&nbsp;&lt;Total&gt;8160.00&lt;/Total&gt;<br />&nbsp;&nbsp;&lt;Currency&gt;EUR&lt;/Currency&gt;<br />&lt;/ram:Invoice&gt;</div></motion.div>
      </motion.div>
      <motion.div variants={item} className="marketing-variant-item rounded-lg border border-freelio-line bg-white p-5"><div className="flex items-center justify-between border-b border-freelio-line pb-4"><div><p className="text-[9px] font-semibold text-freelio-ink">État de préparation</p><p className="mt-1 text-[8px] text-freelio-muted">Dossier FAC-2026-041</p></div><span className="rounded-md bg-freelio-success-soft px-2 py-1 text-[8px] font-semibold text-freelio-success">PRÊT</span></div><div className="mt-2">{checks.map(([Icon, label, status]) => <div key={label} className="grid grid-cols-[28px_1fr_auto] items-center gap-2 border-b border-freelio-line py-3 last:border-0"><span className="grid size-7 place-items-center rounded-md bg-freelio-accent-soft text-freelio-accent"><Icon className="size-3.5" /></span><span className="text-[8px] font-medium text-freelio-ink">{label}</span><span className="text-[7px] text-freelio-success">{status}</span></div>)}</div><p className="mt-4 border-t border-freelio-line pt-3 text-[8px] leading-4 text-freelio-muted">Transmission via la plateforme agréée choisie par votre entreprise.</p></motion.div>
    </div>
  )
}

function FaqVisual({ item }: { item: MotionItem }) {
  const questions = [
    "Freelio remplace-t-il mon comptable ?",
    "Comment fonctionne Factur-X ?",
    "Puis-je exporter toutes mes données ?",
    "Une carte bancaire est-elle demandée ?",
  ]
  return (
    <div className="grid min-h-[300px] gap-5 sm:grid-cols-[0.9fr_1.1fr]">
      <motion.div variants={item} className="marketing-variant-item rounded-lg border border-freelio-line bg-freelio-surface-2 p-4"><div className="flex h-10 items-center gap-2 rounded-md border border-freelio-line bg-white px-3"><Search className="size-3.5 text-freelio-accent" /><span className="text-[9px] text-freelio-muted">Rechercher une réponse…</span><span className="ml-auto rounded border border-freelio-line px-1.5 py-0.5 font-mono text-[7px] text-freelio-muted">⌘ K</span></div><div className="mt-4 space-y-2">{questions.map((question, index) => <div key={question} className={cn("flex items-center gap-3 rounded-md border px-3 py-3", index === 1 ? "border-freelio-accent-line bg-white shadow-freelio-float" : "border-transparent bg-white/60")}><span className={cn("grid size-6 place-items-center rounded-md", index === 1 ? "bg-freelio-accent text-white" : "bg-white text-freelio-muted")}><CircleHelp className="size-3" /></span><p className="text-[8px] font-medium text-freelio-ink">{question}</p><ChevronRight className="ml-auto size-3 text-freelio-muted" /></div>)}</div></motion.div>
      <motion.div variants={item} className="marketing-variant-item rounded-lg border border-freelio-accent-line bg-white p-5 shadow-freelio-panel"><div className="flex items-start justify-between gap-4 border-b border-freelio-line pb-4"><div><p className="text-[8px] font-semibold uppercase text-freelio-accent">Facturation électronique</p><p className="marketing-display mt-2 text-xl font-bold text-freelio-ink">Comment fonctionne Factur-X ?</p></div><FileJson2 className="size-5 text-freelio-accent" /></div><p className="mt-5 text-[9px] leading-5 text-freelio-muted">Freelio produit un PDF lisible auquel sont jointes des données structurées. Votre facture reste compréhensible et prête à circuler dans le bon canal.</p><div className="mt-5 grid gap-2 sm:grid-cols-3">{[[FileText, "PDF lisible"], [Code2, "XML intégré"], [ShieldCheck, "Traçable"]].map(([Icon, label]) => { const ItemIcon = Icon as typeof FileText; return <div key={label as string} className="rounded-md bg-freelio-surface-2 p-3"><ItemIcon className="size-3.5 text-freelio-accent" /><p className="mt-2 text-[8px] font-semibold text-freelio-ink">{label as string}</p></div> })}</div><div className="mt-5 flex items-center gap-2 text-[8px] font-semibold text-freelio-accent">Lire la réponse complète<ArrowRight className="size-3" /></div></motion.div>
    </div>
  )
}

export function WorkflowStory() {
  const storyRef = useRef<HTMLDivElement | null>(null)
  const stepRefs = useRef<Array<HTMLElement | null>>([])
  const reduceMotion = useMarketingReducedMotion()
  const [active, setActive] = useState(0)
  const { scrollYProgress } = useScroll({
    target: storyRef,
    offset: ["start end", "end start"],
  })

  const updateActiveStep = useCallback(() => {
    if (typeof window === "undefined") return

    const viewportAnchor = window.innerHeight * 0.5
    let nextActive = 0

    stepRefs.current.forEach((element, index) => {
      if (!element) return
      const bounds = element.getBoundingClientRect()
      const stepCenter = bounds.top + bounds.height / 2
      if (stepCenter <= viewportAnchor) nextActive = index
    })

    setActive((current) => (current === nextActive ? current : nextActive))
  }, [])

  useMotionValueEvent(scrollYProgress, "change", updateActiveStep)

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateActiveStep)
    window.addEventListener("resize", updateActiveStep)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", updateActiveStep)
    }
  }, [updateActiveStep])

  return (
    <section id="workflow" className="scroll-mt-20 border-y border-freelio-line bg-white py-20 sm:py-28">
      <div className="mx-auto w-full max-w-[1380px] px-5 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-4xl text-center">
          <p className="marketing-kicker">Un seul flux de travail</p>
          <h2 className="marketing-display mt-5 text-[42px] font-bold leading-[1.02] text-freelio-ink sm:text-[62px]">Du devis au paiement, sans rupture.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-freelio-muted sm:text-lg">Chaque écran reprend ce qui a déjà été décidé. Le travail avance sans ressaisie ni angle mort.</p>
        </div>

        <div ref={storyRef} style={reduceMotion ? { display: "none" } : undefined} className="marketing-workflow-story mt-12 hidden lg:grid lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <div className="pb-8 pt-[6vh]">
            {workflowSteps.map((step, index) => {
              const Icon = step.icon
              return (
                <article
                  ref={(element) => { stepRefs.current[index] = element }}
                  key={step.label}
                  className={cn("flex items-center", index === workflowSteps.length - 1 ? "min-h-[340px]" : "min-h-[44vh]")}
                >
                  <div className={cn("max-w-sm border-l-2 pl-6 transition-[border-color,opacity,transform] duration-300", active === index ? "translate-x-0 border-freelio-accent opacity-100" : "translate-x-1 border-freelio-line opacity-20")}>
                    <div className="flex items-center gap-3"><span className={cn("grid size-9 place-items-center rounded-md", active === index ? "bg-freelio-accent text-white" : "bg-freelio-surface-2 text-freelio-muted")}><Icon className="size-4" /></span><span className="font-mono text-xs text-freelio-muted">0{index + 1}</span></div>
                    <h3 className="marketing-display mt-6 text-3xl font-bold leading-tight text-freelio-ink">{step.title}</h3>
                    <p className="mt-4 text-sm leading-7 text-freelio-muted">{step.copy}</p>
                    <p className="mt-5 text-sm font-semibold text-freelio-accent">{step.label}</p>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="sticky top-[clamp(92px,12vh,120px)] self-start pt-2">
            <WorkflowProgress active={active} />
            <div className="relative mt-5 min-h-[370px]">
              <AnimatePresence initial={false}>
                <motion.div
                  key={active}
                  className="absolute inset-x-0 top-0"
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
                >
                  <StageScreen index={active} active />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div style={reduceMotion ? { display: "block" } : undefined} className="marketing-workflow-static mt-12 space-y-14 lg:mx-auto lg:hidden lg:max-w-[980px]">
          {workflowSteps.map((step, index) => {
            const Icon = step.icon
            return (
              <article key={step.label}>
                <div className="mb-5 flex items-start gap-4"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-freelio-accent text-white"><Icon className="size-4" /></span><div><p className="font-mono text-[10px] text-freelio-accent">0{index + 1} · {step.label}</p><h3 className="marketing-display mt-2 text-2xl font-bold text-freelio-ink">{step.title}</h3><p className="mt-3 text-sm leading-6 text-freelio-muted">{step.copy}</p></div></div>
                <StageScreen index={index} active />
              </article>
            )
          })}
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={reduceMotion ? { opacity: 1, y: 0 } : undefined}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
          className="marketing-section-reveal mt-14 flex flex-col gap-5 rounded-lg border border-freelio-line bg-freelio-surface-2 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 lg:mt-8"
        >
          <div><p className="text-sm font-semibold text-freelio-ink">Quatre étapes, un même dossier.</p><p className="mt-1 text-sm leading-6 text-freelio-muted">Le contexte ne repart jamais de zéro entre la vente, le travail et l’encaissement.</p></div>
          <Link href="/fonctionnalites" className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-freelio-ink shadow-freelio-float transition-[background-color,transform] hover:bg-freelio-accent-soft active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent">Explorer le produit<ArrowRight className="size-4 text-freelio-accent transition-transform group-hover:translate-x-0.5" /></Link>
        </motion.div>
      </div>
    </section>
  )
}

function WorkflowProgress({ active }: { active: number }) {
  return (
    <div className="relative grid grid-cols-4 px-4">
      <span aria-hidden className="absolute left-[12.5%] right-[12.5%] top-4 h-px bg-freelio-line" />
      <motion.span aria-hidden className="absolute left-[12.5%] top-4 h-px origin-left bg-freelio-accent" animate={{ scaleX: active / 3 }} transition={{ type: "spring", duration: 0.4, bounce: 0 }} style={{ width: "75%" }} />
      {workflowSteps.map((step, index) => (
        <div key={step.label} className="relative z-10 text-center"><span aria-current={index === active ? "step" : undefined} className={cn("mx-auto grid size-8 place-items-center rounded-full border bg-white font-mono text-[10px] transition-[border-color,color,box-shadow]", index <= active ? "border-freelio-accent text-freelio-accent shadow-[0_0_0_4px_var(--color-freelio-accent-soft)]" : "border-freelio-line-strong text-freelio-muted")}>{index + 1}</span><p className={cn("mt-3 text-[10px] font-semibold", index === active ? "text-freelio-ink" : "text-freelio-muted")}>{step.label}</p></div>
      ))}
    </div>
  )
}

function StageScreen({ index, active }: { index: number; active: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-white transition-[border-color,box-shadow] duration-500", active ? "border-freelio-accent-line shadow-freelio-stage" : "border-freelio-line")}>
      <div className="flex h-11 items-center justify-between border-b border-freelio-line bg-freelio-surface-2 px-4">
        <div className="flex items-center gap-2"><BrandMark small /><span className="text-[10px] font-semibold text-freelio-ink">Atelier Rivet · Refonte du site</span></div>
        <span className="font-mono text-[8px] text-freelio-muted">DOSSIER 26-041</span>
      </div>
      {index === 0 && <QuoteScreen />}
      {index === 1 && <ContractScreen />}
      {index === 2 && <DeliveryScreen />}
      {index === 3 && <PaymentScreen />}
    </div>
  )
}

function QuoteScreen() {
  return (
    <div className="grid gap-px bg-freelio-line sm:grid-cols-[1fr_220px]">
      <div className="bg-white p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-freelio-line pb-4"><div><p className="font-mono text-[9px] text-freelio-muted">DEV-2026-041</p><p className="marketing-display mt-2 text-2xl font-bold text-freelio-ink">Refonte du site vitrine</p></div><span className="rounded-md bg-freelio-success-soft px-2.5 py-1 text-[9px] font-semibold text-freelio-success">ACCEPTÉ</span></div>
        <div className="mt-3">{[["Direction artistique", "3 200 €"], ["Conception de l’interface", "2 400 €"], ["Intégration front-end", "1 200 €"]].map(([label, price]) => <div key={label} className="flex items-center justify-between border-b border-freelio-line py-3 text-[11px]"><span className="text-freelio-muted">{label}</span><span className="font-mono font-semibold text-freelio-ink">{price}</span></div>)}</div>
        <div className="flex justify-end pt-4"><div className="text-right"><p className="text-[9px] uppercase text-freelio-muted">Total TTC</p><p className="mt-1 font-mono text-2xl font-semibold text-freelio-ink">8 160 €</p></div></div>
      </div>
      <div className="bg-freelio-surface-2 p-5">
        <FileCheck2 className="size-5 text-freelio-accent" />
        <p className="mt-5 text-sm font-semibold text-freelio-ink">Décision conservée</p>
        <div className="mt-5 space-y-3 text-[10px] text-freelio-muted"><p className="flex items-center gap-2"><Check className="size-3 text-freelio-success" />Acompte 30 %</p><p className="flex items-center gap-2"><Check className="size-3 text-freelio-success" />Validité 30 jours</p><p className="flex items-center gap-2"><Check className="size-3 text-freelio-success" />Contrat généré</p></div>
        <span className="mt-8 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-freelio-accent text-[10px] font-semibold text-white"><Send className="size-3" />Ouvrir le devis</span>
      </div>
    </div>
  )
}

function ContractScreen() {
  return (
    <div className="grid gap-px bg-freelio-line sm:grid-cols-[0.9fr_1.1fr]">
      <div className="bg-freelio-surface-2 p-5 sm:p-6">
        <div className="flex items-center gap-2"><BriefcaseBusiness className="size-4 text-freelio-accent" /><p className="text-xs font-semibold text-freelio-ink">Mission ouverte automatiquement</p></div>
        <p className="marketing-display mt-6 text-2xl font-bold text-freelio-ink">Refonte du site vitrine</p>
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-freelio-line">{[["Début", "12 mai 2026"], ["Fin", "30 juin 2026"], ["Budget", "8 160 € TTC"], ["Jalons", "4 étapes"]].map(([label, value]) => <div key={label} className="bg-white p-3"><p className="text-[8px] uppercase text-freelio-muted">{label}</p><p className="mt-1.5 text-[10px] font-semibold text-freelio-ink">{value}</p></div>)}</div>
      </div>
      <div className="bg-white p-5 sm:p-6">
        <div className="flex items-start justify-between border-b border-freelio-line pb-4"><div><p className="font-mono text-[9px] text-freelio-muted">CTR-2026-041</p><p className="mt-1 text-sm font-semibold text-freelio-ink">Contrat de prestation</p></div><span className="rounded-md bg-freelio-success-soft px-2 py-1 text-[9px] font-semibold text-freelio-success">SIGNÉ</span></div>
        <div className="mt-5 rounded-md border border-dashed border-freelio-line-strong p-4"><p className="text-[9px] text-freelio-muted">Signatures électroniques</p><div className="mt-5 flex items-end justify-between"><span className="marketing-display -rotate-6 text-2xl italic text-freelio-ink">J. Martin</span><span className="marketing-display rotate-3 text-2xl italic text-freelio-ink">C. Rivet</span></div><div className="mt-4 flex justify-between text-[8px] text-freelio-success"><span>Signé le 7 mai</span><span>Signé le 7 mai</span></div></div>
      </div>
    </div>
  )
}

function DeliveryScreen() {
  return (
    <div className="p-5 sm:p-6">
      <div className="grid gap-5 sm:grid-cols-[190px_1fr]">
        <div className="rounded-md bg-freelio-accent p-5 text-white"><p className="text-[9px] uppercase text-white/65">Temps validé</p><p className="mt-3 font-mono text-4xl font-semibold tabular-nums">18h45</p><p className="mt-2 text-[10px] text-white/70">dont 6h20 non facturées</p><div className="mt-8 border-t border-white/20 pt-4"><p className="text-[9px] text-white/65">Valeur facturable</p><p className="mt-1 font-mono text-lg font-semibold">2 340 €</p></div></div>
        <div><div className="flex items-center justify-between"><p className="text-xs font-semibold text-freelio-ink">Avancement de la mission</p><span className="font-mono text-[9px] text-freelio-muted">SEMAINE 24</span></div><div className="mt-5 space-y-5">{[["Audit & cadrage", "100%"], ["Maquettes du cockpit", "82%"], ["Intégration front", "57%"], ["Recette client", "24%"]].map(([label, value]) => <div key={label}><div className="flex items-center justify-between text-[10px]"><span className="font-medium text-freelio-ink">{label}</span><span className="font-mono text-freelio-muted">{value}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-freelio-line"><div className="h-full rounded-full bg-freelio-accent" style={{ width: value }} /></div></div>)}</div></div>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-freelio-line pt-4"><p className="flex items-center gap-2 text-[10px] font-medium text-freelio-success"><CheckCircle2 className="size-3.5" />Le temps validé peut alimenter la facture</p><ChevronRight className="size-4 text-freelio-muted" /></div>
    </div>
  )
}

function PaymentScreen() {
  return (
    <div className="grid gap-px bg-freelio-line sm:grid-cols-[1fr_0.9fr]">
      <div className="bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[9px] text-freelio-muted">FAC-2026-041</p><p className="marketing-display mt-2 text-xl font-bold text-freelio-ink">Facture Factur-X</p></div><span className="rounded-md bg-freelio-accent-soft px-2 py-1 text-[9px] font-semibold text-freelio-accent">ÉMISE</span></div><p className="mt-7 text-[9px] uppercase text-freelio-muted">Montant TTC</p><p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-freelio-ink">8 160,00 €</p><div className="mt-7 grid grid-cols-2 gap-4 border-t border-freelio-line pt-4 text-[10px]"><div><p className="text-freelio-muted">Émise le</p><p className="mt-1 font-semibold text-freelio-ink">2 juin 2026</p></div><div><p className="text-freelio-muted">Échéance</p><p className="mt-1 font-semibold text-freelio-ink">2 juillet 2026</p></div></div></div>
      <div className="bg-freelio-surface-2 p-5 sm:p-6"><div className="flex items-center gap-2 text-freelio-success"><span className="grid size-8 place-items-center rounded-full bg-freelio-success text-white"><Check className="size-4" /></span><div><p className="text-xs font-semibold">Paiement reçu</p><p className="mt-0.5 text-[9px]">Virement rapproché</p></div></div><div className="mt-6 space-y-0 border-l border-freelio-line pl-5">{[["Facture envoyée", "2 juin", true], ["Rappel courtois", "28 juin", true], ["Paiement reçu", "30 juin", true]].map(([label, date, done]) => <div key={label as string} className="relative pb-5 last:pb-0"><span className={cn("absolute -left-[25px] top-0.5 size-2 rounded-full ring-4 ring-freelio-surface-2", done ? "bg-freelio-success" : "bg-freelio-line-strong")} /><div className="flex items-center justify-between gap-4"><p className="text-[10px] font-medium text-freelio-ink">{label as string}</p><p className="font-mono text-[9px] text-freelio-muted">{date as string}</p></div></div>)}</div><span className="mt-7 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-freelio-line bg-white text-[10px] font-semibold text-freelio-ink"><CalendarDays className="size-3" />Voir le reçu</span></div>
    </div>
  )
}
