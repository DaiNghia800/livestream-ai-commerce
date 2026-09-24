---
name: LiveOrder AI Studio
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#464555'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#712ae2'
  on-secondary: '#ffffff'
  secondary-container: '#8a4cfc'
  on-secondary-container: '#fffbff'
  tertiary: '#00505f'
  on-tertiary: '#ffffff'
  tertiary-container: '#006a7c'
  on-tertiary-container: '#93e8ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#eaddff'
  secondary-fixed-dim: '#d2bbff'
  on-secondary-fixed: '#25005a'
  on-secondary-fixed-variant: '#5a00c6'
  tertiary-fixed: '#acedff'
  tertiary-fixed-dim: '#4cd7f6'
  on-tertiary-fixed: '#001f26'
  on-tertiary-fixed-variant: '#004e5c'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  title-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  metric-num:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
  space-3xl: 3rem
---

## Brand & Style

This design system powers a high-velocity, automated social commerce and livestream sales engine. Designed for livestreamers, operations teams, and warehouse dispatchers in the Vietnamese e-commerce market, the aesthetic strikes a deliberate balance between mission-critical operational precision and vibrant real-time engagement.

The UI embodies **Modern Professional SaaS with Real-Time Ambient Dynamic States**:
- **Clarity under Pressure**: High-density layouts, rapid scanning paths, and glanceable live metrics keep operators focused during intense multi-hour broadcast spikes.
- **Operational Authority**: Clean slate foundations grounded with refined typography instill confidence in automated inventory deductions, webhooks, and AI-driven comment parsing.
- **Vibrant Real-Time Signals**: Electric indigo and violet accents drive key interactive triggers, complemented by vivid semantic badges that map the lifecycle of order fulfillment instantly.
- **Vietnamese Linguistic Native**: Vertical rhythm and baseline metrics are fine-tuned to accommodate diacritics and accented characters seamlessly without awkward line breaks or clipped ascenders/descenders.

## Colors

The palette establishes high perceptual contrast for high-density, multi-panel dashboard and studio surfaces.

### Core Swatches
- **Primary Indigo** (`#4F46E5`, hover `#4338CA`, light tint `#EEF2FF`): Represents primary call-to-actions, live stream activation, and core interface highlights.
- **Secondary Violet** (`#7C3AED`, hover `#6D28D9`, light tint `#F5F3FF`): Highlights AI-automated mechanisms, bot-parsing indicators, and secondary actionable controls.
- **Tertiary Cyan** (`#06B6D4`, light tint `#ECFEFF`): Reserved for real-time analytics velocity, webhook events, and streaming sync status.
- **Neutral Canvas & Surfaces**:
  - App Canvas Base: `#F8FAFC` (Slate 50)
  - Surface Panel / Cards: `#FFFFFF` (Pure White)
  - Elevated Popovers / Flyouts: `#FFFFFF`
  - Subtle Dividing Lines: `#E2E8F0` (Slate 200)
  - Subtle Border Interactive: `#CBD5E1` (Slate 300)
  - Secondary Text / Subtext: `#64748B` (Slate 500)
  - Primary Text / Headings: `#0F172A` (Slate 900)

### Fulfillment Status Hierarchy (Strict Tokens)
- **Pending (Chờ xử lý)**: Background `#FFFBEB`, Border `#FDE68A`, Text `#B45309` (Amber)
- **Confirmed (Đã chốt đơn)**: Background `#EFF6FF`, Border `#BFDBFE`, Text `#1D4ED8` (Blue)
- **Paid (Đã thanh toán)**: Background `#ECFDF5`, Border `#A7F3D0`, Text `#047857` (Emerald)
- **ReadyToShip (Sẵn sàng gửi)**: Background `#EEF2FF`, Border `#C7D2FE`, Text `#4338CA` (Indigo)
- **Shipping (Đang giao hàng)**: Background `#FAF5FF`, Border `#E9D5FF`, Text `#7E22CE` (Purple)
- **Delivered (Giao thành công)**: Background `#F0FDFA`, Border `#99F6E4`, Text `#0F766E` (Teal)
- **Cancelled (Đã huỷ)**: Background `#FFF1F2`, Border `#FECDD3`, Text `#BE123C` (Rose)

## Typography

Typography establishes an executive, highly legible balance between numerical data clarity and editorial strength.

- **Headlines (Plus Jakarta Sans)**: Used for view titles, aggregate metrics, modal headers, and key financial summaries. Its geometric yet organic curves bring warmth to modern software.
- **Body & Data Tables (Inter)**: Built with uniform vertical proportions, robust x-height, and extensive open font features (such as tabular figures `tnum`), preventing numeric misalignment during rapid live-counter updates.
- **Vietnamese Support Considerations**: Line-heights for all body layers are locked to a minimum of 1.42x to prevent Vietnamese tonal marks (hỏi, ngã, nặng, sắc, huyền) from colliding with top bounding boxes or adjacent lines.

## Layout & Spacing

The layout adopts a **Fluid High-Density Dashboard Grid** optimized for real-time live-order workflows:

- **Desktop (>= 1280px)**: A collapsible left navigation bar (64px collapsed, 240px expanded), an active multi-column working canvas (12 columns, 24px gutters), and a dedicated 380px contextual live-feed/bot-activity right drawer.
- **Tablet (768px - 1279px)**: 8-column layout with 16px gutters and 24px canvas margins. Contextual stream sidebars convert to dismissible overlays or swipeable bottom-sheets.
- **Mobile (< 768px)**: 4-column layout with 16px gutters and 16px margins. Primary tables transform into card lists, prioritizing order total, status badge, and one-tap calling/printing action targets.
- **Density Control**: Live comments and real-time order lists default to compact padding (`space-sm` / `8px` vertical gap) to maximize visible throughput without requiring manual scrolling during live peaks.

## Elevation & Depth

Visual hierarchy uses a refined combination of **low-contrast borders** and **diffused ambient shadows** to prevent optical fatigue during prolonged live sessions:

- **Level 0 (Flat / Canvas)**: `#F8FAFC`, zero elevation, used for base canvas background and passive divider tracks.
- **Level 1 (Card & Module Surface)**: `#FFFFFF` surface with a crisp 1px perimeter border (`#E2E8F0`) and an ambient tinted drop shadow: `box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.03)`.
- **Level 2 (Hovered Card / Active Table Rows / Dropdown Menus)**: `box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`, border shifted to `#CBD5E1`.
- **Level 3 (Modal Dialogs, Print Preview, Drawers)**: Surface floating over `#0F172A` backdrop with 40% alpha and `backdrop-filter: blur(4px)`. Shadow: `box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.06)`.
- **Live Event Accents**: Incoming live comments tagged with an AI order trigger exhibit a subtle pulsing glow using `0 0 0 2px rgba(99, 102, 241, 0.2)`.

## Shapes

The design uses balanced, controlled curvature to maintain a crisp software feel while remaining tactile:

- **Standard Cards and Panels**: Fixed to **12px** (`rounded-xl` in standard 0.75rem / 12px scale), offering clean, softened corners that frame content without wasting layout real estate.
- **Interactive Controls (Buttons, Text Inputs, Selects)**: Fixed to **8px** for consistent alignment with standard table rows and form toolbars.
- **Chips, Badges, and Real-time Status Indicators**: Full pill radius (`9999px`) to immediately distinguish categorical attributes and status states from actionable boxes.
- **Modal Containers**: **16px** to provide a distinct, polished boundary against the blurred backdrop.

## Components

### Buttons & Quick Actions
- **Primary CTA ("Bắt đầu Live", "Chốt đơn ngay")**: Background `#4F46E5`, text `#FFFFFF`, font-weight 600, border-radius 8px. Hover shifts to `#4338CA` with subtle transform micro-interaction (`translate-y: -0.5px`).
- **Secondary AI Action ("Tự động quét", "Phân tích cú pháp")**: Background `#F5F3FF`, text `#7C3AED`, border `1px solid #DDD6FE`. Hover shifts to `#EDE9FE`.
- **Destructive ("Huỷ đơn", "Khoá khách")**: Background `#FFF1F2`, text `#BE123C`, border `1px solid #FECDD3`. Hover `#FFE4E6`.
- **Sizes**:
  - `Compact (Table/Toolbar)`: Height 32px, padding 0 12px, font-size 13px.
  - `Default (Forms/Actions)`: Height 40px, padding 0 16px, font-size 14px.
  - `Large (Primary Studio Start)`: Height 48px, padding 0 24px, font-size 16px.

### Status Chips (Pill Badges)
- Standardized height of 24px, padding 0 10px, radius 9999px, font-size 11px, font-weight 600 with tracking uppercase.
- Contain a 6px circular dot on the left side with a matching solid fill to maximize color-blind accessibility alongside localized text ("ĐÃ CHỐT", "CHỜ XỬ LÝ", "ĐÃ GIAO").

### Input Fields & Filter Bars
- 40px height, background `#FFFFFF`, border `1px solid #E2E8F0`, 8px corner radius.
- **Focus State**: Border color transitions to `#6366F1` with an outer ring glow: `box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15)`.
- **Vietnamese Support**: Placeholder color `#94A3B8` with localized sample texts (e.g., "Tìm theo tên, SĐT, hoặc mã đơn...").

### Data Tables & High-Throughput Lists
- Headers: Background `#F8FAFC`, height 40px, text `#64748B`, uppercase tracking, font size 11px, bottom border `1px solid #E2E8F0`.
- Rows: Clean height of 52px, alternating hover highlight `#F8FAFC`, tabular figures (`font-variant-numeric: tabular-nums`) for currency (VND) and phone numbers.
- Pinned columns support frozen operational triggers (e.g., Print Bill "In vận đơn" and Call "Gọi điện").

### Real-Time Live Stream Comment Stream Card
- Ultra-condensed card component (padding 10px 12px, border-radius 10px, border `1px solid #E2E8F0`).
- Displays customer avatar, phone/order match status, recognized keyword (e.g., `M1 + Màu Đen + SĐT`), and automatic AI confidence badge (e.g., `99% Chốt đơn`).