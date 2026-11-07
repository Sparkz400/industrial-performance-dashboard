# Manual accessibility observation template

Use this form to record one manual pass from the
[What remains manual](../ACCESSIBILITY.md#what-remains-manual) section of the
accessibility checklist: a screen-reader walkthrough, a 200 % text-zoom pass or a
focus-obscured check.

**Who can use it.** Anyone who can run the task with the assistive technology or
setting they actually use: a screen-reader user, someone using browser zoom or
keyboard-only navigation, or a tester on the intended operator device. Use a local
installation with the owned simulator ([getting started](../GETTING_STARTED.md)) or
the [interactive demo](../INTERACTIVE_DEMO.md), never a production installation.

**What to leave out.** No names, usernames, email addresses, passwords, session
cookies, tokens, endpoint addresses, plant or machine names from a real site, or
screenshots of real production data. Write "operator account" rather than the
account name. Crop or redact any screenshot before attaching it.

**How to submit.** Copy everything below the line into a new GitHub issue (or a
comment on the issue that asked for the check), fill it in and attach sanitized
evidence. Mark each row Pass, Fail or Not tested; leave a row Not tested rather
than guessing. Open one follow-up issue per failure and link it in the row.
Report security problems through the [private security process](../../SECURITY.md).

One submitted form is evidence for review. It does not close U06: its manual
acceptance stays open until maintainers accept the screen-reader, text-zoom and
focus-obscured evidence on the target operator device
([acceptance record](../ACCEPTANCE_EXECUTION.md)).

---

## Accessibility observation

### Environment

| Field | Value |
| --- | --- |
| Application revision (commit SHA or release) | |
| Installation type (local simulator / interactive demo / other synthetic) | |
| Operating system and version | |
| Browser and version | |
| Device and screen size (desktop, tablet, operator panel) | |
| Input used (keyboard, touch, switch, mouse) | |
| Assistive technology and version (or "none") | |
| Assistive-technology settings that matter (verbosity, browse/focus mode) | |
| Browser zoom or text size | |
| Interface language (English / Deutsch) | |
| Account role used (operator / supervisor / administrator / viewer) | |
| Date of test | |

### Tasks

Result: **Pass**, **Fail** or **Not tested**. For a screen reader, write the
announcement you heard; for zoom and focus checks, describe what you saw.

#### 1. Login

| Step | Expected announcement or focus | Actual | Result | Evidence link | Follow-up issue |
| --- | --- | --- | --- | --- | --- |
| Open the login page and move to the first field | | | | | |
| Fill username and password, submit with Enter | | | | | |
| Submit with a wrong password | Error is announced as text | | | | |

#### 2. Shift classification (Production shift)

| Step | Expected announcement or focus | Actual | Result | Evidence link | Follow-up issue |
| --- | --- | --- | --- | --- | --- |
| Select a shift and reach its report | | | | | |
| Select an idle/fault interval | | | | | |
| Choose a reason and save | | | | | |
| Status or error message after saving | | | | | |

#### 3. Alarm acknowledgment

| Step | Expected announcement or focus | Actual | Result | Evidence link | Follow-up issue |
| --- | --- | --- | --- | --- | --- |
| Notice a new active alarm | | | | | |
| Move to the alarm and acknowledge it | | | | | |
| Confirmation after acknowledgment | | | | | |

#### 4. Operator handover form

| Step | Expected announcement or focus | Actual | Result | Evidence link | Follow-up issue |
| --- | --- | --- | --- | --- | --- |
| Select a machine and reach the note field | | | | | |
| Fill the form fields and submit | | | | | |
| Validation error for a missing required field | | | | | |
| Confirmation after saving | | | | | |

#### 5. Text resized to 200 % (WCAG 1.4.4)

Repeat tasks 1–4 at 200 % browser zoom or text size.

| Screen or step | Expected | Actual (clipped, overlapping or hidden text/controls) | Result | Evidence link | Follow-up issue |
| --- | --- | --- | --- | --- | --- |
| Login | All text and controls readable and usable | | | | |
| Production shift and classification | | | | | |
| Alarm acknowledgment | | | | | |
| Operator handover | | | | | |

#### 6. Focus not obscured by headers or drawers (WCAG 2.4.11)

Move through each screen with Tab and Shift+Tab, with the side navigation and any
drawer both open and closed, at normal size and at 200 %.

| Screen or step | Expected | Actual (which element hid the focus) | Result | Evidence link | Follow-up issue |
| --- | --- | --- | --- | --- | --- |
| Login | Focused element at least partly visible | | | | |
| Production shift (sticky header) | | | | | |
| Alarm list | | | | | |
| Operator handover | | | | | |
| Navigation drawer open | | | | | |

#### 7. Other partly manual checklist items (optional)

| Item | What to check | Actual | Result | Evidence link | Follow-up issue |
| --- | --- | --- | --- | --- | --- |
| 1.4.11 Non-text contrast | Focus outlines, input borders and status colors distinguishable | | | | |
| 4.1.3 Status messages | Live-state and alert wording is understandable when announced | | | | |
| 3.3.1, 3.3.3 Errors | Errors name the field and suggest a fix | | | | |

### Summary

- Tasks not tested and why:
- Failures and their follow-up issues:
- Anything outside the listed tasks:
