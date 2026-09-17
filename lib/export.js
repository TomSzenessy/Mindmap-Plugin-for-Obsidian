'use strict';

function createExportMindMapModal(Modal) {
	return class ExportMindMapModal extends Modal {
		constructor(app, selectionAvailable, onExport) {
			super(app);
			this.selectionAvailable = selectionAvailable;
			this.onExport = onExport;
		}

		onOpen() {
			const { contentEl } = this;
			contentEl.empty();
			contentEl.createEl('h2', { text: 'Export mind map' });
			contentEl.createEl('p', {
				text: 'Choose a format and the part of the canvas to export.'
			});
			const form = contentEl.createDiv({ cls: 'tomindmap-export-form' });
			const formatLabel = form.createEl('label', { text: 'Format' });
			const format = formatLabel.createEl('select');
			for (const [value, label] of [
				['pdf', 'PDF'],
				['png', 'Image (PNG)'],
				['svg', 'SVG'],
				['markdown', 'Markdown file']
			])
				format.createEl('option', { value, text: label });
			const scopeLabel = form.createEl('label', { text: 'Area' });
			const scope = scopeLabel.createEl('select');
			for (const [value, label] of [
				['whole', 'Whole mind map'],
				['viewport', 'Current viewport'],
				['selection', 'Selection']
			]) {
				const option = scope.createEl('option', { value, text: label });
				if (value === 'selection' && !this.selectionAvailable)
					option.disabled = true;
			}
			const hint = form.createDiv({ cls: 'setting-item-description' });
			const refresh = () => {
				const markdown = format.value === 'markdown';
				const pdf = format.value === 'pdf';
				scope.disabled = markdown;
				if (markdown) scope.value = 'whole';
				hint.setText(
					markdown
						? 'Markdown exports the complete hierarchy without Canvas coordinates.'
						: pdf
							? 'PDF exports the complete area as a vector graphic fitted onto one page.'
							: 'The exported file is saved to your Downloads folder.'
				);
			};
			format.addEventListener('change', refresh);
			refresh();
			const actions = contentEl.createDiv({
				cls: 'modal-button-container'
			});
			const cancel = actions.createEl('button', { text: 'Cancel' });
			const submit = actions.createEl('button', {
				text: 'Export',
				cls: 'mod-cta'
			});
			cancel.addEventListener('click', () => this.close());
			submit.addEventListener('click', () => {
				const request = { format: format.value, scope: scope.value };
				this.close();
				void this.onExport(request);
			});
		}

		onClose() {
			this.contentEl.empty();
		}
	};
}

function vectorPdfPageSize(svgInfo) {
    const aspect = Math.max(0.05, Math.min(20, svgInfo.width / svgInfo.height));
    // Electron custom page sizes use microns. Twelve inches keeps even large
    // maps readable while preserving the exact SVG aspect ratio on one page.
    const longestSide = 304800;
    return aspect >= 1
        ? { width: longestSide, height: longestSide / aspect }
        : { width: longestSide * aspect, height: longestSide };
}

function parseCssColor(value) {
    const source = String(value || '').trim();
    const hex = source.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
    if (hex) {
        const full = hex.length === 3 ? [...hex].map((part) => part + part).join('') : hex;
        return [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16));
    }
    const rgb = source.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    return rgb ? rgb.slice(1, 4).map((part) => Math.max(0, Math.min(255, Number(part)))) : null;
}

function colorDistance(left, right) {
    return Math.sqrt(left.reduce((sum, channel, index) => sum + (channel - right[index]) ** 2, 0));
}

function mixColor(color, target, amount) {
    return color.map((channel, index) => Math.round(channel + (target[index] - channel) * amount));
}

function rgbColor(color) {
    return `rgb(${color.join(', ')})`;
}

/** Ensure Canvas theme colors remain visibly card-shaped in portable SVG/PDF. */
function visibleCardPaint(fill, stroke, background, accent = '') {
    const backdrop = parseCssColor(background) || [255, 255, 255];
    const lightBackdrop = (backdrop[0] * 299 + backdrop[1] * 587 + backdrop[2] * 114) / 1000 > 145;
    const contrastTarget = lightBackdrop ? [0, 0, 0] : [255, 255, 255];
    let paintedFill = parseCssColor(fill);
    if (!paintedFill || colorDistance(paintedFill, backdrop) < 24)
        paintedFill = mixColor(backdrop, contrastTarget, 0.1);
    let paintedStroke = parseCssColor(stroke);
    if (!paintedStroke || colorDistance(paintedStroke, paintedFill) < 120)
        paintedStroke = parseCssColor(accent) || mixColor(backdrop, contrastTarget, 0.42);
    return { fill: rgbColor(paintedFill), stroke: rgbColor(paintedStroke) };
}

/**
 * Keep the complete inline SVG on one custom, aspect-matched PDF page. The
 * scaleMode argument remains for compatibility with older callers/settings;
 * every value now means "fit on one page".
 */
function paginatedPdfDocument(html, svgInfo, scaleMode = 'fit') {
    const mapWidth = Math.max(1, svgInfo.width);
    const mapHeight = Math.max(1, svgInfo.height);
    const pageSize = vectorPdfPageSize(svgInfo);
    return {
        html,
        pageSize,
        pages: 1,
        scale: Math.min(pageSize.width / mapWidth, pageSize.height / mapHeight),
        columns: 1,
        rows: 1
    };
}

/**
 * Ask Chromium to print the inline SVG directly. Unlike the old JPEG-backed
 * PDF path, paths, borders, arrows, and text remain vector primitives.
 * The SVG viewport and the custom PDF page have the same aspect ratio, so the
 * full map is preserved on exactly one page without rasterization.
 */
async function renderHtmlAsVectorPdf(html, svgInfo, electronApi = null, options = {}) {
    const document = options.document || paginatedPdfDocument(html, svgInfo, options.scale ?? 'fit');
    const svgToPdf = options.svgToPdf || (
        typeof renderSvgToPdf === 'function'
            ? renderSvgToPdf
            : require('./vector-pdf-bundle.js').renderSvgToPdf
    );
    return svgToPdf(svgInfo, document.pageSize, options.ownerDocument || globalThis.document);
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

const MEDIA_MIME_BY_EXTENSION = {
    avif: 'image/avif',
    bmp: 'image/bmp',
    gif: 'image/gif',
    ico: 'image/x-icon',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    aac: 'audio/aac',
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    ogv: 'video/ogg',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown'
};

function mimeForUrl(url) {
    const clean = String(url || '').split(/[?#]/, 1)[0];
    const extension = clean.match(/\.([a-z0-9]+)$/i);
    return extension ? MEDIA_MIME_BY_EXTENSION[extension[1].toLowerCase()] || 'application/octet-stream' : 'application/octet-stream';
}

function bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let binary = '';
    const view = new Uint8Array(bytes);
    for (let index = 0; index < view.length; index++)
        binary += String.fromCharCode(view[index]);
    return btoa(binary);
}

function toDataUri(bytes, mime) {
    return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

/**
 * Rewrite media references in an exported document so the standalone PDF, SVG,
 * and PNG show exactly what the canvas showed: Obsidian vault paths
 * (app://local/..., /...), file:// URLs, and remote http(s) resources are
 * inlined as data URIs. Resolvers are injected so this stays testable without
 * an Obsidian runtime.
 */
async function embedDocumentAssets(html, options = {}) {
    const maxBytes = options.maxBytes ?? 12 * 1024 * 1024;
    const cache = new Map();
    const resolve = (url) => {
        if (cache.has(url)) return cache.get(url);
        const pending = (async () => {
            try {
                return await embedUrl(url, options, maxBytes);
            } catch (_) {
                return null;
            }
        })();
        cache.set(url, pending);
        return pending;
    };
    const targets = [];
    const source = String(html || '');
    for (const match of source.matchAll(/<(img|audio|video|source|embed)\b[^>]*?\bsrc="([^"]+)"/gi)) {
        const fullStart = match.index;
        const attrStart = source.indexOf('src="', fullStart);
        targets.push({
            start: attrStart + 5,
            end: attrStart + 5 + match[2].length,
            url: match[2]
        });
    }
    for (const match of source.matchAll(/<video\b[^>]*?\bposter="([^"]+)"/gi)) {
        const attrStart = source.indexOf('poster="', match.index);
        targets.push({
            start: attrStart + 8,
            end: attrStart + 8 + match[1].length,
            url: match[1]
        });
    }
    for (const match of source.matchAll(/\bstyle="([^"]*)"/gi)) {
        const cssStart = match.index + match[0].indexOf(match[1]);
        for (const urlMatch of match[1].matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) {
            const url = urlMatch[2];
            if (/^(data:|blob:|#)/i.test(url)) continue;
            const urlStart = cssStart + urlMatch.index + urlMatch[0].indexOf(url);
            targets.push({ start: urlStart, end: urlStart + url.length, url });
        }
    }
    targets.sort((a, b) => a.start - b.start);
    const embedded = await Promise.all(targets.map((target) => resolve(target.url)));
    let output = source;
    for (let index = targets.length - 1; index >= 0; index--) {
        const dataUri = embedded[index];
        if (!dataUri) continue;
        const target = targets[index];
        output = output.slice(0, target.start) + dataUri + output.slice(target.end);
    }
    return output;
}

async function embedUrl(url, options, maxBytes) {
    if (/^(data:|blob:|about:|javascript:|#)/i.test(url)) return null;
    let bytes = null;
    let mime = mimeForUrl(url);
    if (url.startsWith('app://local/')) {
        const raw = url.slice('app://local/'.length);
        const candidates = [];
        try {
            const decoded = decodeURIComponent(raw);
            candidates.push(decoded.startsWith('/') ? decoded.slice(1) : decoded);
        } catch (_) {
            candidates.push(raw);
        }
        if (
            typeof Buffer !== 'undefined' &&
            /^[A-Za-z0-9+/=]+$/.test(raw) &&
            raw.length % 4 === 0
        ) {
            try {
                candidates.push(Buffer.from(raw, 'base64').toString('utf8'));
            } catch (_) {
                // Not a base64-encoded path; ignore.
            }
        }
        for (const candidate of candidates) {
            const resolved = await options.readVaultFile?.(candidate);
            if (resolved) {
                bytes = resolved;
                break;
            }
        }
    } else if (url.startsWith('file://')) {
        if (options.readExternalFile) {
            bytes = await options.readExternalFile(url);
        } else if (typeof require === 'function') {
            const fs = require('fs');
            const filePath = decodeURIComponent(new URL(url).pathname);
            bytes = await fs.promises.readFile(filePath);
        }
    } else if (/^https?:\/\//i.test(url)) {
        if (options.fetchUrl) bytes = await options.fetchUrl(url);
    } else if (url.startsWith('/')) {
        bytes = await options.readVaultFile?.(url.slice(1));
    }
    if (!bytes) return null;
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (view.length === 0 || view.length > maxBytes) return null;
    return toDataUri(view, mime);
}

async function rasterizeSvg(svgInfo, ownerDocument, type = 'image/png') {
	const ownerWindow = ownerDocument.defaultView || window;
	const maxDimension = 8192;
	const scale = Math.min(
		3,
		maxDimension / Math.max(svgInfo.width, svgInfo.height)
	);
	const width = Math.max(1, Math.round(svgInfo.width * scale));
	const height = Math.max(1, Math.round(svgInfo.height * scale));
	const blob = new Blob([svgInfo.svg], {
		type: 'image/svg+xml;charset=utf-8'
	});
	const url = ownerWindow.URL.createObjectURL(blob);
	try {
		const image = new ownerWindow.Image();
		image.decoding = 'async';
		await new Promise((resolve, reject) => {
			image.onload = resolve;
			image.onerror = () => reject(new Error('Could not render the SVG'));
			image.src = url;
		});
		const bitmap = ownerDocument.createElement('canvas');
		bitmap.width = width;
		bitmap.height = height;
		const context = bitmap.getContext('2d');
		if (!context) throw new Error('Canvas rendering is unavailable');
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = 'high';
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, width, height);
		context.drawImage(image, 0, 0, width, height);
		const encoded = await new Promise((resolve, reject) =>
			bitmap.toBlob(
				(value) =>
					value
						? resolve(value)
						: reject(new Error('Could not encode the image')),
				type,
				type === 'image/jpeg' ? 0.94 : void 0
			)
		);
		return new Uint8Array(await encoded.arrayBuffer());
	} finally {
		ownerWindow.URL.revokeObjectURL(url);
	}
}

function safeBaseName(value) {
	return (
		String(value || 'Mind map')
			.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
			.trim() || 'Mind map'
	);
}

async function saveToDownloads(baseName, suffix, extension, content) {
	const fs = require('fs');
	const path = require('path');
	const os = require('os');
	const downloads = path.join(os.homedir(), 'Downloads');
	await fs.promises.mkdir(downloads, { recursive: true });
	const stem = `${safeBaseName(baseName)}${suffix ? ` - ${suffix}` : ''}`;
	for (let counter = 1; ; counter++) {
		const numberedStem = counter === 1 ? stem : `${stem} ${counter}`;
		const output = path.join(downloads, `${numberedStem}.${extension}`);
		try {
			await fs.promises.writeFile(output, content, { flag: 'wx' });
			return path.basename(output);
		} catch (error) {
			if (error?.code !== 'EEXIST') throw error;
		}
	}
}

module.exports = {
    createExportMindMapModal,
    embedDocumentAssets,
    paginatedPdfDocument,
    rasterizeSvg,
    renderHtmlAsVectorPdf,
    safeBaseName,
    saveToDownloads,
    vectorPdfPageSize,
    visibleCardPaint
};
