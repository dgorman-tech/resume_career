# Product

## Register

product

## Users

A job seeker running a disciplined, self-directed search. They triage new postings in daylight, over morning coffee or between work tasks, with resumes, spreadsheets, and ATS tabs open beside this app (all of them light-themed). They are senior enough to value speed and signal over decoration, and they drive the board largely from the keyboard.

Secondary users: a small circle of invited friends running the same self-hosted app for their own searches, with varying technical comfort. The interface must read as professional and self-explanatory on first launch, with zero configuration.

The job to be done: scan what's new, decide interested / dismissed in seconds, track the application pipeline, and deep-dive fit only when a posting earns it.

## Product Purpose

Career HQ is a local-first job-search command center layered over a daily ATS watcher: a board of every matching posting, per-job status tracking, LLM fit scoring, and JD deep dives. It exists to turn a scattered, emotionally draining search into a calm daily routine. Success looks like: the daily triage takes minutes, nothing slips through, and the pipeline state is always trusted at a glance.

## Brand Personality

Calm, precise, trustworthy. A well-made instrument, not an experience. The design serves the data: the job rows are the interface, and the chrome recedes. Reference feel: Linear and Things — quiet tinted neutrals, crisp 1px borders, a single accent spent sparingly, hierarchy carried by typography rather than boxes and color.

## Anti-references

- **The current "AI slop" skin (being replaced, banned from returning):** dark navy-purple gradient backgrounds, violet→teal gradient text, glassmorphism cards, neon accents on dark. If it looks like a template demo, it has failed.
- **Growth-hacker dashboard:** KPI hero cards, big numbers with tiny labels, sparklines everywhere. A job search is not a funnel-metrics game.
- **Gamified job hunt:** streaks, badges, confetti, encouragement toasts. No cheerleading; the work is serious and the tone stays honest.
- **Enterprise ATS sterile:** Workday/Taleo blandness — gray-on-gray, dated form styling, bureaucratic density.
- **Cramped hacker terminal:** mono-everything, zero whitespace, green-on-black affectation. Mono type is a seasoning for data, never the whole dish.

## Design Principles

1. **The data is the interface.** The board's rows carry the visual weight; containers, headers, and navigation stay nearly invisible. When in doubt, remove the box.
2. **Triage speed over spectacle.** Every screen is optimized for scan → decide → move on. Keyboard-first stays first-class. Nothing animates unless it communicates a state change.
3. **Calm, not sterile.** Restraint with warmth: paper-tinted neutrals and one confident accent. Avoiding slop must never land in gray bureaucratic mush.
4. **Honest states, honest tone.** Empty, loading, error, and unscored states say plainly what is true. The interface informs; it never celebrates or nags.
5. **Guest-proof by default.** Friends self-host this. The out-of-the-box look must read professionally with no theming, no setup, and no owner-specific assumptions.

## Accessibility & Inclusion

WCAG 2.1 AA baseline: 4.5:1 minimum text contrast, visible `:focus-visible` rings on every interactive element, full keyboard coverage (the existing j/k navigation and shortcut layer is a feature, not an afterthought), and `prefers-reduced-motion` respected globally. Color never carries meaning alone — status and score always pair color with a label or numeral.
