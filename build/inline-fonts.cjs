const fs = require('fs');
const path = require('path');

const FONTS = [
  { family: 'IBM Plex Mono', weight: 400, file: '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2' },
  { family: 'IBM Plex Mono', weight: 500, file: '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2' },
  { family: 'IBM Plex Mono', weight: 600, file: '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2' },
  { family: 'IBM Plex Serif', weight: 400, file: '@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-400-normal.woff2' },
  { family: 'IBM Plex Serif', weight: 400, file: '@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-400-italic.woff2', style: 'italic' },
  { family: 'IBM Plex Serif', weight: 500, file: '@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-500-normal.woff2' },
  { family: 'Major Mono Display', weight: 400, file: '@fontsource/major-mono-display/files/major-mono-display-latin-400-normal.woff2' },
  { family: 'Permanent Marker', weight: 400, file: '@fontsource/permanent-marker/files/permanent-marker-latin-400-normal.woff2' },
  { family: 'Special Elite', weight: 400, file: '@fontsource/special-elite/files/special-elite-latin-400-normal.woff2' },
  { family: 'Kalam', weight: 400, file: '@fontsource/kalam/files/kalam-latin-400-normal.woff2' },
  { family: 'Kalam', weight: 700, file: '@fontsource/kalam/files/kalam-latin-700-normal.woff2' },
  { family: 'Patrick Hand', weight: 400, file: '@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2' },
  { family: 'Caveat', weight: 400, file: '@fontsource/caveat/files/caveat-latin-400-normal.woff2' },
  { family: 'Caveat', weight: 600, file: '@fontsource/caveat/files/caveat-latin-600-normal.woff2' },
  { family: 'Caveat', weight: 700, file: '@fontsource/caveat/files/caveat-latin-700-normal.woff2' },
];

const root = path.join(__dirname, '..');
let cssBlock = '';

for (const font of FONTS) {
  const buffer = fs.readFileSync(path.join(root, 'node_modules', font.file));
  const b64 = buffer.toString('base64');
  cssBlock += `@font-face{font-family:'${font.family}';font-weight:${font.weight};font-style:${font.style || 'normal'};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2')}\n`;
}

fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.writeFileSync(path.join(root, 'src', 'fonts-inline.css'), cssBlock);
console.log(`Generated src/fonts-inline.css (${(cssBlock.length / 1024).toFixed(1)} KB)`);
