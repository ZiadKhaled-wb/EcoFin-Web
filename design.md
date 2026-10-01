# EcoFin Pro Design System: Constitution

The single source of truth for how EcoFin looks, behaves, and is built.
Attach this file to every agent. Tokens: `src/index.css`. Live reference:
`/design-system` (dev only, `npm run dev`). If a rule is missing, add it here in the same PR.

**Status:** Steps 1 (constitution), 2 (tokens), 4 (core components) and 5 (layout and navigation) done. Next: forms foundation (react-hook-form + zod), remaining overlays (Modal, Toast, Tooltip), `lib/format.ts`, then DataTable.

---

## 1. Philosophy

1. **Speed over ornament.** Users are cashiers, accountants, and owners in a hurry.
2. **Zero ambiguity with money and stock.** Numbers are aligned, labelled, and never truncated silently.
3. **One way to do each thing.** A developer never invents a button, sidebar, table, or state.
4. **Arabic and RTL first.** English is secondary. Nothing ships untested in Arabic.
5. **Calm.** Quiet surfaces, one accent color, attention reserved for what needs it.
6. **Security is a UX rule** (section 17).

## 2. Visual direction: B, Deep Teal (approved)

Light theme is primary. Cool paper page, white surfaces, deep teal primary, ochre for attention.
Auth pages: one centered white card (`AuthLayout`), wordmark "Eco**Fin**" + "Pro" pill.
Never: decorative gradients, split/brand-panel layouts, heavy shadows, emoji as icons,
a different palette per module.

## 3. Color architecture

Hex values exist **only** in `src/index.css` `@theme`. Everywhere else uses token classes.

| Role | Token | Hex |
|---|---|---|
| Text / secondary / muted | `ink` / `ink-soft` / `ink-mute` | #12201e / #3f524e / #5b6d69 |
| Page / card | `paper` / `surface` | #f3f6f5 / #ffffff |
| Input background | `field` | #e8f3f1 |
| Borders | `line` / `line-strong` | #d8e1de / #b4c3bf |
| Brand | `brand-600` primary, `700` hover, `800` active, `500` focus, `50/100` tints | #0b6b60 ... |
| Disabled | `disabled` | #9aaaa6 |
| Attention (warning, POS highlight) | `ochre-500` / `ochre-50` | #b7791f / #fbf3e2 |
| Error | `danger-600` / `danger-50` | #b42318 / #fdecea |
| Success | `success-700` text, `success-600`, `success-50` | #116a41 / #17794b / #e6f4ec |

Rules
- No raw hex, no `bg-[#...]`, no Tailwind default palette (`blue-500`, `slate-100`) in app code.
- Meaning is never color-only: pair with text or an icon.
- Text contrast >= 4.5:1. `ink-mute` is the lightest allowed body text.
- Brand teal = actions and focus. Ochre = "look here". Red = error/destructive. Green = success. Do not repurpose.

## 4. Typography

Fonts: **IBM Plex Sans Arabic** (all UI, Arabic + Latin), **IBM Plex Mono** (codes, keys, slugs, LTR field values).

| Role class | Use | Style |
|---|---|---|
| `type-display` | Big brand/marketing statements, POS grand total | 3xl bold |
| `type-page-title` | One per page (`h1`) | 2xl black |
| `type-section-title` | Section / panel headings (`h2`) | lg bold |
| `type-body` | Paragraphs, table cells | base |
| `type-label` | Field labels, table headers | sm medium |
| `type-caption` | Help text, metadata | sm, muted |

Base 16px. Sentence case. Arabic line-height never tighter than the roles above. Prose <= 75 characters.
**Numbers:** Latin digits (0-9). Money, quantities, and codes use `.num` (tabular, LTR-isolated).
Money: `1,250.00 ج.م` (currency after), inside `.num`.

## 5. Spacing and sizing

- 4px grid. Allowed Tailwind steps: 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16. Nothing arbitrary (`p-[13px]`).
- Form fields: `space-y-5`. Sections: `space-y-8` to `space-y-12`. Page padding: `px-5`, `sm:px-10`.
- Control heights: **md = 48px (default, `min-h-12`)**, lg = 56px (POS actions), sm = 36px (dense tables on desktop only).
- **Minimum touch target 44px** on any interactive element (icon buttons: `size-11`).
- Card max widths: auth `26rem`, wide auth `32rem`, content `max-w-5xl`+.

## 6. Radius and borders

`rounded-control` (12px): inputs, buttons, notices, chips. `rounded-panel` (24px): cards, panels, dialogs.
`rounded-full`: pills, avatars. Nothing else. Borders: 1px `line`; emphasis `line-strong`; error `danger-600`.

## 7. Elevation

Two levels only, and borders do most of the work.
`shadow-card` (resting card) and `shadow-overlay` (dropdowns, popovers, dialogs, drawers).
Z-index scale (CSS vars): sticky 20, dropdown 30, overlay 40, modal 50, popover 55 (portaled menus/tooltips, above modals), toast 60. Never write raw z-index numbers.

## 8. Iconography

Line icons, 24px grid, 1.75 stroke, `currentColor`, rendered at 20px (18px inline with text).
All icons come from **lucide-react**, imported ONLY in `components/ui/Icons.tsx`, which applies our defaults and exports named wrappers (`SearchIcon`...). Add icons there; never import lucide elsewhere. Direction-aware icons: `ChevronStartIcon` / `ChevronEndIcon` mirror in RTL. Decorative icons are `aria-hidden`; icon-only buttons need `aria-label`.
Directional icons (arrows, chevrons) mirror in RTL. No emoji, no icon fonts, no mixed icon sets.

## 9. Motion

Motion explains a change; it never decorates. Durations: `--duration-fast` 120ms (hover/press),
`--duration-base` 200ms (open/close), easing `ease-standard`. Allowed: color/opacity transitions,
overlay open/close, spinner. Not allowed: entrance animations, parallax, bouncing.
`prefers-reduced-motion` is handled globally. POS flows have no non-essential motion.

## 10. Interaction rules

| Need | Use | Not |
|---|---|---|
| Confirm a destructive action, one decision | Confirmation dialog (names the item and amount) | Browser `confirm()` |
| Short form (<= 5 fields), single step | Modal | Modal for anything scrollable |
| Edit/preview a record beside a list | Drawer (side sheet) | Navigating away and losing list state |
| Multi-step or complex operation | Dedicated page or Wizard | Modal, Drawer |
| Explain a control | Tooltip (hover/focus, never essential info) | Tooltip for errors |
| Row actions | Row action menu; primary action visible | Ten inline buttons per row |
| Result of an action | Toast (transient) or inline `Notice` (persistent) | Alert dialogs |

Every action has visible progress (loading state) and a visible result. Never fail silently.

## 11. States (mandatory matrix)

Every interactive component documents and renders: default, hover, focus-visible, active, disabled,
loading, error. Inputs add: filled, read-only, success. Tables and lists add: loading, empty (with
next action), error (with retry), populated, selected, filtered, sorted, paginated.
POS tiles add: available, selected, low stock, out of stock.
Screens: idle, loading, field error, form error, terminal error, rate-limited, empty, success.

## 12. Accessibility floor (WCAG 2.2 AA)

Visible `:focus-visible` (global). Labels bound to inputs (`FormField` does it). Errors announced
(`role="alert"`), `aria-invalid` + `aria-describedby`. Full keyboard operation, logical tab order,
no keyboard traps in overlays (focus returns to the trigger on close). Contrast >= 4.5:1.
Works at 200% zoom. Respect reduced motion. Dialogs: `role="dialog"`, labelled, Esc closes.

## 13. Responsive

| Name | Width | Tailwind |
|---|---|---|
| Mobile | < 768 | default |
| Tablet | 768 - 1023 | `md:` |
| Desktop | 1024 - 1535 | `lg:` |
| Large | >= 1536 | `2xl:` |

Build mobile first; verify at 360, 768, 1280. Mobile is a redesign, not a squeeze:
sidebar becomes a bottom bar or drawer; tables become card lists or scroll inside their own
container; dialogs become full-screen sheets; filters collapse into a drawer; primary actions stay
reachable with a thumb. **POS must work at 1024x768 landscape and on tablets.**

## 14. RTL / LTR

`<html lang="ar" dir="rtl">`. Use logical utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`,
`border-s`, `start-*`). Physical `left/right` only inside forced-LTR controls, with a comment why
(icon and toggle in `FormField`). Force `dir="ltr"` on emails, usernames, URLs, codes, slugs, passwords,
SKUs, barcodes. Mirror directional icons. Test with real Arabic strings, never lorem ipsum.

## 15. Naming conventions

- Components: `PascalCase.tsx`, default export. Hooks: `useThing.ts`, named export. Utilities: `camelCase.ts`.
- Tokens: role-based, not appearance-based (`ink-mute`, not `gray-500`). Brand steps are numeric (`brand-600`).
- Component classes in CSS: `kebab-case`, block-first (`field-input`, `field-input-error`, `notice-success`).
- Type roles: `type-*`. Status tones: `success | error | info | warning`. Sizes: `sm | md | lg`.
- Props: `variant`, `size`, `tone`, `loading`, `disabled`, `error`, `help`, `icon`. Reuse these names.
- Arabic copy lives next to the component until an i18n layer is introduced (ADR needed).

## 16. Component architecture

Three layers. A layer may import only from layers above it.

1. **Primitives** (`components/ui/`): Button, Input, Select, Checkbox, Badge, Notice, Spinner... Generic, no business knowledge, no API calls.
2. **Composites** (`components/layout/`, `components/data/`, `components/forms/`): AppShell, Sidebar, PageHeader, DataTable, FormSection. Built only from primitives.
3. **Business** (`modules/<name>/components/`): ProductCard, Cart, PaymentPanel, StockBadge. Built from primitives and composites; own the domain logic.

Current primitives (all registered on `/design-system`):

| Component | Notes |
|---|---|
| `Button` | `variant`: primary, secondary, ghost, danger. `size`: sm 36 / md 48 / lg 56. `loading`, `icon`, `fullWidth`. Defaults to `type="button"` |
| `SubmitButton` | Full-width `Button`, defaults to `type="submit"`. Use inside forms |
| `Input` | Bare input: `icon`, `invalid`, `ltr`; password toggle built in |
| `FormField` | `FieldShell` + `Input`: label, help, error. Use for every text-like field |
| `FieldShell` | Label + help + error wrapper. Build new field types on it |
| `IconButton` | Icon-only `Button`. `label` is required (aria-label + tooltip). 44px default |
| `Textarea` | Multi-line field with label/help/error |
| `RadioGroup` | 2-5 visible options in a `fieldset`. More options: `Select` |
| `NumberInput`, `MoneyInput` | String values (never floats). Accept Arabic-Indic digits. `decimals`, `suffix`. `MoneyInput` = 2 decimals, "ج.م", no negatives |
| `SearchInput` | Search box, Esc clears, icon on the start side. Barcode: `autoFocus` + Enter |
| `EmptyState`, `ErrorState` | Empty says what to do next and offers the action. Error offers retry |
| `Select` | Native select with `options`, `placeholder`, label/help/error |
| `Checkbox` | Whole row clickable (>= 44px), `description`, `error` |
| `Switch` | Immediate on/off setting. Inside forms use `Checkbox` |
| `Badge` | `tone`: neutral, brand, success, warning, danger; `dot` |
| `Spinner`, `Skeleton` | Standalone loading (spinner) and content placeholder (skeleton) |
| `Notice`, `FormError` | Persistent messages: `Notice` for page-level, `FormError` for form-level errors |
| `Icons` | The icon set (lucide-react wrapped with our defaults). Add new icons here only |
| `Card`, `Divider`, `PageContainer` | Bordered surface (`padded={false}` for tables, `elevated` for shadow); separator; standard page width and padding |
| `Breadcrumb` | Trail with direction-aware separators; last item is `aria-current` |
| `Wordmark` | EcoFin Pro logo lockup, always LTR |
| `Drawer` | Radix Dialog side sheet (`side="start"|"end"`). Mobile nav, record preview/edit beside a list |
| `DropdownMenu*` | Radix menu: `Trigger`, `Content`, `Item` (`icon`, `tone="danger"`), `Label`, `Separator`. Row actions, account menu |

Layout (`components/layout/`): `AppShell` (sidebar on lg+, drawer on mobile, topbar, skip link), `SidebarNav`, `Topbar` (account menu), `PageHeader`.
Also: `AuthLayout` (centered auth card), guards (`RequireAuth`, `RequirePasswordChanged`, `GuestOnly`).

Page recipe (every signed-in page):
```tsx
<PageContainer>            {/* skip for full-bleed screens like POS */}
  <PageHeader title="..." breadcrumbs={[...]} actions={...} />
  <Card>...</Card>
</PageContainer>
```
Navigation is data: add a module by editing `src/config/navigation.ts` (label, icon, route, `roles`/`permission`).
Hiding a link is UX only. Every route and API must still enforce access (`RequirePermission`, server checks).

Field rule: never render a raw `<input>`, `<select>` or `<button>` in a page. Use the components above.
Loading rule: buttons use `loading`; inline waits use `Spinner`; content areas use `Skeleton` shaped like the final content.

Roadmap (build only when a real screen needs it): Modal, ConfirmationDialog, Toast, Tooltip, Tabs, Popover, DatePicker, Combobox (searchable select), DataTable, Pagination, FilterBar, MetricCard, sidebar collapse.

Money rule: monetary and quantity values are strings from input to API. Never `parseFloat` money. Show with `.num`.

## 17. Security UX rules

Never reveal whether an account, email, or tenant exists: login 401s show one message ("بيانات الدخول غير صحيحة."),
forgot-password shows one success message for every input, no resend that reveals timing.
Only exception: `ACCOUNT_DISABLED`, shown after a correct password. Passwords: never trimmed, length-only
validation (8-128), correct `autoComplete`. Client validation is convenience; the server is the authority.
`/change-password` is a gate, not linked from navigation. Never show technical error codes to users.

## 18. Dark theme strategy (Midnight, future)

Utilities compile to `var(--color-*)`, so dark mode is a token override: `[data-theme="dark"] { --color-ink: ...; }`
in `index.css`. No component changes. Preconditions we enforce now: no hard-coded colors, no
`bg-white`/`text-black`, status colors defined as tint + text pairs, shadows from tokens.
Dark ships only after every component in section 16 has been checked against it.

## 19. ERP / POS principles

- Optimize for keyboard and barcode scanners: autofocus the scan/search field, keep focus after each action, Enter confirms; show shortcuts in the UI.
- Totals are the loudest thing on screen (`type-display`, `.num`). Money right-aligned in tables, tabular.
- Big targets (>= 56px) for quantity, payment method, and confirm on POS.
- Destructive/irreversible actions (void, refund, close shift) require explicit confirmation naming the amount and item.
- Never silently discard a sale; show a persistent offline indicator. (Offline queueing needs its own ADR.)
- One table system for every list (products, customers, orders, invoices...): same toolbar, filters, sorting, pagination, bulk actions, empty/error states.
- Permissions gate the UI (`user.permissions`), never role-name checks in components.

## 20. Governance

**Adding or changing a component**
1. Confirm no existing component or variant solves it.
2. Build it in `components/ui/` (or the right layer) using tokens only.
3. Implement the full state matrix (section 11), RTL, keyboard, and accessibility.
4. Add it to `/design-system` (`DesignSystemPage.tsx`) with every variant and state.
5. Update section 16 here, and note the change in the PR description.

**Definition of done for any UI work:** tokens only, RTL verified with real Arabic, all states,
keyboard reachable, >= 44px targets, numbers in `.num`, no enumeration leaks, registered in `/design-system`, `npm run check` passes.

**Changes to tokens or these rules** need review, because they affect every screen.

---

## Appendix A0. Stack decisions (confirmed)

| Concern | Decision | Rule |
|---|---|---|
| Overlays and menus | **Radix UI primitives**, styled with our tokens | Never hand-roll focus traps, portals, or menu keyboard handling. Wrap Radix in `components/ui/`; pages never import `@radix-ui/*` directly. App is wrapped in `DirectionProvider dir="rtl"` |
| Forms and validation | **react-hook-form + zod** (+ `@hookform/resolvers`) | zod schemas are the single source of validation rules, shared by form and API types. (Lands with the forms foundation step; the auth pages migrate then) |
| Icons | **lucide-react**, only via `components/ui/Icons.tsx` | One stroke width, one size grid |
| Server state | TanStack Query | See Appendix A |
| Client state | zustand | Session, UI prefs, POS cart only |

## Appendix A. Frontend architecture and conventions

```
src/
  lib/         api.ts (axios), supabase.ts (reset page ONLY), validation.ts, cn.ts
  types/       shared types
  store/       zustand (client state only: session, UI prefs, POS cart)
  services/    one <domain>Api.ts per backend domain
  hooks/       reusable hooks
  config/      navigation.ts (the menu: modules, routes, who sees what)
  components/  ui/ (primitives), auth/, guards/, layout/ (shell), data/ (later)
  pages/       shell-level screens (auth, dashboard, design-system)
  modules/     NEW MODULES: modules/<name>/{pages,components,api,types}
```

- All HTTP goes through `src/lib/api.ts`. Components catch `ApiError` (`status`, `code`, `message`, `retryAfter`, `fields`).
- Server state uses TanStack Query. Do not copy server data into zustand.
- Routes: signed-out under `GuestOnly`; signed-in under `RequireAuth` then `RequirePasswordChanged`. Module routes mount inside the latter.
- Roles from `types/auth.ts` (nine tenant roles + `SUPER_ADMIN`, platform only).
- Env vars are `VITE_*` only, documented in `.env.example`. No secrets in the frontend.
- TypeScript strict, no `any` (one documented exception in `lib/api.ts`).

## Appendix B. Copy rules (Arabic)

Say what happened and what to do. Buttons name the action ("حفظ كلمة المرور", not "إرسال") and keep the same verb through
button, toast, and confirmation. Plain words: "منشأة" not "tenant", "كود التفعيل" not "license key".
Progress uses an ellipsis: "جارٍ الحفظ...". Errors do not apologize and are never vague.