import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import sharp from 'sharp';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');
const assetsDir = path.join(rootDir, 'assets');

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(assetsDir, { recursive: true });

// 1. Full Icon SVG (Indigo Gradient + White Shopping Bag + Clothing Hanger + Emerald Check Badge)
const fullIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4F46E5" />
      <stop offset="55%" stop-color="#3730A3" />
      <stop offset="100%" stop-color="#1E1B4B" />
    </linearGradient>
    <linearGradient id="bagGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#E0E7FF" />
    </linearGradient>
    <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10B981" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1024" height="1024" rx="220" fill="url(#bgGrad)" />

  <!-- Subtle Decorative Glow -->
  <circle cx="512" cy="480" r="360" fill="#6366F1" opacity="0.18" />

  <!-- Top Bag Handles -->
  <path d="M370 360 C370 230, 654 230, 654 360" fill="none" stroke="#C7D2FE" stroke-width="44" stroke-linecap="round" />

  <!-- Main Shopping Bag Body -->
  <path d="M236 340 H788 L836 820 C842 872, 802 916, 750 916 H274 C222 916, 182 872, 188 820 Z" fill="url(#bagGrad)" />

  <!-- Bag Top Fold Accent -->
  <path d="M236 340 H788 L800 430 H224 Z" fill="#E0E7FF" />

  <!-- Center Clothing Hanger Icon Inside Bag (Represents Montreal Clothing Pool) -->
  <path d="M512 485 C512 455, 552 450, 552 480 C552 502, 512 515, 512 542" fill="none" stroke="#4338CA" stroke-width="28" stroke-linecap="round" />
  <path d="M512 542 L310 665 C290 677, 298 708, 322 708 H702 C726 708, 734 677, 714 665 L512 542 Z" fill="none" stroke="#4F46E5" stroke-width="34" stroke-linejoin="round" />
  <line x1="390" y1="708" x2="634" y2="708" stroke="#6366F1" stroke-width="28" stroke-linecap="round" />

  <!-- Pooling Nodes (3 Connected Dots Above Hanger) -->
  <circle cx="380" cy="410" r="20" fill="#4F46E5" />
  <circle cx="644" cy="410" r="20" fill="#4F46E5" />

  <!-- Emerald Order-Confirmed Checkmark Badge -->
  <circle cx="748" cy="768" r="130" fill="#1E1B4B" />
  <circle cx="748" cy="768" r="112" fill="url(#badgeGrad)" />
  <path d="M695 768 L732 805 L808 729" fill="none" stroke="#FFFFFF" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" />
</svg>
`;

// 2. Android Adaptive Foreground SVG (Transparent Background with Safe-Zone Padding)
const foregroundSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <g transform="translate(154, 154) scale(0.7)">
    <path d="M370 360 C370 230, 654 230, 654 360" fill="none" stroke="#C7D2FE" stroke-width="44" stroke-linecap="round" />
    <path d="M236 340 H788 L836 820 C842 872, 802 916, 750 916 H274 C222 916, 182 872, 188 820 Z" fill="#FFFFFF" />
    <path d="M512 485 C512 455, 552 450, 552 480 C552 502, 512 515, 512 542" fill="none" stroke="#4338CA" stroke-width="28" stroke-linecap="round" />
    <path d="M512 542 L310 665 C290 677, 298 708, 322 708 H702 C726 708, 734 677, 714 665 L512 542 Z" fill="none" stroke="#4F46E5" stroke-width="34" stroke-linejoin="round" />
    <circle cx="748" cy="768" r="112" fill="#10B981" />
    <path d="M695 768 L732 805 L808 729" fill="none" stroke="#FFFFFF" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" />
  </g>
</svg>
`;

// 3. Solid/Gradient Background SVG for Android Adaptive Icons & Splash
const backgroundSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4F46E5" />
      <stop offset="100%" stop-color="#1E1B4B" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bgGrad)" />
</svg>
`;

// 4. Splash Screen SVG (2732x2732)
const splashSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732" width="2732" height="2732">
  <defs>
    <linearGradient id="splashBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#312E81" />
      <stop offset="100%" stop-color="#0F172A" />
    </linearGradient>
  </defs>
  <rect width="2732" height="2732" fill="url(#splashBg)" />
  <g transform="translate(854, 854)">
    ${fullIconSvg.replace(/<svg[^>]*>|<\/svg>/g, '')}
  </g>
</svg>
`;

async function run() {
  console.log('🎨 Generating StylePool MTL SVG & PNG icons...');

  // Save web vector icon
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), fullIconSvg.trim());

  // Render Web Favicon & Apple Touch Icon
  await sharp(Buffer.from(fullIconSvg))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));

  await sharp(Buffer.from(fullIconSvg))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // Render Capacitor Master Assets (1024x1024 Icons & 2732x2732 Splash)
  await sharp(Buffer.from(fullIconSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(assetsDir, 'icon-only.png'));

  await sharp(Buffer.from(foregroundSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(assetsDir, 'icon-foreground.png'));

  await sharp(Buffer.from(backgroundSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(assetsDir, 'icon-background.png'));

  await sharp(Buffer.from(splashSvg))
    .resize(2732, 2732)
    .png()
    .toFile(path.join(assetsDir, 'splash.png'));

  await sharp(Buffer.from(splashSvg))
    .resize(2732, 2732)
    .png()
    .toFile(path.join(assetsDir, 'splash-dark.png'));

  console.log('📱 Applying icons to iOS and Android native projects...');
  if (fs.existsSync(path.join(rootDir, 'ios')) || fs.existsSync(path.join(rootDir, 'android'))) {
    execSync('npx capacitor-assets generate --iconBackgroundColor "#312E81" --splashBackgroundColor "#1E1B4B"', {
      stdio: 'inherit',
    });
  }

  console.log('✅ All Web, iOS, and Android icons generated!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
