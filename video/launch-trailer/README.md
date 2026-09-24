# TranscreAI — launch trailer

A 2:54, 1080p30 launch trailer for localization professionals. Everything is
code: scenes are React + inline SVG rendered with [Remotion](https://remotion.dev),
the orchestral-style score is synthesized in JavaScript, and the only external media are short
silent excerpts of Blender Studio's *Sprite Fright* (CC BY 4.0), the same film
the live demo account is seeded with.

This is a standalone package. It is **not** one of the root npm workspaces, so
install it on its own.

```bash
cd video/launch-trailer
npm install
npm run studio    # live preview / scrub in the browser
npm run render    # → out/transcreai-launch-trailer.mp4 (regenerates the score first)
```

Requires `ffmpeg` on `PATH` (for loudness-normalizing the score and cutting clips).

## Structure

| Path | What |
| --- | --- |
| `src/LaunchTrailer.tsx` | Scene order and durations (single source of truth) |
| `src/scenes/Story.tsx` | Cold open → *Inside Out* broccoli → translation vs transcreation → market pressure → the gap → title |
| `src/scenes/Product.tsx` | 01 Import · 02 Discover · 03 Target · 04 Research · 05 Decide · 06 Converse |
| `src/scenes/Outro.tsx` | Human-in-the-loop principle → scale across markets → end card |
| `src/components/` | Brand mark, hand-drawn SVG flags, recreated app chrome (window, player, NLE timeline, cursor) |
| `src/components/Produce.tsx` | Shaded 3D-look broccoli (buds laid out on a phyllotaxis spiral, lit per bud) and a glossy bell pepper |
| `src/theme.ts` | Colors mirrored from `frontend/src/index.css` |
| `src/data/subtitles.ts` | Timings generated from the film's real `.srt` (drives the timeline track) |
| `scripts/generate-score.mjs` | Deterministic score synth (string pads, bowed ostinato, taiko, braams, piano, hall reverb). No drum kit. Cut points mirror the scene list, so change both together |
| `scripts/extract-clips.mjs` | Re-cuts `public/clips/*.mp4` from the source film (`upload/` at repo root by default) |

`public/score.wav` is generated and git-ignored; `public/clips/` is committed so
the trailer renders without the 100 MB source film.

## Content notes

- The UI is a faithful recreation of the app, not screen capture. Item text,
  importance scores and the *Sugar Buns → 落ち着いて、ハニー。* verdict come from
  the live demo project. Other rows are illustrative.
- The cited stats (SlashFilm, MarkWide Research, Rest of World) match the
  Devpost write-up.
