# Accessibility and responsive UX contract

VetoLayer treats accessibility as part of the product shell rather than a separate theme or fork.

## Keyboard contract

- The first focusable control on every major surface is **Skip to main content**.
- Public marketing, sign-in, onboarding, demo, and authenticated dashboard surfaces expose the shared `#main-content` target.
- Product navigation uses native links and `aria-current="page"` for the active destination.
- Buttons, links, form controls, summaries, and explicit `tabindex` targets receive a high-contrast `:focus-visible` outline.
- No core flow requires hover or pointer-only interaction.

Manual keyboard smoke test:

1. Load `/`, press `Tab`, then `Enter`; focus should move to the main content region.
2. Tab through marketing navigation and primary calls to action.
3. On `/login`, reach email, password, sign-in, and create-account controls in logical order.
4. In `/dashboard`, tab through product navigation, top-bar actions, dashboard links, Policy Studio controls, Review Inbox actions, and integration tests.
5. Confirm focused controls are always visually identifiable.

## Status communication

ALLOW, REVIEW, and BLOCK are always rendered as text. Shared outcome badges additionally use visible symbols so color is never the sole distinction:

- `✓ ALLOW`
- `! REVIEW`
- `× BLOCK`

Dynamic product status already exposed by interactive surfaces should use `role="status"`, `role="alert"`, or `aria-live` where appropriate. Decorative status dots/icons are hidden from assistive technology when their adjacent text communicates the same information.

## Motion

`prefers-reduced-motion: reduce` disables non-essential transitions/animations and removes the glowing pulse treatment. No product state depends on animation.

## Responsive contract

At tablet and mobile widths:

- the fixed dashboard sidebar becomes an in-flow navigation header;
- product navigation is horizontally scrollable instead of clipping;
- two-column product/detail/review/policy layouts collapse to one column;
- decision tables remain horizontally scrollable when their structured columns cannot safely collapse;
- metric and metadata grids reduce to two columns and then one column;
- marketing, onboarding, review, and integration grids collapse without viewport overflow;
- long hashes, code, and technical values wrap or scroll rather than widening the page.

Target smoke-test widths: **1440px, 1024px, 768px, 390px**.

## Forced colors and contrast

Core status chips retain borders in forced-colors mode. Text labels remain present regardless of theme or color rendering.

## Guardrail

Accessibility changes must reuse the existing visual system. Do not create a separate accessible UI, duplicate decision logic, or remove operational detail merely to simplify layout.
