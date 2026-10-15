# SPEC — Mobile editor shell

## Purpose
Most users edit on phones. The Length → Place → Polish → Render flow must be usable one-handed without hunting for the primary CTA or scrolling past a full-height 9:16 preview to reach tools.

## Breakpoint
- Compact shell: viewport width below Tailwind `lg` (1024px).
- Desktop: `lg+` keeps two-column Polish/Render aside (`1fr` + 340px).

## Shell rules
| Surface | Behavior under lg |
|---------|-------------------|
| Viewport | `viewportFit: cover`, `themeColor: #09090b`, `min-h-dvh` |
| Safe areas | `--safe-top/right/bottom/left`; header + bottom dock padded |
| Step rail | Sticky; horizontal snap pills; `min-h-11` |
| Continue | `MobileActionDock` full-width; step-rail Continue `hidden lg:flex` |
| Render CTA | Dock on render step; inline Render `hidden lg:inline-flex` |
| Preview | `max-h-[min(52dvh,calc(100vw*16/9))]`, `max-w-full` → `sm/md` larger; `lg:max-w-[360px]` |
| Polish tools | Tabs **Effects \| Captions \| More** directly under preview; panel `max-h-[40dvh]` scroll |
| Timeline | `h-14` track + **±0.5s** nudge buttons |
| Touch floor | Primary/secondary controls ≥ `min-h-11` (~44px) |
| Page padding | Editor `pb` leaves room for dock + safe-bottom |

## Coach
- Dock buttons carry `data-coach-target` (`continue`, `renderMp4`, `download`).
- During encode, overlay owns attention; `wait_encode` cue may remain in the rail.

## Components
- `MobileActionDock`, `PolishMobileTabs`, `EditorAsideMore`, `useIsLg` / `useMediaQuery`
- Updated: `EditorStepRail`, `EditorStudio`, `PreviewStage`, `SourceTimeline`, `AppShell`, `layout.tsx`

## Non-goals
- Pinch-zoom timeline.
- Redesign of home/auth beyond shared shell/viewport.
