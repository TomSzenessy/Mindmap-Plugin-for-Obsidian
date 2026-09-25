'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const puppeteer = require('puppeteer-core');

const root = path.resolve(__dirname, '..');
const vectorEntry = 'lib/vector-pdf-entry.js';
const vectorBundle = 'lib/vector-pdf-bundle.js';
const svgInfo = {
  width: 3000,
  height: 4000,
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 4000"><rect width="3000" height="4000" fill="rgb(41, 41, 41)"/><path d="M1500 2000 C1200 2000 1100 900 750 900 M1500 2000 C1800 2000 1900 3100 2250 3100" fill="none" stroke="#f97316" stroke-width="20"/><g><rect x="1100" y="1800" width="800" height="400" rx="60" fill="rgb(62, 62, 62)" stroke="#f97316" stroke-width="16"/><text data-tomindmap-pdf-fallback="true" opacity="0" x="1500" y="2050" text-anchor="middle" font-family="Helvetica" font-size="120" fill="#ffffff">Root topic</text><foreignObject x="1100" y="1800" width="800" height="400"><div xmlns="http://www.w3.org/1999/xhtml">Root topic</div></foreignObject></g><g><rect x="350" y="700" width="800" height="400" rx="60" fill="rgb(62, 62, 62)" stroke="#ef4444" stroke-width="16"/><text data-tomindmap-pdf-fallback="true" opacity="0" x="750" y="950" text-anchor="middle" font-family="Helvetica" font-size="105" fill="#ffffff">Vector child A</text><foreignObject x="350" y="700" width="800" height="400"><div xmlns="http://www.w3.org/1999/xhtml">Vector child A</div></foreignObject></g><g><rect x="1850" y="2900" width="800" height="400" rx="60" fill="rgb(62, 62, 62)" stroke="#eab308" stroke-width="16"/><text data-tomindmap-pdf-fallback="true" opacity="0" x="2250" y="3150" text-anchor="middle" font-family="Helvetica" font-size="105" fill="#ffffff">Vector child B</text><foreignObject x="1850" y="2900" width="800" height="400"><div xmlns="http://www.w3.org/1999/xhtml">Vector child B</div></foreignObject></g></svg>'
};

function bundleBuildOptions(options = {}) {
  const format = options.format || 'cjs';
  const buildOptions = {
    absWorkingDir: root,
    entryPoints: [vectorEntry],
    bundle: true,
    platform: 'browser',
    format,
    target: 'chrome120',
    outfile: vectorBundle,
    write: false
  };
  if (format === 'iife')
    buildOptions.globalName = options.globalName || 'ToMindMapVectorPdf';
  return buildOptions;
}

async function buildVectorBundle(options = {}) {
  const result = await esbuild.build(bundleBuildOptions(options));
  const output = result.outputFiles && result.outputFiles[0];
  if (!output)
    throw new Error('esbuild did not return an in-memory vector bundle');
  return Buffer.from(output.contents);
}

async function checkVectorBundle(options = {}) {
  const expected = await buildVectorBundle(options);
  const artifactPath = options.artifactPath || path.join(root, vectorBundle);
  const actual = fs.readFileSync(artifactPath);
  return {
    fresh: expected.equals(actual),
    expectedBytes: expected.length,
    actualBytes: actual.length
  };
}

function resolveBrowserExecutable(options = {}) {
  const env = options.env || process.env;
  return env.PUPPETEER_EXECUTABLE_PATH || env.CHROME_PATH || null;
}

async function verifyVectorPdf(options = {}) {
  const client = options.puppeteer || puppeteer;
  const browserBundle = await buildVectorBundle({
    format: 'iife',
    globalName: 'ToMindMapVectorPdf'
  });
  const env = options.env || process.env;
  const executablePath = options.executablePath || resolveBrowserExecutable({ env });
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  };
  if (executablePath)
    launchOptions.executablePath = executablePath;
  else
    launchOptions.channel = options.channel || env.PUPPETEER_CHANNEL || 'chrome';

  const browser = await client.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ content: browserBundle.toString() });
    const bytes = await page.evaluate(async (info) => {
      const result = await globalThis.ToMindMapVectorPdf.renderSvgToPdf(
        info,
        { width: 228600, height: 304800 },
        document
      );
      return Array.from(result);
    }, svgInfo);
    const output = Buffer.from(bytes);
    if (output.subarray(0, 5).toString() !== '%PDF-' || !output.includes(Buffer.from('%%EOF')))
      throw new Error('The real vector converter did not return a valid PDF');
    if (options.outputPath) {
      fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
      fs.writeFileSync(options.outputPath, output);
    }
    return { bytes: output.length, output };
  } finally {
    await browser.close();
  }
}

async function main() {
  if (process.argv.includes('--check')) {
    const result = await checkVectorBundle();
    if (!result.fresh) {
      throw new Error(
        `lib/vector-pdf-bundle.js is out of date (${result.actualBytes} bytes on disk, ${result.expectedBytes} bytes rebuilt)`
      );
    }
    console.log(`lib/vector-pdf-bundle.js is up to date (${result.actualBytes} bytes)`);
    return;
  }

  const result = await verifyVectorPdf({
    outputPath: process.argv.includes('--output')
      ? path.resolve(process.argv[process.argv.indexOf('--output') + 1])
      : null
  });
  console.log(`Real vector converter produced ${result.bytes} PDF bytes`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildVectorBundle,
  checkVectorBundle,
  resolveBrowserExecutable,
  verifyVectorPdf
};
