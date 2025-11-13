# Multi-Platform Streaming Chatbot Dashboard - Design Guidelines

## Design Approach
**Reference-Based Approach** drawing from industry-leading streaming and creator tools:
- **Primary References**: Streamlabs Dashboard, StreamElements, Twitch Creator Dashboard, YouTube Studio
- **Principle**: Functionality-first design with clear visual hierarchy, optimized for monitoring and quick configuration changes

## Layout System

### Spacing Scale
Use Tailwind spacing units: **2, 4, 6, 8, 12, 16** for consistent rhythm
- Tight spacing (p-2, gap-2): Within component groups, form fields
- Medium spacing (p-4, p-6, gap-4): Between related sections, card padding
- Large spacing (p-8, p-12, gap-8): Page margins, section separation

### Grid Structure
**Dashboard Layout**: Sidebar navigation (280px fixed) + main content area (fluid)
**Responsive Behavior**: Sidebar collapses to icon-only (<1024px), hamburger menu (<768px)

## Typography Hierarchy

### Font System
- **Primary Font**: Inter or Roboto (via Google Fonts CDN)
- **Monospace Font**: JetBrains Mono or Roboto Mono (for logs, status messages)

### Type Scale
- **Page Titles**: text-2xl font-bold
- **Section Headers**: text-xl font-semibold
- **Card Titles**: text-lg font-medium
- **Body Text**: text-base font-normal
- **Labels**: text-sm font-medium
- **Captions/Meta**: text-xs font-normal
- **Logs/Code**: text-sm font-mono

## Core Component Library

### Navigation
**Sidebar Navigation**:
- Logo/branding at top (h-16)
- Navigation items with icons (Heroicons) + labels
- Active state: subtle left border (4px) + different text treatment
- Bottom: User profile section with settings/logout

**Top Bar**:
- Platform connection status badges (Twitch/YouTube/Kick) with live indicators
- Quick actions: Manual trigger button (prominent)
- Notification bell icon

### Platform Connection Cards
**Grid Layout**: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
**Card Structure**:
- Platform logo/icon (top-left, h-12 w-12)
- Connection status indicator (top-right: Connected/Disconnected/Error)
- Platform name (text-lg font-semibold)
- OAuth connect/disconnect button
- Last activity timestamp (text-sm)
- Settings gear icon for platform-specific config

### Settings Panel
**Form Layout**: Single-column, max-w-2xl
- **Interval Configuration**:
  - Radio buttons: Fixed Interval / Random Range / Manual Only
  - Conditional inputs: Number input for fixed (with unit dropdown: minutes/hours)
  - Two number inputs for random range (min/max)
- **Trigger Configuration**:
  - Toggle switches for each trigger type
  - Text inputs for custom chat keywords
  - Multi-select for enabled platforms per trigger
- **AI Settings**:
  - Dropdown for AI model selection
  - Textarea for custom prompt/style preferences
  - Slider for creativity level (temperature)

### Activity Dashboard
**Two-Column Layout**: 
- **Left Column (60%)**: Recent Activity Feed
  - Timeline/list of posted facts with timestamps
  - Platform badges showing where posted
  - Fact content preview (truncated)
  - Engagement metrics if available (reactions, replies)
  
- **Right Column (40%)**: Live Status Panel
  - Current bot status (Active/Paused/Error)
  - Next scheduled post countdown
  - Platforms currently connected (chip/badge list)
  - Quick action buttons: Post Now, Pause, Resume

### Logs/History Section
**Table Layout**: Full-width responsive table
- Columns: Timestamp, Platform, Trigger Type, Fact Content, Status
- Filtering options: Date range picker, platform filter, status filter
- Pagination or infinite scroll
- Export button (CSV/JSON)

### Manual Trigger Panel
**Quick Access Card**: Fixed position or prominent dashboard placement
- Large "Post Snapple Fact Now" button
- Platform checkboxes (multi-select which platforms to post to)
- Preview of generated fact before posting
- Success/error feedback messages

## Component Specifications

### Buttons
- **Primary Action**: Larger size (py-3 px-6), font-semibold
- **Secondary Action**: Medium size (py-2 px-4), font-medium
- **Icon Buttons**: Square aspect ratio (h-10 w-10), centered icon
- **Destructive Actions**: Text treatment to indicate danger (disconnect, delete)

### Form Controls
- **Text Inputs**: Full border, rounded-lg, p-3, font-normal
- **Labels**: Above input, mb-2, font-medium
- **Helper Text**: Below input, text-sm, muted treatment
- **Toggles**: iOS-style switches for boolean options
- **Radio Groups**: Stacked vertically with adequate spacing (gap-4)

### Status Indicators
- **Connection Status**: Circular dot (h-3 w-3) + text label
  - States: Connected, Connecting, Disconnected, Error
- **Live Indicators**: Pulsing animation for active/streaming status
- **Badge Components**: Rounded-full px-3 py-1 text-xs font-medium

### Cards
- **Standard Card**: Rounded-lg border p-6
- **Interactive Card**: Hover state with subtle elevation change
- **Stat Card**: Number (text-3xl font-bold) + label (text-sm)

## Accessibility

### Consistent Implementation
- All form inputs: aria-labels, associated labels, error states with aria-invalid
- Focus states: Visible outline (ring-2) on all interactive elements
- Status indicators: Icon + text (not just visual)
- Keyboard navigation: Tab order follows logical flow, escape to close modals
- Screen reader announcements for live status updates

## Icon System
**Heroicons** (via CDN): Outline style for navigation/secondary actions, Solid style for active states/primary actions

**Key Icons Needed**:
- Platform logos: Twitch, YouTube, Kick (external assets)
- Navigation: Dashboard, Settings, Activity, Connect, History
- Actions: Play, Pause, Refresh, Trash, Edit, Check, X
- Status: CheckCircle, ExclamationCircle, Clock, Wifi

## Animations
**Minimal, Purposeful Only**:
- Connection status changes: Smooth fade transition (300ms)
- Live status pulse: Gentle 2s infinite pulse on connection indicators
- Button feedback: Subtle scale (0.98) on active press
- Toast notifications: Slide-in from top-right for success/error messages

## Images
No hero images required. This is a utility dashboard focused on functionality. All visual elements are UI components, icons, and platform logos.

**Platform Logos**: Small square assets (48x48px minimum) for Twitch, YouTube, Kick displayed in connection cards and status badges.