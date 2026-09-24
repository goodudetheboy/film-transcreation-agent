// Cuts the short, silent film excerpts the trailer shows inside its mock
// player panels. Source is Blender Studio's "Sprite Fright" (CC BY 4.0) —
// the same film the live demo account is seeded with. Credit is on the end card.
//
//   node scripts/extract-clips.mjs [path/to/Sprite Fright.mp4]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(process.argv[2] ?? resolve(root, '../../upload/Sprite Fright - Blender Open Movie.mp4'));
if (!existsSync(src)) {
  console.error(`Source film not found: ${src}\nDownload Sprite Fright from https://studio.blender.org/films/sprite-fright/ and pass its path.`);
  process.exit(1);
}
const out = resolve(root, 'public/clips');
mkdirSync(out, { recursive: true });

// name -> [start, duration] in seconds
const clips = {
  snail: [18, 6],
  sugarbuns: [34, 6],
  unionjack: [40, 6],
  sprites: [158, 6],
  geezer: [189, 6],
  spritethem: [300, 6],
  web: [360, 6],
};

for (const [name, [ss, t]] of Object.entries(clips)) {
  const dest = resolve(out, `${name}.mp4`);
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-ss', String(ss), '-t', String(t), '-i', src,
    '-an', '-vf', 'scale=1280:-2,fps=30', '-c:v', 'libx264', '-crf', '24',
    '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dest,
  ]);
  console.log('wrote', dest);
}
