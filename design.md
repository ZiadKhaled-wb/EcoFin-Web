# EcoFin Pro — Frontend Design & Engineering Guide

Attach this file to every agent that builds a new module. Follow it exactly.
If something is missing, extend this file in the same PR instead of improvising.

## 1. Product context

EcoFin Pro is a multi-tenant ERP + POS for Egyptian small and mid-size businesses.
Users are owners, accountants, cashiers, collectors, and warehouse staff, often on
shared counter PCs, cheap tablets, or touch POS screens, in a hurry, sometimes in
poor lighting. Design for speed, legibility, and zero ambiguity with money and stock.

**Language:** Arabic first. **Direction:** RTL first. English is secondary.

## 2. Visual direction: clean slate + blue

Light, calm, familiar. One **centered white card** on a light slate page, a blue
primary action, and small line icons inside inputs. This is the approved look from
the original auth designs and applies to every auth page. Do not change it per page.

- Page: `bg-paper`. Card: white, `rounded-panel`, `border-line`, soft shadow, `max-w-[26rem]`
  (`wide` = `max-w-lg` for long forms).
- Wordmark: "Eco" in ink + "Fin" in `brand-600` + a blue "Pro" pill, always LTR (built into `AuthLayout`).
- Title centered, `text-2xl font-black`; subtitle centered, `text-sm text-ink-mute`.
- Inputs: `bg-field` (slate-100), `rounded-control`, leading icon at the physical left, LTR
  values in IBM Plex Mono; passwords have a show/hide eye toggle at the physical right.
- Errors: red border on the inputs + a pale red pill with an alert icon (`FormError`).
- Success: pale green box, centered check icon and message; secondary (outlined blue) button below.

Never use: gradients as decoration, split/brand-panel layouts, heavy shadows,
all-caps labels, emoji as icons, a different palette per module.

## 3. Tokens (source of truth: `src/index.css` `@theme`)

| Role | Token | Hex |
|---|---|---|
| Text | `ink` | #0f172a |
| Secondary text | `ink-soft` | #475569 |
| Muted text / help | `ink-mute` | #64748b |
| Page background | `paper` | #f8fafc |
| Surface (card) | `surface` | #ffffff |
| Input background | `field` | #f1f5f9 |
| Borders | `line` / `line-strong` | #e2e8f0 / #cbd5e1 |
| Brand (primary) | `brand-600`, `700` hover, `800` active, `50/100` tints | #2563eb ... |
| Disabled button | `disabled` | #94a3b8 |
| Attention / warning / POS highlight | `ochre-500`, `ochre-50` | #d97706 / #fffbeb |
| Error | `danger-600`, `danger-50` | #dc2626 / #fef2f2 |
| Success | `success-700` (text), `success-600`, `success-50` | #047857 / #059669 / #ecfdf5 |

Rules: use tokens, never raw hex or arbitrary Tailwind colors. Never convey meaning
by color alone (pair with text or an icon). Use `success-700` for success text (contrast).
`ink-mute` is the lightest allowed body text.

## 4. Typography

- **IBM Plex Sans Arabic** for all UI text (Arabic + Latin). Weights: 400, 500, 600, 700.
- **IBM Plex Mono** only for codes/keys/slugs (license keys, SKUs, tenant slug).
- Base size 16px. Scale: `text-sm` (help, meta), `text-base` (body, inputs),
  `text-xl`/`text-2xl` (page titles), `text-3xl` (rare, brand statements).
- Sentence case. Arabic body line-height >= 1.6 (Tailwind default is fine; do not tighten).
- Line length under 75 characters for prose.
- **Numbers:** Latin digits everywhere (0-9). Money, quantities, and codes use the
  `.num` class (tabular, LTR-isolated) so columns align and never flip in RTL.
  Money format: `1,250.00 ج.م` with currency after, wrapped in `.num`.

## 5. RTL rules (non-negotiable)

- Build RTL first. `<html lang="ar" dir="rtl">` is set in `index.html`.
- Use **logical** utilities: `ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `text-end`,
  `border-s`, `start-*`, `end-*`. Avoid `ml/mr/pl/pr/left/right` unless the element is
  forced LTR (comment why, as in the password toggle).
- Force `dir="ltr"` on: emails, usernames, URLs, license keys, slugs, passwords, SKUs, barcodes.
- Directional icons (arrows, chevrons) must be mirrored in RTL.
- Test every screen with real Arabic strings, never lorem ipsum or English placeholders.

## 6. Layout, spacing, density

- 4px base grid via Tailwind spacing. Forms: `space-y-5`. Sections: `mt-7`/`mt-8`.
- Radius: `rounded-control` (12px: inputs, buttons, notices), `rounded-panel` (24px: cards). Nothing else.
- **Touch targets >= 44px** (controls are `min-h-12`) on every interactive element. POS screens
  may go bigger (`min-h-14`), never smaller.
- Depth comes from borders (`border-line`), not shadows. Avoid cards-in-cards.
- Breakpoints: design mobile-first, verify at 360px, 768px, 1280px. POS layouts must
  work at 1024x768 landscape.
- Motion: only in response to a user action (loading spinner, open/close). No entrance
  animations. `prefers-reduced-motion` is already handled globally.

## 7. Component vocabulary (reuse; do not reinvent)

Component classes live in `src/index.css`: `field-label`, `field-input`,
`field-input-error`, `help-text`, `error-text`, `success-text`, `btn`, `btn-primary`,
`btn-secondary`, `btn-link`, `notice` (+ `-success|-error|-info`), `spinner`, `num`.
Icons: `components/ui/icons.tsx` (line icons, 20px, `currentColor`); add new ones there.

React components:

| Component | Path | Use |
|---|---|---|
| `AuthLayout` | `components/auth/` | Centered card shell for signed-out pages. Props: `title`, `subtitle`, `wide`; slots: `context`, `loading`, `terminalError` |
| `FormField` | `components/ui/` | Label + input + help + error. Props: `icon`, `invalid`, `ltr`. Password toggle built in |
| `FormError` | `components/ui/` | Form-level error, `role="alert"` |
| `Notice` | `components/ui/` | Non-terminal success/info message |
| `SubmitButton` | `components/ui/` | Primary/secondary, built-in loading state |
| `TenantSlugField` | `components/auth/` | Tenant context: read-only when known |

Before creating a new component, check this table. If you add one, add it here.
Signed-in pages need an app shell (sidebar/topbar); design it once, document it here.

## 8. States (every screen must design all of them)

1. **Idle** 2. **Loading** (`loading` slot or `SubmitButton loading`) 3. **Field error**
(inline under the input, `FormField error`) 4. **Form error** (`FormError`)
5. **Terminal error** (page can't continue; `terminalError` slot, always with a way out)
6. **Rate-limited** (submit disabled, message with live countdown; `useCountdown`)
7. **Empty** (says what to do next, with a primary action) 8. **Success** (brief, calm).

Lists and tables also need: loading skeleton or spinner, empty, error with retry.

## 9. Copy rules (Arabic)

- Say what happened and what to do. Errors never apologize and are never vague.
- Buttons name the action: "حفظ كلمة المرور", not "إرسال". The same action keeps the
  same verb through the whole flow (button, toast, confirmation).
- Plain words for users. "منشأة" not "tenant", "كود التفعيل" not "license key".
- Never use technical error codes in UI text.
- Ellipsis for progress: "جارٍ الحفظ...".

## 10. Security UX rules

- **Never reveal whether an account, email, or tenant exists.** Login 401s show one
  message: "بيانات الدخول غير صحيحة." Forgot-password shows one success message for
  every input. Do not add "user not found", and do not add resend buttons that reveal timing.
- Only exception: `ACCOUNT_DISABLED`, shown only after a correct password.
- Passwords: never trimmed, length-only validation (8-128), no composition rules,
  correct `autoComplete` (`current-password` / `new-password`).
- Client validation is a convenience. The server is the authority. Never enforce
  extra rules client-side that the server does not.
- `must_change_password` gate: mirrored by `RequirePasswordChanged`. Do not link `/change-password` from navigation.

## 11. Architecture & conventions

```
src/
  lib/          api.ts (axios), supabase.ts (reset page ONLY), validation.ts, cn.ts
  types/        shared TS types (auth.ts)
  store/        zustand stores (authStore)
  services/     one file per backend domain: authApi.ts, later salesApi.ts ...
  hooks/        reusable hooks
  components/   ui/ (primitives), auth/, guards/, layout/ (app shell, later)
  pages/        route-level screens for shell-level flows (auth, dashboard)
  modules/      NEW MODULES GO HERE: modules/<name>/{pages,components,api,types}
```

- **All HTTP goes through `src/lib/api.ts`.** No raw `fetch`/`axios` in components.
  The interceptor handles Bearer injection, one refresh attempt on `UNAUTHORIZED`,
  and `MUST_CHANGE_PASSWORD`. Components catch `ApiError` (`status`, `code`, `message`,
  `retryAfter`, `fields`).
- One `services/<domain>Api.ts` per backend domain. Components never build URLs.
- **Server state uses TanStack Query** (`useQuery`/`useMutation`). Do not copy server
  data into zustand. zustand is for client state only (session, UI prefs, POS cart).
- Routes: signed-out routes under `GuestOnly`, signed-in under `RequireAuth` then
  `RequirePasswordChanged`. Gate new routes by role/permission with a `RequirePermission`
  guard built on `user.permissions` (never hard-code role names in components).
- Roles come from `types/auth.ts`. The nine tenant roles plus `SUPER_ADMIN` (platform only).
- Env vars are `VITE_*` only, documented in `.env.example`. No secrets in the frontend.
- TypeScript strict. No `any` (one documented exception in `lib/api.ts`).
- Named `default` exports for pages/components, named exports for hooks/utils.
- File names: `PascalCase.tsx` components, `camelCase.ts` everything else.

## 12. POS-specific notes

- Optimize for keyboard and barcode scanner: autofocus the scan/search field, keep focus
  after each action, support Enter to confirm. Document shortcuts in the UI.
- Large tap targets (>= 56px) for quantity, payment method, and confirm actions.
- Totals are the loudest thing on screen. Use `.num`, `text-3xl`+, `font-bold`.
- Destructive or irreversible actions (void, refund, close shift) need explicit
  confirmation with the amount and item named in the dialog.
- Must survive a slow or dropped connection: show a persistent offline indicator and
  never silently discard a sale. (Offline queueing is a separate ADR.)

## 13. Accessibility floor

Visible keyboard focus (global `:focus-visible`), labels bound to inputs (`FormField`
does this), errors announced (`role="alert"`), `aria-invalid` and `aria-describedby`
on invalid fields, contrast >= 4.5:1, no color-only meaning, works at 200% zoom.

## 14. New-module checklist

- [ ] Uses tokens and component classes only; no new colors or ad-hoc styles
- [ ] RTL verified with real Arabic; logical utilities used
- [ ] All states designed (section 8)
- [ ] Data via `services/` + TanStack Query; errors handled via `ApiError`
- [ ] Route wrapped in the right guards and permission check
- [ ] Touch targets >= 44px; numbers in `.num`
- [ ] No enumeration leaks in any auth-adjacent copy
- [ ] New shared components added to section 7