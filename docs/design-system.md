# VetoLayer design system

Issue #51 establishes the shared visual and interaction contract used by VetoLayer product surfaces.

## Design principles

1. **Control-plane clarity over decoration.** Interfaces should feel operational, calm, and precise. Status, scope, evidence, and next action should be easier to scan than ornamental visuals.
2. **One semantic language.** ALLOW/success, REVIEW/warning, BLOCK/danger, information, muted state, and accent state use the same tokens everywhere.
3. **Progressive density.** Summary first, detailed evidence and traces on demand. Dense data is acceptable when hierarchy remains clear.
4. **Accessible by default.** Visible focus, keyboard support, non-color status cues, readable contrast, reduced-motion support, and 42px default interactive targets.
5. **No fake polish.** Visual completeness must not introduce fake metrics, fake integrations, or placeholder state.

## Foundations

The source of truth is `apps/web/app/design-system.css`.

### Color

Use semantic tokens instead of hard-coded page colors:

- `--vl-bg-canvas`, `--vl-bg-subtle`
- `--vl-surface-1` through `--vl-surface-raised`
- `--vl-border-subtle`, `--vl-border-default`, `--vl-border-strong`
- `--vl-text-primary`, `--vl-text-secondary`, `--vl-text-tertiary`
- `--vl-accent`
- `--vl-success`, `--vl-warning`, `--vl-danger`, `--vl-info`

Legacy aliases (`--panel`, `--line`, `--allow`, etc.) remain temporarily so Issue #52 can migrate feature layouts without visual regressions.

### Type

- Sans: Inter/system stack
- Mono: SFMono/Consolas/Liberation Mono/Menlo
- Labels and metadata remain compact; large display typography is reserved for marketing and primary product page titles.
- Avoid uppercase body copy. Uppercase is for compact labels/status only.

### Spacing

Use the shared 4px-based scale: `--vl-space-1` through `--vl-space-20`.

### Radius/elevation

- Small controls: `--vl-radius-sm`
- Inputs/buttons: `--vl-radius-md`
- Cards: `--vl-radius-lg`
- Hero/dialog surfaces: `--vl-radius-xl`
- Pills/status: `--vl-radius-pill`
- Raised surfaces use `--vl-shadow-raised`; do not invent page-specific drop shadows.

## Shared React primitives

`apps/web/components/ui/primitives.tsx` provides:

- `Button` / `ButtonLink`
- `Card`, `CardHeader`, `CardBody`, `CardFooter`
- `Badge` / `OutcomeBadge`
- `Field`, `Input`, `Select`, `Textarea`
- `Notice`
- `EmptyState`
- `Skeleton`
- `Tooltip`
- `Tabs` / `Tab`
- `TableShell` / `Table`

Feature components should use these for standard controls and reserve feature CSS for composition unique to that workflow.

## Button rules

- Primary: one dominant action per local region.
- Secondary: normal actions.
- Ghost: navigation/low-priority utility.
- Danger: destructive/negative action only.
- Disabled controls must explain why through nearby copy when the reason is not obvious.
- Loading labels must describe the work (`Saving…`, `Testing…`, `Re-evaluating…`).

## Field rules

- Every field has a visible label.
- Hints explain format or consequence, not repeat the label.
- Validation appears next to the field where possible.
- Browser-visible secrets are never repopulated after initial capture.

## Status rules

Outcome cues include text plus a non-color symbol:

- `✓ ALLOW`
- `! REVIEW`
- `× BLOCK`

Use `Badge` tones for non-decision states such as connected, pending, draft, warning, or informational metadata.

## Icons

Shared line icons live in `apps/web/components/ui/icons.tsx`.

Rules:

- 16px is the default inline/navigation size.
- 1.8px stroke, rounded cap/join.
- Icons supplement labels; they do not replace essential text unless an accessible label is present.
- Do not mix emoji, filled third-party icon packs, and line icons in the same control language.
- Brand marks are not product UI icons.

## Dialogs, drawers, tooltips, toasts

Issue #51 defines the visual foundations (`vlOverlay`, `vlDialog`, `vlDrawer`, `vlTooltip`, `vlToastRegion`, `vlToast`). Feature issues should build behavior on these primitives rather than inventing new appearance rules.

Dialog/drawer behavior must include focus management, escape handling, accessible names, and focus return before shipping an interactive implementation.

## Responsive rules

- Data tables may scroll horizontally rather than crushing columns.
- Multi-column cards collapse to one column under 820px unless the workflow defines a better breakpoint.
- Primary actions remain reachable without horizontal scrolling.
- Responsive design should simplify density, not hide critical status/evidence.

## Motion

Motion is restrained and communicates hierarchy/state. Shared transitions use `--vl-motion-fast`, `--vl-motion-base`, and `--vl-ease`. `prefers-reduced-motion` disables decorative transitions and skeleton animation.

## Migration rule

Issue #51 introduces the shared system and migrates standard product controls. Issue #52 owns the larger public-site and product-shell composition redesign. New product work after #51 should not introduce new page-local button/input/badge/card styles when a system primitive already exists.
