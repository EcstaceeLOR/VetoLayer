# VetoLayer brand system

## Core idea: the Gate-V

The VetoLayer mark is built from two converging rails and one horizontal decision layer.

- The **rails** represent an autonomous action moving toward execution.
- The **horizontal gate** represents VetoLayer's intervention boundary: policy, evidence, and contextual judgment must be satisfied before the action crosses it.
- The geometry intentionally avoids generic shield/checkmark/security imagery.

The canonical UI implementation lives in `apps/web/components/vetolayer-logo.tsx`. Product surfaces should use `VetoLayerLogo` or `VetoLayerMark` instead of recreating the mark.

## Variants

- **Default / dark UI:** light rails with the VetoLayer acid-lime decision layer.
- **Light:** same light-on-dark lockup behavior for dark surfaces and marketing artwork.
- **Dark:** dark rails with a deeper olive accent for light surfaces.
- **Monochrome:** both rails and gate use the same foreground color when color reproduction is unavailable.

Do not change the gate color independently per page. Status colors such as ALLOW, REVIEW, and BLOCK are product semantics and are not logo colors.

## Clear space

Keep at least **half the mark width** of clear space around the standalone mark or horizontal lockup. Do not crowd it against card borders, text, controls, or other logos.

## Minimum size

- Standalone mark: **20 px** minimum for UI use.
- Horizontal lockup: **96 px** minimum total width.
- Sidebar/navigation default: use the `sm` component size.
- Standard marketing/auth use: use the `md` component size.
- Large presentation use: use the `lg` component size or the SVG asset in `docs/brand/`.

## Usage rules

1. Never recreate the old boxed single-letter `V` placeholder.
2. Never stretch, skew, rotate, outline, or add effects to the mark.
3. Never place the lime gate alone as the logo.
4. Do not place the mark inside a shield, badge, or checkmark container.
5. Maintain strong contrast between rails and the background.
6. Use the supplied compact icon for favicon/app-icon contexts rather than shrinking the wordmark.

## Product surfaces

The same identity must appear across:

- public marketing navigation
- sign-in and onboarding
- authenticated sidebar/product shell
- example/example surfaces
- favicon and app icon
- Open Graph/social preview
- README/submission assets

Brand implementation should remain independent from later design-system work in Issue #51 so the identity survives future visual redesigns.
