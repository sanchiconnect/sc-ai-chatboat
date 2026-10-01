# Widget Module Specs Index

Index of `sanchijawab-widget` (the embeddable chat widget). No detailed module specs exist yet — fill in as each piece is implemented, using [module.spec.template.md](module.spec.template.md).

| Piece | Covers | BRD wireframe | Linear |
|---|---|---|---|
| Theme & branding | FR-W1-W2 | W-05 | SAN-1098 |
| Live preview support (config contract with dashboard) | FR-W3 | W-05 | SAN-1099 |
| Consent gate | FR-W4 | W-05 | SAN-1100 |
| Position / visibility rules | FR-W5-W6 | W-05 | SAN-1101 |
| Mobile full-screen behaviour | FR-W7 | W-11 | SAN-1102 |
| Feedback + transcript | FR-W10 | W-10 | SAN-1103 |
| Shadow DOM isolation, bundle size | NFR (§7) | — | SAN-1104 |
| Chat streaming client (consumes `/public/w/{key}/chat`) | FR-C3-C4 | — | SAN-1092 |
| Lead form | FR-L1 | W-11 | SAN-1110 |

Write a module spec when the widget's public contract (config shape, JS API) needs to be agreed before coding — it's consumed by every customer's site, so changes here are hard to walk back.
