'use strict';

const { jsPDF } = require('jspdf');
require('svg2pdf.js');

const MICRONS_PER_POINT = 25400 / 72;

async function renderSvgToPdf(svgInfo, pageSize, ownerDocument, options = {}) {
	if (!ownerDocument?.defaultView?.DOMParser)
		throw new Error('The document SVG parser is unavailable');
	const parser = new ownerDocument.defaultView.DOMParser();
	const parsed = parser.parseFromString(svgInfo.svg, 'image/svg+xml');
	if (parsed.querySelector('parsererror'))
		throw new Error('Could not parse the mind map SVG');
	const svg = ownerDocument.importNode(parsed.documentElement, true);
	// svg2pdf preserves SVG geometry but does not render XHTML foreignObject.
	// Keep the canonical SVG's boxes/paths and reveal its purpose-built vector
	// text layer in place of only that unsupported HTML content.
	for (const foreignObject of svg.querySelectorAll('foreignObject'))
		foreignObject.remove();
	for (const fallback of svg.querySelectorAll('[data-tomindmap-pdf-fallback="true"]'))
		fallback.setAttribute('opacity', '1');
	const width = pageSize.width / MICRONS_PER_POINT;
	const height = pageSize.height / MICRONS_PER_POINT;
	const pdf = new jsPDF({
		orientation: width >= height ? 'landscape' : 'portrait',
		unit: 'pt',
		format: [width, height],
		compress: true,
		putOnlyUsedFonts: true
	});
	await pdf.svg(svg, { x: 0, y: 0, width, height });
	const output = new Uint8Array(pdf.output('arraybuffer'));
	const maxOutputBytes = Number.isFinite(options.maxOutputBytes)
		? Math.max(1, options.maxOutputBytes)
		: 64 * 1024 * 1024;
	if (output.byteLength > maxOutputBytes)
		throw new Error('Vector PDF exceeds the final output byte budget');
	return output;
}

module.exports = { renderSvgToPdf };
