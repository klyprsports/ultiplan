<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Ultiplan — Ultimate Frisbee Strategy Designer

Ultiplan is a lightweight, browser-based playbook for designing and animating ultimate frisbee plays. Build offense/defense setups, draw routes, tune player speed/explosiveness, and run the play clock to visualize timing — all without a backend.

## Features
- Interactive field editor with offense/defense players and route drawing.
- Play animation with pause/resume and a live play clock.
- Per-player speed and acceleration controls to model timing.
- Auto-D to generate defender matchups from offense positions.
- Tactical notes with a simple markdown-lite formatter.
- Playbook with save/load/delete (stored in browser localStorage).

## Tech Stack
- React + TypeScript + Vite
- Tailwind-style utility classes (via className strings)
- `lucide-react` for icons

## Project Structure
- `App.tsx` — main layout, state, and play persistence
- `components/Field.tsx` — field rendering, route drawing, animation
- `components/Sidebar.tsx` — tactical notes + selected player controls
- `types.ts` — shared types for players, plays, and interaction modes

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Build and Preview
- Build: `npm run build`
- Preview: `npm run preview`

## Data and Persistence
- Plays are saved to `localStorage` under the key `ultiplan_saved_plays_v1`.
- There is no backend or external API dependency.
