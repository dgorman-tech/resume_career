---
name: Career HQ
description: A calm, daylight job-search command center. The data is the interface.
colors:
  morning-paper: "#f5f8f7"
  card-white: "#fbfdfc"
  sunken-well: "#edf2f1"
  hairline: "#dce4e2"
  briefing-ink: "#1a2523"
  ink-muted: "#566361"
  ink-faint: "#8b9895"
  harbor-teal: "#0f766e"
  harbor-teal-deep: "#0b5d57"
  teal-wash: "#e0efec"
  signal-amber: "#a16207"
  signal-red: "#b42c2c"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.harbor-teal}"
    textColor: "{colors.morning-paper}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.harbor-teal-deep}"
    textColor: "{colors.morning-paper}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  input:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.briefing-ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  chip:
    backgroundColor: "{colors.sunken-well}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    size: "36px"
  nav-tab-active:
    backgroundColor: "{colors.teal-wash}"
    textColor: "{colors.harbor-teal-deep}"
    rounded: "{rounded.full}"
    padding: "4px 16px"
  card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: Career HQ

## 1. Overview

**Creative North Star: "The Morning Briefing"**

Career HQ looks like the day's postings laid out on a well-set desk at 9am: daylight, order, coffee, decisiveness. It is a light-first system built on paper-tinted neutrals (every neutral carries a faint teal cast; nothing is pure white or pure black) with a single deep teal voice that speaks only when something is selected, actionable, or worth interest. Hierarchy is carried by typography and spacing, not by boxes; the job rows are the interface and the chrome recedes to hairlines and soft ambient light.

This system explicitly rejects its own predecessor: the dark navy-purple gradient background, violet→teal gradient text, glassmorphism cards, and neon accents are gone and banned from returning. It equally rejects the growth-hacker dashboard, the gamified job hunt, enterprise ATS sterility, and the cramped hacker terminal (see Do's and Don'ts). Serious work, calm surface, honest tone.

**Key Characteristics:**
- Light-first, paper-warm daylight surfaces with teal-tinted neutrals
- One accent (Harbor Teal), spent on ≤10% of any screen
- Soft ambient elevation: gentle diffuse shadows, never harsh, never colored
- Typography-led hierarchy; mono reserved for data and labels
- Refined, restrained controls that whisper until hovered or focused
- A strict four-point spacing scale (4, 8, 12, 16, 24, 40); off-scale values like 20px are prohibited

## 2. Colors

A restrained daylight palette: teal-tinted paper neutrals, one deep teal voice, and two quiet signal colors for score and state semantics.

### Primary
- **Harbor Teal** (#0f766e / oklch(0.52 0.10 190)): the one voice. Primary buttons, selected states, focus rings, links, the "interested" status, high scores (≥85). AA-compliant as text on paper.
- **Harbor Teal Deep** (#0b5d57): hover and active shifts of Harbor Teal. Never a resting color.
- **Teal Wash** (#e0efec): selection backgrounds, the active nav pill, row-selected highlight, "interested" pill fill. The loudest a background is allowed to get.

### Tertiary
- **Signal Amber** (#a16207): mid-band fit scores (70–84) and caution states only.
- **Signal Red** (#b42c2c): errors and destructive confirmation only. Never decoration.

### Neutral
- **Morning Paper** (#f5f8f7): the page background. Flat, no gradient, no attachment tricks.
- **Card White** (#fbfdfc): raised surfaces — table shell, panels, inputs, dialogs.
- **Sunken Well** (#edf2f1): input wells, hover washes, skeleton bones, chips at rest.
- **Hairline** (#dce4e2): 1px borders, dividers, table rules.
- **Briefing Ink** (#1a2523): primary text. Near-black with a teal cast; never #000.
- **Ink Muted** (#566361): secondary text, labels, inactive nav. AA on all surfaces.
- **Ink Faint** (#8b9895): decoration only, never a foreground. It reaches just 2.9:1 on paper, so it fails both the 4.5:1 text bar and the 3:1 icon bar. Legitimate uses: list markers, dashed placeholder borders, hairline-adjacent ornament. Placeholders, disabled labels, and inactive icons all use Ink Muted instead.

### Named Rules
**The One Voice Rule.** Harbor Teal appears on at most 10% of any screen. Its rarity is what makes selection and action legible. If two teal fills are touching, one of them is wrong.

**The No Pure Rule.** #ffffff and #000000 are forbidden. Every neutral is tinted toward the teal hue (chroma ≈ 0.005 in OKLCH). Screenshots should feel like paper in daylight, not a spec sheet.

**The Semantics-Only Signal Rule.** Amber and red exist for meaning (score bands, errors), never for variety. A screen with no warnings shows no amber.

**The No-Fading Rule.** De-emphasis is a color choice, never an opacity choice. Fading a row or label to 45% drops real content to 1.5:1 contrast; a dismissed row switches to Ink Muted at full opacity instead. Opacity is reserved for elements leaving the screen.

## 3. Typography

**Display/Body Font:** Inter (with system-ui fallback)
**Label/Data Font:** JetBrains Mono (with ui-monospace fallback)

**Character:** One quiet grotesque doing all the talking, weight and size doing the hierarchy; a mono voice for numerals and tracked-uppercase labels that gives the app its instrument feel. Space Grotesk is retired with the old skin.

### Hierarchy
- **Display** (600, 1.75rem, 1.15, -0.02em): page titles only (Profile, Settings). At most one per screen.
- **Headline** (600, 1.25rem, 1.3): drawer job titles, dialog titles.
- **Title** (600, 0.9375rem, 1.4): row job titles, section headings, emphasized cells.
- **Body** (400, 0.875rem, 1.55): default text. Max measure 70ch in prose contexts (JD summaries, deep dives).
- **Label** (JetBrains Mono 500, 0.6875rem, 0.08em tracking, UPPERCASE): stat labels, column headers, keyboard hints, status pills. The signature carried over from the old StatsBar — the one thing the old skin got right.

### Named Rules
**The Mono Data Rule.** Numerals in data contexts (salaries, scores, counts, dates in tables) are JetBrains Mono with tabular figures. Prose is never mono; mono is never prose.

**The Two-Weight Rule.** Inter 400 and 600 only (500 permitted in mono). If hierarchy needs more than two weights, fix the size scale instead.

## 4. Elevation

Soft ambient light. Surfaces lift off the paper with gentle diffuse shadows, as if lit by a window, never by a spotlight. Shadows are neutral ink at low opacity, never colored, never hard-edged. Depth has three steps and no more: resting cards, raised interactive elements, and overlays. Backdrop blur is forbidden; overlays dim with a plain scrim.

### Shadow Vocabulary
- **rest** (`box-shadow: 0 1px 2px rgba(26,37,35,0.05), 0 2px 8px rgba(26,37,35,0.04)`): the table shell, panels, cards at rest.
- **raised** (`box-shadow: 0 4px 16px rgba(26,37,35,0.08)`): dropdowns, popovers, hovered interactive cards.
- **overlay** (`box-shadow: 0 16px 48px rgba(26,37,35,0.16)`): the job drawer and dialogs, over a `rgba(26,37,35,0.32)` scrim.

### Named Rules
**The Window Light Rule.** If a shadow is noticeable from across the room, it is too dark. Shadows describe air between surfaces, not drama.

## 5. Components

Refined and restrained: controls whisper until needed. Color arrives on hover, focus, and selection; resting states are drawn in neutrals and hairlines.

### Buttons
- **Shape:** gently squared (6px radius); pill shapes are reserved for chips, status, and nav.
- **Primary:** Harbor Teal fill, Morning Paper text, 8px 16px padding. One per view, maximum.
- **Hover / Focus:** fill deepens to Harbor Teal Deep; `:focus-visible` shows a 2px Harbor Teal ring offset 2px. Transitions 150ms ease-out.
- **Ghost:** transparent fill, Ink Muted text; hover gains a Sunken Well wash. The default for secondary actions and icon buttons.

### Chips (filters)
- **Style:** Sunken Well fill, Ink Muted text, full-radius, 2px 10px padding, no border.
- **State:** selected chips switch to Teal Wash fill with Harbor Teal Deep text. No borders in either state.

### Status Pills
- **Style:** full-radius, Label typography, tinted fill + matching text: Unreviewed (status `new`) = Sunken Well + Ink Muted; Interested = Teal Wash + Harbor Teal Deep; Applied = Harbor Teal fill + Morning Paper text (the only filled pill); Dismissed = transparent + Ink Muted with a Hairline border, so it still reads as a pill without a fill.
- Status label reads "Unreviewed", not "New" — the Badges "NEW" freshness chip already owns that word in the same row.
- Color never carries the status alone; the label text is always present.

### Cards / Containers
- **Corner Style:** 10px radius.
- **Background:** Card White on Morning Paper.
- **Shadow Strategy:** `rest` shadow plus a 1px Hairline border; the border keeps edges crisp where the soft shadow fades.
- **Internal Padding:** 16px; 24px for page-level panels.

### Inputs / Fields
- **Style:** Card White fill, 1px Hairline border, 6px radius, 8px 12px padding.
- **Focus:** border shifts to Harbor Teal plus a soft 3px Teal Wash outer glow. No inner shadows.
- **Error:** border Signal Red with the message in 0.75rem Signal Red text below. Disabled: Sunken Well fill, Ink Faint text.

### Icon Buttons
- **Style:** transparent at rest, Ink Muted glyph, 6px radius. Hover fills with Sunken Well and darkens the glyph to Briefing Ink.
- **Size:** the glyph stays 16-20px but the control is always 36px square. A bare 20px icon is not a control; it is a target you miss.
- Every icon button carries an `aria-label`, and its glyph is `aria-hidden`.

### Badges
- **Tier** (T1/T2/T3): Sunken Well fill, Ink Muted text, mono 10px. The quiet default.
- **NEW**: Teal Wash fill, Harbor Teal Deep text. Earned attention, only for the first 7 days.
- **INT** (internal posting): solid Briefing Ink fill with Morning Paper text. An internal role is scored through a different lens, so it must never read as just another tier chip.

### Keyboard Keys
- `kbd` renders as a physical key everywhere it appears: Sunken Well fill, 1px Hairline border, 4px radius, mono 11px. Never style keyboard hints as plain inline text.

### Rendered Markdown
- LLM output (deep dives) renders inside `.md-body`. Tailwind's reset strips list markers, list indentation, paragraph margins, and heading weight, and no typography plugin is installed, so the container restores them explicitly: disc/decimal markers at 1.25rem indent, 0.75rem block rhythm, 14px semibold headings, teal underlined links, Sunken Well inline code.
- **The Never-Raw-Markdown Rule.** Markdown rendered without `.md-body` is a defect, not a style preference. Unstyled output reads as one undifferentiated wall of text, which is exactly how a serious analysis stops looking serious.

### Navigation (header tabs)
- **Style:** Label-adjacent Inter 600 at 0.875rem in a full-radius pill row. Inactive = Ink Muted text, transparent; hover = Briefing Ink; active = Teal Wash fill with Harbor Teal Deep text. The header itself is Morning Paper with a Hairline bottom border — no glass, no blur, no gradient logo text. The wordmark is Briefing Ink with a Harbor Teal glyph.

### Score Dial (signature component)
- The conic-gradient fit dial survives the redesign: track in Sunken Well, fill in the score's signal color (≥85 Harbor Teal, 70–84 Signal Amber, below Ink Muted so the numeral stays legible), numeral in JetBrains Mono. Unscored = dashed Hairline circle with an Ink Faint en dash. It is the one place a "gradient" exists, and it is data, not decoration.

## 6. Do's and Don'ts

### Do:
- **Do** keep Harbor Teal under 10% of any screen (The One Voice Rule).
- **Do** tint every neutral toward teal; #ffffff and #000000 are forbidden (The No Pure Rule).
- **Do** draw structure with 1px Hairline borders and the three-step shadow vocabulary; nothing else conveys depth.
- **Do** set data numerals in JetBrains Mono with tabular figures, and labels in tracked uppercase mono at 11px.
- **Do** show a visible `:focus-visible` ring on every interactive element and keep every action reachable from the keyboard (WCAG 2.1 AA, 4.5:1 text contrast).
- **Do** pair every color-coded state with a text label or numeral; color never carries meaning alone.
- **Do** keep spacing on the four-point scale (4, 8, 12, 16, 24, 40).
- **Do** give every icon-only control a 36px hit area and an `aria-label`.
- **Do** render every piece of Markdown through `.md-body`.
- **Do** de-emphasize with Ink Muted, never with opacity (The No-Fading Rule).

### Don't:
- **Don't** reintroduce the old skin: "dark navy-purple gradient backgrounds, violet→teal gradient text, glassmorphism cards, neon accents on dark" (PRODUCT.md). No `backdrop-filter`, no `background-clip: text`, no gradient backgrounds anywhere. The only gradient in the app is the Score Dial's conic data fill.
- **Don't** build the "growth-hacker dashboard": no KPI hero cards, no big-number-tiny-label stat tiles, no decorative sparklines. Stats stay one quiet mono line.
- **Don't** gamify: no streaks, badges, confetti, or encouragement toasts (the "gamified job hunt" anti-reference). Toasts state facts: "Scored", not "Nice work!".
- **Don't** drift into "enterprise ATS sterile" gray-on-gray: neutrals are tinted, spacing is generous, and type has real hierarchy.
- **Don't** go "cramped hacker terminal": mono is for labels and data only, never body text; whitespace is a feature.
- **Don't** use side-stripe borders (`border-left` > 1px as accent), identical icon-heading-text card grids, or reach for a modal when inline or a drawer works. The drawer is the default detail surface.
- **Don't** animate layout properties; motion is opacity/transform only, 150–250ms ease-out, and disappears entirely under `prefers-reduced-motion`.
- **Don't** use Ink Faint for any text or icon; it fails contrast at 2.9:1 and is decoration only.
- **Don't** mix icon families. Every glyph comes from lucide; text glyphs like ★, ✕, and ✓ standing in for icons are prohibited.
- **Don't** ship a control whose only label is a placeholder. Placeholders are hints, never names.
- **Anti-pattern test:** screenshot the board — if it could pass for a crypto dashboard template or an AI-startup landing page, it has failed The Morning Briefing.
