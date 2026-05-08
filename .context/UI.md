# UI Design System & Guidelines

This document outlines the design standards and component patterns for the OD Admin Operations Executive Suite. The system has been modernized into a **Compact Enterprise CRM Dashboard**, moving away from a spacious "ecommerce-style" marketing layout to a high-density, professional interface optimized for operations, inspired by platforms like LogiTrade CRM, HubSpot CRM, and Monday.com.

## 1. Core Principles

- **High Data Density:** Maximize the amount of information visible above the fold by strictly controlling vertical whitespace, padding, and margins.
- **Professional & Functional:** Prioritize scanning efficiency and rapid interaction for operators.
- **Flat & Clean:** Avoid heavy shadows, large border radii, and excessive styling. Rely on subtle borders and solid, deliberate contrast for visual hierarchy.

## 2. Layout & Global Spacing

- **Padding & Margins:** Use compact spacing utilities globally. Swap large padding classes (e.g., `py-6`, `px-6`) with tighter equivalents (e.g., `py-2`, `px-3`).
- **Gap:** Reduce spacing between sections (e.g., use `gap-4` or `gap-2` instead of `gap-6` or `gap-8` for structural layout elements).
- **Containers:** Use flat containers.
  - **Do:** `bg-surface-lowest border border-border-dark rounded`
  - **Don't:** `bg-surface-lowest border border-border-dark rounded-2xl shadow-2xl`

## 3. Headers & Navigation

Page headers should be slim, occupying only a single line when possible, and incorporate breadcrumbs alongside actionable metrics.

- **Breadcrumbs:** `text-[11px] text-text-muted` (e.g., `Home / Orders`).
- **Page Titles:** Typically hidden on very small screens, `text-sm font-bold text-on-surface` on larger screens.
- **Record Counts:** Inline with the header, using `text-[11px] text-text-muted`.
- **Spacing:** The header container should use `py-2 mb-2 border-b border-border-dark/60`.

## 4. Inputs & Filter Bars

The filter bar must be a compact, horizontal inline strip rather than a bulky vertical grid.

- **Inputs (Search/Text):** Height strictly limited to `h-[34px]`.
- **Styling:** `text-[11px]` font size, `border border-border-dark rounded`.
- **Search Icons:** Prefix icons should use `fontSize: '14px'` and be colored `text-text-muted`.

## 5. Buttons

Buttons must be compact to match the CRM aesthetic and prevent interface bloat.

- **Primary/Action Buttons (Headers):**
  - Height: `h-[30px]`
  - Padding: `px-3`
  - Font: `text-[11px] font-bold`
  - Icons inside buttons: `fontSize: '14px'`
  - Shape: `rounded`
- **Table Row Action Buttons (Icons):**
  - Sizing: `p-1`
  - Icons: `fontSize: '15px'`
  - Interaction: `hover:bg-primary/10 hover:text-primary transition-all` (or relative danger/success colors like `hover:bg-red-500/10`).

## 6. Data Tables

Tables are the core of the CRM experience and must be heavily optimized for data density and readability.

- **Container:** `bg-surface-lowest rounded border border-border-dark overflow-hidden`
- **Header Cells (`<th>`):**
  - Padding: `px-3 py-2`
  - Font: `text-[10px] uppercase font-bold text-text-muted tracking-wider`
  - Background: `bg-surface-container`
- **Data Cells (`<td>`):**
  - Padding: `px-3 py-2` (or `py-1.5` for extremely dense tables like Purchases).
  - Primary Text: `text-[12px]` or `text-[11px]` (e.g., `text-on-surface font-bold`).
  - Secondary Text: `text-[10px] text-text-muted`.
- **Row Styling (`<tr>`):**
  - Interaction: `hover:bg-surface-high/60 cursor-pointer transition-all`.
  - Borders: `border-b border-border-dark/40 last:border-0`.
- **Badges / Status Indicators:**
  - Small, high-contrast pills.
  - Styling: `px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide`.
  - Colors: Use muted backgrounds with bright text and borders (e.g., `bg-emerald-500/10 text-emerald-400 border-emerald-500/20`).
- **Avatars / Leading Icons:**
  - Size: `size-7` (28x28px).
  - Font: `text-[11px] font-bold`.
  - Shape: `rounded` (not full circle, keeping with the square CRM aesthetic).

## 7. Tabs & Toggles

- **Tab Navigation:**
  - Padding: `pb-2`
  - Font: `text-[12px] font-bold`
  - Active State: `text-primary` with a bottom indicator (`h-0.5 bg-primary absolute bottom-0 left-0 right-0`).
- **Toggles (e.g., SKU Selectors):**
  - Avoid pill-shapes (`rounded-full`); use square-edge (`rounded` or `rounded-md`), high-contrast toggle components.

## 8. Color Palette & Theme Tokens

Rely strictly on the semantic theme tokens defined in the application's Tailwind config to ensure light/dark mode compatibility and unified branding:

- `bg-surface-lowest` (`#ffffff`): Main container backgrounds.
- `bg-surface-low` (`#f3f3fe`) / `bg-surface-container` (`#ededf9`): Table headers, secondary areas.
- `bg-surface-high` (`#e7e7f3`): Hover states on rows.
- `border-border-dark` (`#c3c6d7`): Primary borders.
- `text-on-surface` (`#191b23`): Primary text.
- `text-text-muted` (`#737686`): Secondary/tertiary text, breadcrumbs, icons.
- `bg-primary` (`#004ac6`) / `text-primary` (`#004ac6`): Actionable highlights, main buttons.
