/**
 * Extension Build Script
 *
 * Bundles TypeScript source files for Chrome Extension using esbuild.
 * Creates a clean 'package/' directory that can be loaded in Chrome.
 *
 * Usage:
 *   node build.mjs         # Production build
 *   node build.mjs --watch # Watch mode for development
 */

import * as esbuild from 'esbuild';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

// Package directory - this is what Chrome loads (clean, no test files)
const packageDir = join(__dirname, 'package');
const distDir = join(packageDir, 'dist');

// Clean and recreate package directory
if (existsSync(packageDir)) {
  rmSync(packageDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

// Path alias resolution for @aisc/shared
const sharedPackagePath = join(__dirname, '..', 'packages', 'shared', 'src');

// Common esbuild options
const commonOptions = {
  bundle: true,
  sourcemap: true,
  target: ['chrome120'],
  format: 'esm',
  logLevel: 'info',
  // Resolve @aisc/shared to the local packages/shared/src directory
  alias: {
    '@aisc/shared': sharedPackagePath,
  },
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
  {
    label: 'popup',
    entryPoints: [join(__dirname, 'popup/popup.ts')],
    outfile: join(packageDir, 'popup/popup.js'),
    // Popup scripts should be IIFE format for browser compatibility
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

    // Copy static files to package
    copyStaticFiles();

    console.log('\nBuild complete!');
    console.log(`Package created at: ${packageDir}`);

    if (!isWatch) {
      console.log('\nTo load in Chrome:');
      console.log('  1. Go to chrome://extensions/');
      console.log('  2. Enable "Developer mode"');
      console.log('  3. Click "Load unpacked"');
      console.log('  4. Select the extension/package/ folder');
    }

  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

function copyStaticFiles() {
  console.log('Copying static files to package...');

  // Copy manifest.json
  copyFileSync(
    join(__dirname, 'manifest.json'),
    join(packageDir, 'manifest.json')
  );
  console.log('  Copied manifest.json');

  // Copy popup/ HTML files only (JS is bundled by esbuild)
  const popupSrc = join(__dirname, 'popup');
  const popupDest = join(packageDir, 'popup');
  mkdirSync(popupDest, { recursive: true });
  // Copy only .html files - JS/TS are bundled
  for (const file of readdirSync(popupSrc)) {
    if (file.endsWith('.html')) {
      copyFileSync(join(popupSrc, file), join(popupDest, file));
    }
  }
  console.log('  Copied popup/ HTML files');

  // Ensure icons directory exists and copy/create icons
  const iconsSrc = join(__dirname, 'icons');
  const iconsDest = join(packageDir, 'icons');
  mkdirSync(iconsDest, { recursive: true });

  // Create placeholder icons if source doesn't exist
  if (!existsSync(iconsSrc)) {
    mkdirSync(iconsSrc, { recursive: true });
  }
  createPlaceholderIcons(iconsSrc);

  // Copy icons to package
  copyDirectory(iconsSrc, iconsDest);
  console.log('  Copied icons/');
}

/**
 * Recursively copy a directory
 */
function copyDirectory(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);

    if (statSync(srcPath).isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
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
