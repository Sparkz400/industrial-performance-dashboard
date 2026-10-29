# Accessibility acceptance (WCAG 2.2 AA)

Scope: login, dashboards (including editing), the production shift workspace, operator
handover, machine commissioning, machines and alarm rules. Other screens follow the same
components but are not individually checked here.

Evidence: [`scripts/test-accessibility.mjs`](https://github.com/Sparkz400/performance_dashboard/blob/main/scripts/test-accessibility.mjs)
runs against an owned database in a real browser and fails on **any** axe finding for the
WCAG 2.0/2.1/2.2 A and AA rule sets. On 2026-10-29 all seven screens had zero findings
after fixing the side-navigation list structure, unnamed progress indicators and adding
a non-drag layout menu. Results are written to `.local/daily-evidence/accessibility.json`.

## Checklist

| Criterion | How it is checked | Status |
| --- | --- | --- |
| 1.1.1, 1.3.1, 4.1.2 Names, roles, structure | axe (all screens) | Automated, passing |
| 1.4.3 Contrast (minimum), 1.4.11 Non-text contrast | axe contrast rules after the page settles | Automated for text; non-text contrast partly manual |
| 1.4.10 Reflow | No horizontal scrolling at 320 CSS px on login and production | Scripted, passing |
| 1.4.4 Resize text (200 %) | Browser zoom walkthrough | Manual, open |
| 2.1.1 Keyboard | Login completed with Tab/typing/Enter only; widget move/resize by keyboard | Scripted, passing |
| 2.4.3 Focus order, 2.4.7 Focus visible | Skip link and focus checks (`e2e/industrial.spec.ts`, `test-supervisor-workflows.mjs`); theme sets a 3 px `:focus-visible` outline | Scripted, passing |
| 2.4.11 Focus not obscured | Sticky headers and drawers during keyboard walkthrough | Manual, open |
| 2.5.7 Dragging movements | Every widget has **Move or resize widget** (move left/right/up/down, wider/narrower/taller/shorter); widgets can be added by click | Scripted, passing |
| 2.5.8 Target size (minimum) | axe `target-size`; coarse pointers get 44 px targets (`test-supervisor-workflows.mjs`) | Automated, passing |
| 2.3.3 / reduced motion | With `prefers-reduced-motion: reduce`, transitions are ≤ 0.01 ms; Framer Motion follows the user setting (opacity fades remain) | Scripted, passing |
| 3.3.1, 3.3.3 Error identification and suggestion | Form errors are shown as text alerts (e.g. refused batch transitions, invalid limits) | Partly scripted |
| 3.3.8 Accessible authentication | Login accepts paste and password managers; no cognitive test | By design |
| 4.1.3 Status messages | Live state and alerts use `aria-live`/`role="status"`/`role="alert"`; the test requires a live region on the commissioning screen | Scripted presence; announcement wording manual |
| Screen reader | NVDA (Windows) and VoiceOver (macOS/iOS) walkthrough of login, shift classification, alarm acknowledgment and the handover form | Manual, open |

## What remains manual

A person using a screen reader must still walk through the operator tasks above and
record the announcements, and a 200 % text-zoom pass and a focus-obscured check are
needed on the target operator device. Automated rules find only part of real
accessibility problems; a passing scan is not a conformance claim.
