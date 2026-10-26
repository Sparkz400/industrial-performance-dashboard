# Incident replay

Open **Production shift → Incident replay**. Choose a machine, up to eight signal
keys and an explicit-offset time window of at most 48 hours. Load the result,
move the keyboard-accessible cursor, select an event time or play the observations
at 60×. The full-window chart stays visible while the cards show the last recorded
observation at the cursor. Export JSON preserves the same bounded result.

## What the timeline means

Signals are selected and ordered by their stored history timestamp, then row ID.
That timestamp can originate from the server or collector; **source time and receive
time remain separate fields**, and unknown legacy timestamps stay unknown. Do not
assume device clocks are synchronized. A delayed measurement can have very different
source, observation and receive times.

The last sample is usable at the cursor only while it has good quality and is within
the chosen gap threshold. After a gap, cards show Unknown and label any retained raw
value as not current. Charts break at bad quality, long gaps and identity/mapping
changes. Boolean/string raw values remain available; numeric charts use the stored
numeric projection. Displayed values are not retrospectively scaled with today's
profile. Units and source identity come from each recorded sample.

The gap threshold is an investigation setting, not a change to production/OEE rules.
Line segments connect observations for exploration and do not verify continuous
measurement. Nothing in replay acknowledges alarms, changes quantities or writes
to a controller. Nearby events are leads for investigation, not causal proof.

## Events and annotations

- Alarm opening/recovery uses the recorded receipt time; source times are shown
  separately where retained. Human acknowledgment uses its recorded time and actor.
  An alarm already open at the start is included as outside-window context.
- Operator note/action/quantity revisions recorded in the window retain their
  original text, version and actor. The current entry cannot rewrite an older note.
- Stop classifications whose effective interval overlaps the window are included,
  even if entered later. They keep their actual recording time, effective interval
  and superseded-record reference. Outside-window events seek to the nearest window
  boundary and are visibly labeled. A correction does not erase its predecessor.
- This is not a complete audit stream of every machine configuration or transient
  alarm-condition change. Widget annotations have no machine identity and are not
  automatically attributed to a machine. Use operator notes for this workflow.

## Bounds and access

Each signal returns the earliest 2,000 rows in the window, with an explicit
truncation flag. Each event category reads at most 200 source records; one alarm
can yield opening, acknowledgment and recovery events. Event cards page in groups
of 50. Narrow the window when truncated; later rows are not silently represented
as complete. Raw text is shortened to 512 characters with a visible flag.

Queries use a consistent, read-only database snapshot and a three-second statement
timeout. Results are scoped by machine in every query. Normal authenticated readers
can use replay within the existing one-company installation policy. This does not
establish site/asset or tenant isolation; separate companies need separate installs.

## Automated evidence

`incidentReplay.test.ts` checks gaps, bad quality, zero/false/string values, duplicate
timestamps and mapping changes. `scripts/test-incident-replay.mjs`, called by the
production acceptance suite, checks the actual database/API and browser for separate
clocks, retained raw bad values, immutable note versions, later classifications,
same-key machine isolation, viewer reads, invalid windows, query limits, keyboard
cursor, playback, mobile layout and downloadable JSON. Owned fixtures do not qualify
physical machine clocks or prove a real incident's cause.
