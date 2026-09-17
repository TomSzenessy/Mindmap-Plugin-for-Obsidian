'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const puppeteer = require('puppeteer-core');

const svgInfo = {
	width: 3000,
	height: 4000,
	svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 4000"><rect width="3000" height="4000" fill="rgb(41, 41, 41)"/><path d="M1500 2000 C1200 2000 1100 900 750 900 M1500 2000 C1800 2000 1900 3100 2250 3100" fill="none" stroke="#f97316" stroke-width="20"/><g><rect x="1100" y="1800" width="800" height="400" rx="60" fill="rgb(62, 62, 62)" stroke="#f97316" stroke-width="16"/><text data-tomindmap-pdf-fallback="true" opacity="0" x="1500" y="2050" text-anchor="middle" font-family="Helvetica" font-size="120" fill="#ffffff">Root topic</text><foreignObject x="1100" y="1800" width="800" height="400"><div xmlns="http://www.w3.org/1999/xhtml">Root topic</div></foreignObject></g><g><rect x="350" y="700" width="800" height="400" rx="60" fill="rgb(62, 62, 62)" stroke="#ef4444" stroke-width="16"/><text data-tomindmap-pdf-fallback="true" opacity="0" x="750" y="950" text-anchor="middle" font-family="Helvetica" font-size="105" fill="#ffffff">Vector child A</text><foreignObject x="350" y="700" width="800" height="400"><div xmlns="http://www.w3.org/1999/xhtml">Vector child A</div></foreignObject></g><g><rect x="1850" y="2900" width="800" height="400" rx="60" fill="rgb(62, 62, 62)" stroke="#eab308" stroke-width="16"/><text data-tomindmap-pdf-fallback="true" opacity="0" x="2250" y="3150" text-anchor="middle" font-family="Helvetica" font-size="105" fill="#ffffff">Vector child B</text><foreignObject x="1850" y="2900" width="800" height="400"><div xmlns="http://www.w3.org/1999/xhtml">Vector child B</div></foreignObject></g></svg>'
};

async function verify() {
	const browserBundle = path.resolve('tmp/pdfs/vector-pdf-browser.js');
	await esbuild.build({
		entryPoints: [path.resolve('lib/vector-pdf-entry.js')],
		bundle: true,
		platform: 'browser',
		format: 'iife',
		globalName: 'ToMindMapVectorPdf',
		target: 'chrome120',
		outfile: browserBundle
	});
	const browser = await puppeteer.launch({
		executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		headless: true
	});
	try {
		const page = await browser.newPage();
		await page.setContent('<!doctype html><html><body></body></html>');
		await page.addScriptTag({ path: browserBundle });
		const bytes = await page.evaluate(async (info) => {
			const result = await ToMindMapVectorPdf.renderSvgToPdf(
				info,
				{ width: 228600, height: 304800 },
				document
			);
			return Array.from(result);
		}, svgInfo);
		const output = path.resolve('output/pdf/tomindmap-one-page-vector-verification.pdf');
		fs.mkdirSync(path.dirname(output), { recursive: true });
		fs.writeFileSync(output, Buffer.from(bytes));
		console.log(`Wrote ${bytes.length} bytes to ${output}`);
	} finally {
		await browser.close();
		fs.rmSync(browserBundle, { force: true });
	}
}

verify().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
