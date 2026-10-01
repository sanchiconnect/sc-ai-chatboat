# UI/UX Principles

Cross-cutting design principles for both `sanchijawab-admin` and `sanchijawab-widget`. Full low-fidelity layouts for every MVP screen: BRD v1.1 §11 (Wireframes W-01 to W-11).

## Widget

- Every setting change (theme, texts, position) reflects in the dashboard's live preview instantly (FR-W3) — the widget and preview must share one config-rendering code path, not two.
- Consent notice appears before the first message when required (GDPR / India DPDP Act), never as an afterthought.
- Mobile: full-screen, keyboard-safe input, conversation persists across page navigation (FR-W7).
- A contrast checker warns when a customer's chosen colour fails WCAG against widget text (BRD W-05 note).

## Dashboard

- Onboarding is a single guided flow: name bot → add website → add files → playground → widget → install (BRD §10.1) — no dead ends before the bot is live.
- Playground's "Why this answer" panel (retrieved passages + scores) is not a debug afterthought — it's how admins learn to fix wrong answers (FR-R3).
- Inbox distinguishes bot / waiting-for-human / human / closed at a glance; "Take over" and "Hand back" are one click each (FR-H1).

## Accessibility

WCAG 2.2 AA on both dashboard and widget — keyboard navigation, focus states, screen-reader labels (BRD §7). Tracked in [SAN-1129](https://linear.app/sanchiconnect/issue/SAN-1129).
