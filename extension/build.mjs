/**
 * Extension Build Script
 *
 * Bundles TypeScript source files for Chrome Extension using esbuild.
 *
 * Usage:
 *   node build.mjs         # Production build
 *   node build.mjs --watch # Watch mode for development
 */

import * as esbuild from 'esbuild';
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

// Ensure dist directory exists
const distDir = join(__dirname, 'dist');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Common esbuild options
const commonOptions = {
  bundle: true,
  sourcemap: true,
  target: ['chrome120'],
  format: 'esm',
  logLevel: 'info',
};

// Build configurations
const builds = [
  {
    label: 'service-worker',
    entryPoints: [join(__dirname, 'src/entry/service-worker.ts')],
    outfile: join(distDir, 'service-worker.js'),
  },
  {
    label: 'content-script',
    entryPoints: [join(__dirname, 'src/entry/content-script.ts')],
    outfile: join(distDir, 'content-script.js'),
    // Content scripts should be IIFE format for browser compatibility
    format: 'iife',
  },
];

async function build() {
  console.log('Building extension...\n');

  try {
    for (const config of builds) {
      const { label, ...options } = config;
      console.log(`Building ${label}...`);

      const buildOptions = {
        ...commonOptions,
        ...options,
      };

      if (isWatch) {
        const ctx = await esbuild.context(buildOptions);
        await ctx.watch();
        console.log(`  Watching ${label}...`);
      } else {
        await esbuild.build(buildOptions);
        console.log(`  Built ${label} -> ${options.outfile}`);
      }
    }

    // Copy static files to dist
    copyStaticFiles();

    console.log('\nBuild complete!');

    if (!isWatch) {
      console.log('\nTo load in Chrome:');
      console.log('  1. Go to chrome://extensions/');
      console.log('  2. Enable "Developer mode"');
      console.log('  3. Click "Load unpacked"');
      console.log('  4. Select the extension/ folder');
    }

  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

function copyStaticFiles() {
  // Ensure icons directory exists
  const iconsDir = join(__dirname, 'icons');
  if (!existsSync(iconsDir)) {
    mkdirSync(iconsDir, { recursive: true });
  }

  // Create placeholder icons if they don't exist
  createPlaceholderIcons(iconsDir);
}

/**
 * Creates simple placeholder PNG icons.
 * Uses pre-generated base64-encoded minimal PNGs.
 */
function createPlaceholderIcons(iconsDir) {
  // Pre-generated minimal blue square PNGs (base64 encoded)
  // These are simple solid blue (#3B82F6) squares
  const icons = {
    16: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAADklEQVQoz2Ng+M9AhAAAANwAGeT8XLEAAAAASUVORK5CYII=',
    48: 'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAEklEQVRYw+3BMQEAAADCIPuntsROWAAACQEA8gBWugAAAABJRU5ErkJggg==',
    128: 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAAFklEQVR42u3BMQEAAADCIPuntsROWAQJAAABJzwAAflcJkYAAAAASUVORK5CYII='
  };

  for (const [size, data] of Object.entries(icons)) {
    const iconPath = join(iconsDir, `icon${size}.png`);
    if (!existsSync(iconPath)) {
      console.log(`  Creating placeholder icon${size}.png...`);
      writeFileSync(iconPath, Buffer.from(data, 'base64'));
    }
  }
}

build();
