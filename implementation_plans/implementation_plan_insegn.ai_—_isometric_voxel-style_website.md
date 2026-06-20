# Insegn.AI — Isometric Voxel-Style Website

## Blueprint & Visual Reference

![Blueprint Mockup](/Users/giacomomeschini/.gemini/antigravity/brain/86777782-b568-439b-b502-6761b39b7d31/insegnai_blueprint_1775237229094.png)

## Overview

A new **Insegn.AI** landing page built as a full **isometric pixel-art/voxel diorama** on a cream background. This is a **new standalone website** — separate from the existing "Piloti di AI" game — created as `insegnai/index.html` and `insegnai/style.css` within the workspace.

The site uses your provided voxel art assets (desk scene, loop structure, laptop, school supplies, logo) as hero imagery, with CSS-driven micro-animations and scroll-based reveals.

---

## User Review Required

> [!IMPORTANT]
> **New site vs. replacing existing**: This plan creates a **new `insegnai/` folder** inside the workspace, keeping the existing "Piloti di AI" game untouched. If you want to **replace** the existing site instead, let me know.

> [!IMPORTANT]
> **Text content**: You mentioned you'll modify sections and texts later. I'll use the Italian text from your brief as placeholder. All text will be easy to find and edit in the HTML.

> [!IMPORTANT]
> **Voxel art images**: I'll use your provided PNG images directly (desk scene = image_3, loop structure = image_2, laptop = image_4, logo = image_5). I'll also generate additional diorama scene images for the "PROGETTATO PER TUTTI" section.

---

## Proposed Changes

### Website Structure

```
/Piloti di AI — Workshop Interattivo/
└── insegnai/
    ├── index.html          [NEW] — Main page
    ├── style.css           [NEW] — Design system & all styles
    ├── animations.js       [NEW] — Scroll reveals, hover effects, particle system
    └── assets/             [NEW] — Image assets
        ├── logo.jpg               — Insegn.AI logo (from image_5)
        ├── desk-scene.png         — Hero desk diorama (from image_3)
        ├── loop-structure.png     — AI loop sculpture (from image_2)
        ├── laptop.png             — Voxel laptop close-up (from image_4)
        ├── school-supplies.png    — Backpack & supplies (from image_1)
        ├── diorama-family.png     [GENERATE] — BES/DSA family scene
        ├── diorama-classroom.png  [GENERATE] — Teacher + students scene
        └── diorama-access.png     [GENERATE] — Accessibility icons scene
```

---

### Section 1: Navigation Bar

#### Layout
- Fixed top bar, semi-transparent with subtle blur backdrop
- **Left**: Insegn.AI logo (voxel book icon from image_5 + teal `#00C896` dot)
- **Right**: 4 navigation items as 3D pixelated tile buttons with isometric-style CSS (slight skew, box-shadow to simulate depth)
  - `Cos'è Insegn.AI`
  - `Per chi è Insegn.AI`
  - `Attività & Workshop`
  - `Contatti`

#### Interactions
- Nav tiles lift on hover (translate + shadow change)
- Logo has subtle float animation

---

### Section 2: Hero — Voxel Desk Diorama

#### Layout (split into two columns)
**Left column (60%)**:
- **Speech bubble** above the desk: 3D-styled div with isometric shadow, containing "Pensa, Rifletti, Chiedi. Lead the loop!" in Space Mono Bold
- **Hero image**: Your desk scene (image_3) — the voxel laptop with rainbow screen, ANTS book, pencil, supplies — displayed as a large hero image with CSS `image-rendering: pixelated` to preserve the voxel look
- **Below image**: Two CTA buttons side by side
  - Pink `#FF3769` button: **"Inizia Ora"** — 3D voxel-style with bottom/right shadow
  - Teal `#00C896` button: **"Scopri di più"** — matching 3D style

**Right column (40%)**:
- **Loop structure image** (image_2) — the interlocking rings/cubes
- CSS rotation animation (slow `rotateY` transform to simulate 3D rotation)
- Labels: "AI literacy & fluency" and "Lead the loop!" in Space Mono

#### Interactions
- Speech bubble fades in on load
- Desk scene has subtle parallax on mouse move
- CTA buttons have 3D press effect on click (shadow shrinks, translate down)
- Loop structure rotates continuously with CSS animation
- Floating particle effects (tiny teal/pink squares) drift around the hero

---

### Section 3: "PROGETTATO PER TUTTI" — Inclusivity Dioramas

#### Layout
- Section title in Space Mono Bold with voxel-style underline accent
- Three diorama cards in a row, each containing:
  1. **Family + BES/DSA**: Generated voxel scene — family with student using tablet, magnifying glass, simplified text
  2. **Teacher + Students**: Generated voxel scene — classroom setting with collaborative learning
  3. **Accessibility**: Generated voxel scene — voxel-style accessibility icons (joystick, text-to-speech, etc.)

#### Interactions
- Cards rise from below on scroll (intersection observer)
- Each card tilts slightly on hover (3D perspective transform)
- Subtle glow effect on hover matching accent colors

---

### Design System (`style.css`)

| Token | Value |
|---|---|
| `--bg` | `#F5F0E1` (cream) |
| `--text-primary` | `#1A2E35` (dark navy) |
| `--text-secondary` | `#4A5C64` |
| `--accent-teal` | `#00C896` |
| `--accent-pink` | `#FF3769` |
| `--accent-teal-glow` | `rgba(0, 200, 150, 0.3)` |
| `--accent-pink-glow` | `rgba(255, 55, 105, 0.3)` |
| `--font` | `'Space Mono', monospace` |
| `--shadow-voxel` | `4px 4px 0 rgba(0,0,0,0.15)` |
| `--shadow-voxel-hover` | `6px 6px 0 rgba(0,0,0,0.2)` |

---

### Animations (`animations.js`)

1. **Scroll reveal**: IntersectionObserver fades in sections as they enter viewport
2. **Parallax**: Subtle mouse-tracking on the desk scene
3. **Particles**: Canvas-based floating pixel squares in teal/pink that drift lazily
4. **Loop rotation**: CSS-driven, enhanced with slight perspective wobble on hover
5. **Button press**: 3D tactile press feedback
6. **Nav tile hover**: Isometric lift effect

---

## Open Questions

> [!IMPORTANT]
> 1. **Should the "PROGETTATO PER TUTTI" diorama images be generated as voxel art?** I'll generate 3 new voxel-art images for the inclusivity section (family + BES/DSA, teacher + students, accessibility). Confirm if this approach works.
>
> 2. **Smooth scroll to sections?** The nav items could smooth-scroll to their respective sections. Confirm if you want anchor-based navigation.
>
> 3. **Additional sections beyond what's described?** You mentioned you'll modify sections later — should I include skeleton/placeholder sections for future content below "PROGETTATO PER TUTTI"?

---

## Verification Plan

### Automated Tests
- Open the page via `python3 -m http.server` and verify in browser
- Check responsive layout at mobile (375px), tablet (768px), and desktop (1440px)
- Verify all images load correctly
- Test scroll animations trigger properly
- Validate HTML/CSS for any errors

### Manual Verification
- Browser screenshot walkthrough of each section
- Verify hover/click micro-animations are smooth
- Check Space Mono font loads correctly at all weights
- Ensure voxel aesthetic is consistent throughout
