# Dashboard Design System

Built against the UI/UX Pro Max priority list. This is the reference for the barber
dashboard and the template for the dental / physio / beauty clones — copy `index.css`
and the shared components rather than restyling from scratch each time.

> The skill's `search.py` and CSV databases weren't present in this install (`data` and
> `scripts` shipped as 0-byte files), so the palette isn't machine-generated. Every
> contrast pair below was computed and verified in the browser instead.

---

## Tokens

Everything is a CSS custom property on `:root`, overridden under `[data-theme="light"]`.
**No raw hex in components** — that's what made dark mode drift before.

### Colour — verified contrast

Measured live, both themes, against `--surface`:

| Token | Dark | Light | Use |
|---|---|---|---|
| `--text` | 16.7:1 | 18.5:1 | body |
| `--text-muted` | **7.5:1** | **8.4:1** | secondary — *was 4.0:1, failing* |
| `--text-dim` | **5.1:1** | **5.3:1** | tertiary — *was 2.3:1, badly failing* |
| `--gold` | 8.2:1 | 5.4:1 | brand, emphasis |
| `--on-accent` on gold | 8.3:1 | 5.4:1 | text on gold buttons |
| `--red` / `--green` / `--blue` / `--amber` | 6.7 / 10.6 / — / — | 6.5 / 5.0 / 6.7 / 4.9 | semantic |

Nothing sits below 4.5:1 in either theme. Semantic colours always ship with an icon or
text label — never colour alone.

### Type

`12 / 13 / 14 / 15 / 16 / 18 / 22 / 28 / 34`

Base 15px, line-height 1.55. **Nothing below 12px** — the one deliberate exception is the
mobile tab-bar label at 10px, which matches the iOS/Android convention for tab bars.

**Inputs are 16px.** Below that, iOS Safari zooms the page on focus.

Numeric columns, stats and times use `font-variant-numeric: tabular-nums` so figures
don't jitter as they update.

### Spacing, radius, elevation, motion

- Spacing: 4pt rhythm, `--sp-1` … `--sp-12`
- Radius: `--r-sm 6` / `--r-md 10` / `--r-lg 14` / `--r-pill`
- Elevation: `--el-1` … `--el-4`, one consistent scale
- Motion: `--dur-fast 120ms` / `--dur 180ms` / `--dur-slow 260ms`, `--ease-out` for enter
- Z-index: named scale (`--z-sticky 20`, `--z-nav 40`, `--z-modal 100`, `--z-toast 200`)

---

## Non-negotiables

**Focus.** Every interactive element gets a 2px `--focus` ring via `:focus-visible`.
`outline: none` only ever appears alongside a replacement. This was the single worst
failure in the original: inputs killed the outline and swapped in a border-colour change
that a keyboard user could easily miss.

**Touch targets.** 36px on fine pointers, **44px under `@media (pointer: coarse)`**.
Detected, not assumed — a flat 44px everywhere would waste space on a desktop admin panel,
and the skill's 44px rule is written for App UI.

**Reduced motion.** `prefers-reduced-motion: reduce` collapses all durations to ~0 and
stops the skeleton shimmer. State changes stay instant rather than disappearing.

**Transitions name their properties.** Never `transition: all` — it animates layout
properties and causes reflow. Only colour, opacity, transform.

**Live regions exist before they're needed.** The toast container renders permanently with
`role="status" aria-live="polite"`. Mounting it on first message means screen readers can
miss the announcement.

---

## Components

| Component | Notes |
|---|---|
| `Modal` | Focus trap, Escape, focus restored to trigger, scroll lock without layout jump, `role="dialog"` + `aria-modal` + `aria-labelledby`, optional unsaved-changes confirm |
| `Toast` | Permanent live region, manual dismiss, monotonic ids (`Date.now()` collided within a millisecond), SVG icons not `✓`/`×` glyphs |
| `Sidebar` | Real `<button>`s with `aria-current="page"`, grouped; mobile shows **4 primary + More** sheet (skill caps bottom nav at 5) |
| Chart | Bars are `<button>`s so values are keyboard-reachable rather than hover-only; screen-reader summary states the *takeaway*; `<details>` table alternative; subtle gridlines |
| Skeletons | `.skeleton` shimmer in the real layout shape, so nothing shifts when data lands |

---

## Role model

`barber` → `admin` → `operator`, each a superset.

`operator` is **SkyWeb**, not the shop. It gates System Health and the plan editor. A shop
admin cannot self-promote — RLS policy `barbers_no_self_promote` blocks it.

This exists because the dashboard is shipped *to* a barber but parts of it are *for* us.
A barber has no use for connection status or webhook health, and shouldn't be able to edit
the allowance they're billed against.

---

## Round 3 — light-mode-first, motion, compaction (2026-07-28)

**Default theme is now light**, not dark. `useState(() => localStorage.getItem('theme') || 'light')`.

**Two-gold system.** Light mode looked dull because one muted `--gold` (`#8a6229`,
5.4:1) was reused everywhere, including on things that only need 3:1. Split it:

| Token | Value | Contrast | Used for |
|---|---|---|---|
| `--gold` | `#8a6229` | 5.4:1 on white | small text, icons — needs the 4.5:1 AA floor |
| `--gold-vivid` | `#a8650f` | **4.63:1 on white** | stat values, meter fills, chart bars, gradient accents — large/bold elements only need 3:1, so this can be the richer value contrast was forcing out of everything else |

Verified live, not assumed — same contrast script used throughout this build.

**Ambient depth.** `.main` now carries the same soft radial wash the login screen always
had (`--gold-dim`, top-left, fading out by 380px). One line, applies to every page,
present in both themes since `--gold-dim` is themed.

**Entrance motion** — stat cards and cards fade + rise 6px on mount, staggered 40ms/item
(skill: `stagger-sequence`, capped at 4 items so a long row doesn't keep animating
visibly). `.stat-card:hover` lifts 1px. Chart bars get a 1.5% vertical hover scale.
All of it collapses under the existing `prefers-reduced-motion` block — reused, not
duplicated.

**Chart compacted**: 132px → 96px, axis and gap tightened. Nothing removed — the
keyboard-reachable bars, screen-reader summary and `<details>` table fallback are
unchanged, just smaller.

## Round 4 — "Ink & Ember", tabs, and the home page (2026-07-28)

Rework of the accent and interactive-surface system: one muted gold stretched across
every element (labels, borders, buttons, active states) is what read as flat, not the
light theme itself.

**Two-role accent, not one:**

| Token | Role | Value | Verified |
|---|---|---|---|
| `--ink` | primary button fill, filled tab/pill active state | `#15130f` light / aliased to `--gold` in dark | 17.9:1 |
| `--gold` | small text, icons — needs 4.5:1 | `#a8560c` | 5.25:1 |
| `--gold-vivid` | large numerals, fills, active-nav chip — only needs 3:1 | `#b8590a` | 4.7:1, richer than `--gold` on purpose |

Primary buttons are solid ink, not a tint — this is the actual "standout" change; a
confident near-black button reads as designed, a pastel-brown fill reads as a template
default.

**Navigation rebuilt.** Sidebar active state was a 3px left rule + tinted background —
replaced with a pill (rounded, no shifted border) plus a solid icon chip
(`--gold-vivid` fill, `--on-accent` text — themed, not hardcoded, so it stays correct in
dark mode where the fill is a *light* gold and needs dark text). Sub-nav tabs moved from
an underline to filled pills (`--ink` background on the active tab).

**Home page restructured** from four identical stat boxes stacked over an unrelated list
into an asymmetric layout: one large "spotlight" card carrying today's count, revenue and
the schedule together, beside a compact three-item stat column. Status on each schedule
row is now colour **and** a text badge (Moved / Cancelled) — colour alone was a
`color-not-only` violation.

**Bugs caught while building this, not before shipping:**
- `.dropdown-menu`/`nav-item::before` reuse in the mobile tab bar would have broken the
  active-tab indicator when the desktop pill styling replaced the shared pseudo-element —
  caught by rereading the mobile media query before assuming the change was isolated.
- Two hardcoded `#fff` text colours on new gold-filled chips would have been unreadable in
  dark mode, where the same token is a *light* gold needing dark text — caught by checking
  `--on-accent`'s per-theme definition before shipping, not after.
- `badge-gold`'s border was a hardcoded rgba matching the *old* dark-mode gold, silently
  wrong in light mode — replaced with a themed `--gold-br` token.
- **Overview's status badges were all hardcoded to `badge-blue`.** Real output (`get_page_text`,
  not a visual check) showed a cancelled appointment rendering a blue "Cancelled" badge.
  Fixed by deriving the badge class from the same status map as the rail colour, then
  re-verified the DOM showed `badge-red` with the semantic red computed colour.

## Round 5 — full retheme: shadcn zinc + barber signature (2026-07-28)

Complete replacement of the warm/gold system after user feedback, with
ui.shadcn.com as the named reference.

**Palette = shadcn's zinc scale, exactly:** zinc-50 page (`#fafafa`), white cards,
zinc-200 hairlines (`#e4e4e7`), zinc-900 solid-ink primary buttons (`#18181b`),
zinc-600/500 secondary text. Accent is `#2563eb` — which is literally shadcn's
blue-theme primary — verified 5.17:1 on white. Old token names (`--gold*`) kept,
values repointed, so every page migrated without touching component code.

**Light-only.** Dark theme deleted (tokens, toggle, `data-theme` attribute — with a
cleanup effect that strips stale localStorage from earlier builds).
**Zero decorative gradients** — verified 0 at runtime. The two functional
`repeating-linear-gradient`s stay: skeleton shimmer and chart gridlines (hard stops,
not fades).

**Barber signature, restrained:** a 6px barber-pole chip in the brand block
(hard-stop red/white/blue stripes — reads as stripes, not a gradient fade) and
Georgia serif on page titles — the "gentleman's barbershop" cue over the clean
zinc system. Stat numbers are dark text, not accent-coloured (Stripe convention:
accent is reserved for interactive elements).

**Motion:** `.page-transition` wrapper keyed on the page id — every tab switch
remounts it and re-runs a 240ms fade-rise. Verified live: element remounts,
`pageIn 0.24s` runs, and it exposed a copy bug (nav "Customers" → page "Clients"),
now aligned across Clients/Calendar/Services headings.

## Round 6 — "do for all": every page onto the zinc system (2026-07-28)

Full-page sweep for anything the token repoint couldn't reach (inline hexes):

- **Dark-on-blue bug, 5 instances:** chips built as `background: var(--gold)` +
  `color: '#111'` were fine on gold but became ~1.6:1 dark-on-blue after the repoint —
  Diary's view switcher, day selector (incl. its count dot), month today-pill, and the
  Barbers avatar. All moved to `var(--ink)` + `var(--on-accent)`.
- Diary status colours (old gold/blue/red hexes) → semantic tokens; rescheduled moved
  to amber since blue is now the accent.
- All 7 `#f59e0b` ambers → `var(--amber)`.
- **Print/PDF templates rebranded** (Barbers/Diary/Customers/Calls): old navy+gold header
  → zinc ink + serif h1. Print popups are separate documents, so these use *literal* hexes
  deliberately — `var()` does not resolve there. One over-eager tokenisation of the
  Barbers print status colour was caught by checking whether the line fed the popup, and
  reverted to literals.

### ⚠️ Incident: PowerShell corrupted 4 source files (repaired)

Using `Get-Content -Raw` + `WriteAllText` for batch replacements read the UTF-8 pages as
ANSI and double-encoded every non-ASCII char (`—` → `â€”`, 13–21 instances per file).
Repaired by reversing the transformation exactly (text → cp1252 bytes → decode UTF-8),
verified back to 0 mojibake with real em-dashes intact.

**Standing rule: never batch-edit UTF-8 source files through PowerShell string I/O —
use the Edit tool.** PowerShell remains fine for read-only greps and builds.

## Testing notes

Three checks gave **false negatives** because they read the DOM synchronously:

1. `.focus()` doesn't trigger `:focus-visible` — test with a real Tab keypress
2. React state hasn't rendered immediately after `.click()` — await a frame
3. `UNION ALL` branches evaluate in any order — don't mix a mutation and its assertion

If a UI assertion fails, confirm the *test* is sound before changing the code.
