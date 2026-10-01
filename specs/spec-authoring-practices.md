# Spec Authoring Practices

Conventions for this repo's `specs/` folder.

## When to write a spec

- **Feature spec** (`specs/features/SAN-<issue>-<slug>.spec.md`, from [feature.spec.template.md](feature.spec.template.md)): before building a Phase 1+ feature whose behaviour isn't fully pinned down by the BRD alone — e.g. it touches multiple FR groups, has a non-obvious edge case, or the BRD leaves a design choice open.
- **Module spec** (from [module.spec.template.md](module.spec.template.md)): before building a module whose internal contract other modules depend on (e.g. the widget's public config shape) — see the `*-module-specs-index.md` files for candidates.
- **Bug-fix spec** (`specs/bug-fixes/SAN-<issue>-<slug>.md`): after a non-trivial bug is understood, to record root cause and fix approach before changing code. Not needed for typos or one-line fixes.

Don't write a spec for straightforward BRD-covered work — the Linear issue + BRD FR reference is enough. Specs are for the cases where more thinking needs to happen before code.

## Naming

Prefix with the Linear issue id (`SAN-1057-...`) so a spec and its issue are trivially linkable.

## Keeping specs and Linear in sync

The BRD is the source of truth for *what* to build. Linear is the source of truth for *status*. A spec, when written, is the source of truth for *how* — link it from the Linear issue once it exists, and don't let it silently go stale after implementation changes; either update it or delete it.
