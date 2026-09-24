import { continueRender, delayRender, staticFile } from 'remotion';

const WEIGHTS: [string, number][] = [
  ['Regular', 400],
  ['Medium', 500],
  ['Bold', 700],
  ['Black', 900],
];

const handle = delayRender('Loading Satoshi');
Promise.all(
  WEIGHTS.map(([name, weight]) =>
    new FontFace('Satoshi', `url(${staticFile(`fonts/Satoshi-${name}.woff2`)}) format('woff2')`, {
      weight: String(weight),
    })
      .load()
      .then((face) => (document.fonts as unknown as Set<FontFace>).add(face)),
  ),
)
  .then(() => continueRender(handle))
  .catch((err) => {
    console.error(err);
    continueRender(handle);
  });
