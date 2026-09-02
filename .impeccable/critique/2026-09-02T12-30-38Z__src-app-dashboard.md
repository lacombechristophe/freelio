---
target: dashboard workspace surfaces
total_score: 31
p0_count: 0
p1_count: 3
timestamp: 2026-09-02T12-30-38Z
slug: src-app-dashboard
---
⚠️ DEGRADED: single-context (sub-agents are disabled by the execution policy; Assessment A and B were run sequentially in this context)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Cockpits, counters and empty states are clear; a few asynchronous actions still rely on toast feedback only. |
| 2 | Match System / Real World | 3/4 | CRM, sales, operations, service and revenue vocabulary is concrete; some labels remain generic across workspaces. |
| 3 | User Control and Freedom | 3/4 | Navigation, tabs and modal escape paths are sound; bulk actions and undo are not consistently visible. |
| 4 | Consistency and Standards | 4/4 | Shared header, metric, panel, spacing and focus treatments now create a coherent shell. |
| 5 | Error Prevention | 3/4 | Server validation and guarded workflows exist; several creation flows still expose many choices without progressive disclosure. |
| 6 | Recognition Rather Than Recall | 3/4 | Titles, descriptions, counts and status badges explain most screens; icon meaning is still occasionally context-dependent. |
| 7 | Flexibility and Efficiency | 3/4 | Global search, quick create and keyboard-safe controls help; power-user bulk selection and shortcuts are incomplete. |
| 8 | Aesthetic and Minimalist Design | 3/4 | Contrast and hierarchy are substantially improved; repeated four-KPI compositions still flatten priority. |
| 9 | Error Recovery | 3/4 | Empty/error states are humane and recoverable; some forms need field-level recovery without losing drafts. |
| 10 | Help and Documentation | 3/4 | Help entry points exist and copy is explanatory; contextual guidance is not yet systematic in every high-stakes flow. |
| **Total** |  | **31/40** | **Solide et cohérent, mais encore une passe produit nécessaire avant de dire “niveau HubSpot/Extrabat partout”.** |

## Anti-Patterns Verdict

**LLM assessment:** the interface no longer reads as a raw starter dashboard. The dark navigation, restrained blue accent, stronger type scale, explicit page framing and calm empty states feel intentional. The remaining “AI-generated” signal is structural sameness: most workspaces repeat four metrics followed by a two-column panel grid, so the interface can feel like the same template with different nouns.

**Deterministic scan:** `detect.mjs --json src/app src/components` returned `[]`. No bundled anti-pattern rule fired. The scan does not replace human review of information architecture, data density or product-specific states.

**Browser evidence:** the Playwright visual-direction suite rendered the seven main cockpits at 1600×1000 with the current QA dataset. All seven headings and shell controls were visible, and the forbidden “Chronomètre” text was absent. No live overlay was injected: the available browser path was not used for mutable script injection, so no user-visible overlay is claimed.

## Overall Impression

The product now has a credible professional shell and much better legibility. The strongest opportunity is not more decoration: it is to make each workspace answer a different operational question (“what needs a decision now?”, “what is at risk?”, “what can I automate?”) instead of presenting the same card grammar everywhere.

## What’s Working

- The shared `PageHeader`, card description scale, borders and spacing make CRM, sales, marketing, operations, service and revenue feel like one product.
- Empty states now explain what will happen next, rather than leaving a blank panel; this is especially helpful for new pool-company workspaces.
- The trend panels expose total activity and latest point, include readable axes, and keep the SVG semantic with an accessible label.

## Priority Issues

### [P1] Make each cockpit decision-led

**Why it matters:** identical KPI-plus-grid layouts force a pool manager to scan instead of act. **Fix:** give each entrance one dominant “next action” module (cash to secure in Revenue, SLA breach in Service, today’s route in Operations, follow-up queue in CRM), then demote secondary metrics. **Suggested command:** `$impeccable distill`.

### [P1] Finish the automation operating loop

**Why it matters:** Automatisations now looks coherent, but setup readiness still reads as a checklist rather than a guided path. **Fix:** make each non-ready readiness row an actionable link/button to the exact configuration step, add a compact “test send” state, and show consent/suppression reasons beside audience counts. **Suggested command:** `$impeccable clarify`.

### [P1] Replace chart-only communication with inspectable data

**Why it matters:** a line is useful for direction but insufficient for finance, attribution and service decisions. **Fix:** add a “Voir les données” disclosure with a compact table, date range selector and explicit comparison basis; keep the chart as the overview. **Suggested command:** `$impeccable audit`.

### [P2] Add a consistent bulk/power-user path

**Why it matters:** a manager migrating from HubSpot/Extrabat will expect multi-select, batch assignment, batch status changes and export. **Fix:** standardise table toolbars, selection counts, batch actions and keyboard focus across clients, deals, tickets, invoices and products. **Suggested command:** `$impeccable shape`.

### [P2] Make high-stakes forms resilient to interruption

**Why it matters:** quotes, invoices, contracts and interventions are long-lived records; losing a draft is costly. **Fix:** persist drafts locally/server-side, expose unsaved-change status, and use field-level errors that preserve valid values. **Suggested command:** `$impeccable harden`.

## Persona Red Flags

**Alex (Power User):** the main shell is fast to scan, but the seven cockpits do not yet expose a universal bulk-selection pattern or shortcut map. The automation journal has filters, yet bulk retry/export is absent.

**Sam (Accessibility):** headings, visible focus rings, labelled search and live result state are good. SVG charts still need a user-invoked table alternative, and several deep pages should be tested at 200% zoom for horizontal overflow.

**Jordan (First-Timer):** page descriptions and empty states reduce ambiguity. The next weak point is configuration: readiness items in Automatisations explain why something is blocked but do not always take Jordan directly to the fix.

## Minor Observations

- Keep the 12–16px radius discipline; avoid reintroducing large “marketing” shadows into record dialogs.
- Preserve tabular numerals for amounts/counts and keep dates in the user’s locale.
- Do not let sparse QA data dictate production density: verify populated, long-name and zero-state fixtures for every cockpit.
- Continue removing technical statuses from end-user surfaces when a French business label exists.

## Questions to Consider

- What is the one decision a pisciniste should make within five seconds of opening each workspace?
- Can every non-ready automation control take the user directly to its fix in one click?
- Which screens deserve a true table as the primary view instead of a card grid?
- What should a confident “nothing needs attention” moment feel like, and what useful next action should it offer?
