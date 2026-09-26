'use strict';

const { MAX_FILENAME_BYTES, portableFilenameStem } = require('./path-safety.js');
const EXPORT_FILENAME_ENCODER = new TextEncoder();

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
			const nestedLabel = form.createEl('label', {
				cls: 'tomindmap-export-nested-toggle'
			});
			const includeNested = nestedLabel.createEl('input', {
				type: 'checkbox'
			});
			nestedLabel.createSpan({ text: 'Include nested maps' });
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
				if (includeNested.checked) {
					hint.setText(
						'Nested maps are expanded in place before the export is rendered.'
					);
				}
			};
			format.addEventListener('change', refresh);
			includeNested.addEventListener('change', refresh);
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
				const request = {
					format: format.value,
					scope: scope.value,
					includeNestedMaps: includeNested.checked
				};
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
    const output = await svgToPdf(
        svgInfo,
        document.pageSize,
        options.ownerDocument || globalThis.document,
        { maxOutputBytes: options.maxOutputBytes }
    );
    return (() => {
        const maxOutputBytes = Number.isFinite(options.maxOutputBytes)
            ? Math.max(1, options.maxOutputBytes)
            : 64 * 1024 * 1024;
        assertExportOutputWithinBudget(output, maxOutputBytes);
        return output;
    })();
}

function isLocalFileUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return (
            url.protocol === 'file:' &&
            !url.username &&
            !url.password &&
            (!url.hostname || url.hostname === 'localhost')
        );
    } catch (_) {
        return false;
    }
}

function isSafeVaultAssetPath(value) {
    const path = String(value || '');
    if (!path || path.includes('\\') || /[\u0000-\u001F]/.test(path) || path.startsWith('/'))
        return false;
    return !path.split('/').some((segment) => segment === '.' || segment === '..');
}

function publicIpv4Address(hostname) {
    const parts = hostname.split('.');
    if (parts.length < 1 || parts.length > 4) return false;
    const numbers = parts.map((part) => {
        if (/^0x[\da-f]+$/i.test(part)) return Number.parseInt(part.slice(2), 16);
        if (/^0[0-7]+$/.test(part)) return Number.parseInt(part.slice(1), 8);
        if (!/^\d+$/.test(part)) return Number.NaN;
        return Number(part);
    });
    if (numbers.some((part) => !Number.isInteger(part) || part < 0)) return false;
    const last = numbers[numbers.length - 1];
    if (numbers.slice(0, -1).some((part) => part > 255) || last > 0xFFFFFFFF) return false;
    const value = numbers.length === 1
        ? numbers[0]
        : numbers.reduce((address, part, index) =>
            address + part * 256 ** (index === numbers.length - 1 ? 0 : 3 - index), 0);
    const first = Math.floor(value / 0x1000000);
    const second = Math.floor(value / 0x10000) % 0x100;
    const third = Math.floor(value / 0x100) % 0x100;
    return !(
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 0 && third === 0) ||
        (first === 192 && second === 0 && third === 2) ||
        (first === 192 && second === 168) ||
        (first === 198 && (second === 18 || second === 19)) ||
        (first === 198 && second === 51 && third === 100) ||
        (first === 203 && second === 0 && third === 113) ||
        first >= 224
    );
}

function parseIpv6Address(rawHostname) {
    let hostname = rawHostname.replace(/^\[|\]$/g, '').split('%')[0];
    const lastColon = hostname.lastIndexOf(':');
    if (hostname.slice(lastColon + 1).includes('.')) {
        const trailingIpv4 = hostname.slice(lastColon + 1);
        if (!/^\d+(?:\.\d+){1,3}$/.test(trailingIpv4)) return null;
        const octets = trailingIpv4.split('.').map(Number);
        if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
        const high = ((octets[0] << 8) | octets[1]).toString(16);
        const low = ((octets[2] << 8) | octets[3]).toString(16);
        hostname = `${hostname.slice(0, lastColon + 1)}${high}:${low}`;
    }
    if ((hostname.match(/::/g) || []).length > 1) return null;
    const [left, right = ''] = hostname.split('::');
    const leftParts = left ? left.split(':') : [];
    const rightParts = right ? right.split(':') : [];
    if ([...leftParts, ...rightParts].some((part) => !/^[\da-f]{1,4}$/i.test(part))) return null;
    const missing = 8 - leftParts.length - rightParts.length;
    if (missing < 0 || (missing === 0 && hostname.includes('::'))) return null;
    const words = [
        ...leftParts,
        ...Array.from({ length: missing }, () => '0'),
        ...rightParts
    ].map((part) => Number.parseInt(part, 16));
    return words.length === 8 ? words : null;
}

function publicIpv6Address(hostname) {
    const words = parseIpv6Address(hostname);
    if (!words) return false;
    if ((words[0] & 0xe000) !== 0x2000) return false;
    if (words[0] === 0x2001 && words[1] === 0x0db8) return false;
    return true;
}

function isPublicHttpsUrl(url) {
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    if (!hostname) return false;
    if (hostname.includes(':')) return publicIpv6Address(hostname);
    if (/^\d+(?:\.\d+){0,3}$/.test(hostname)) return publicIpv4Address(hostname);
    if (
        !hostname.includes('.') ||
        hostname.split('.').some((label) => !label) ||
        /(^|\.)(?:localhost|local|localdomain|lan|home|internal|intranet|private|test|example|invalid)$/.test(hostname)
    )
        return false;
    return true;
}

async function readBoundedResponseBytes(
    response,
    maxBytes,
    reserveAggregate = () => {},
    signal = null
) {
    const reader = response?.body?.getReader?.();
    if (!reader) return null;
    const chunks = [];
    let length = 0;
    let cancelled = signal?.aborted || false;
    const cancelReader = () => {
        cancelled = true;
        const reason = signal?.reason || new Error('Asset request was cancelled');
        try {
            void Promise.resolve(reader.cancel?.(reason)).catch(() => {});
        } catch (_) {
            // A reader may already be closed; the cancellation flag remains authoritative.
        }
    };
    if (cancelled) cancelReader();
    else signal?.addEventListener('abort', cancelReader, { once: true });
    try {
        while (true) {
            const next = await reader.read();
            if (cancelled || signal?.aborted)
                throw signal?.reason || new Error('Asset request was cancelled');
            if (next?.done) break;
            const value = next?.value instanceof Uint8Array
                ? next.value
                : new Uint8Array(next?.value || []);
            if (length + value.length > maxBytes) {
                const error = new Error('Asset exceeds the resource byte budget');
                try {
                    await reader.cancel?.(error);
                } catch (_) {
                    // The original budget failure remains authoritative.
                }
                throw error;
            }
            try {
                reserveAggregate(value.length);
            } catch (error) {
                try {
                    await reader.cancel?.(error);
                } catch (_) {
                    // The original budget failure remains authoritative.
                }
                throw error;
            }
            chunks.push(value);
            length += value.length;
        }
    } finally {
        signal?.removeEventListener('abort', cancelReader);
        try {
            reader.releaseLock?.();
        } catch (_) {
            // Preserve the resource or budget error that ended the read.
        }
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    return bytes;
}

async function assertPublicDnsAnswers(hostname, resolveHostname) {
    let addresses;
    try {
        addresses = await resolveHostname(hostname);
    } catch (_) {
        throw new Error('Asset URL must be an absolute public HTTPS URL');
    }
    if (
        !Array.isArray(addresses) ||
        addresses.length === 0 ||
        addresses.some((address) => {
            const value = String(address || '');
            return value.includes(':')
                ? !publicIpv6Address(value)
                : !publicIpv4Address(value);
        })
    )
        throw new Error('Asset URL must be an absolute public HTTPS URL');
}

function createApprovedPublicHttpsAssetResolver(options = {}) {
    if (typeof options.isApproved !== 'function')
        throw new TypeError('An explicit HTTPS asset approval policy is required');
    if (typeof options.fetch !== 'function')
        throw new TypeError('An HTTPS fetch capability is required');
    const maxResourceBytes = Number.isFinite(options.maxResourceBytes)
        ? Math.max(1, options.maxResourceBytes)
        : 8 * 1024 * 1024;
    const maxTotalBytes = Number.isFinite(options.maxTotalBytes)
        ? Math.max(1, options.maxTotalBytes)
        : 32 * 1024 * 1024;
    let totalBytes = 0;
    const reserveAggregate = (byteLength) => {
        if (totalBytes + byteLength > maxTotalBytes)
            throw new Error('Assets exceed the aggregate byte budget');
        totalBytes += byteLength;
    };

    return async function resolveApprovedPublicHttpsAsset(rawUrl, requestOptions = {}) {
        let url;
        try {
            url = new URL(String(rawUrl || ''));
        } catch (_) {
            throw new Error('Asset URL must be an absolute public HTTPS URL');
        }
        if (!isPublicHttpsUrl(url))
            throw new Error('Asset URL must be an absolute public HTTPS URL');
        if (typeof options.resolveHostname === 'function')
            await assertPublicDnsAnswers(
                url.hostname.replace(/^\[|\]$/g, ''),
                options.resolveHostname
            );
        const originalHref = url.href;
        const approvalUrl = new URL(url.href);
        if (!(await options.isApproved(approvalUrl)))
            throw new Error('Asset URL is not approved for export');
        if (!isPublicHttpsUrl(approvalUrl))
            throw new Error('Asset URL must be an absolute public HTTPS URL');
        if (typeof options.resolveHostname === 'function' && approvalUrl.href !== originalHref)
            await assertPublicDnsAnswers(
                approvalUrl.hostname.replace(/^\[|\]$/g, ''),
                options.resolveHostname
            );
        url = approvalUrl;
        const controller = new AbortController();
        const callerSignal = requestOptions.signal;
        let timedOut = false;
        const abortFromCaller = () => controller.abort(callerSignal.reason);
        if (callerSignal?.aborted) abortFromCaller();
        else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
        const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, options.timeoutMs) : 10000;
        const timeout = setTimeout(() => {
            timedOut = true;
            controller.abort(new Error('Asset request timed out'));
        }, timeoutMs);
        if (callerSignal?.aborted) {
            clearTimeout(timeout);
            throw callerSignal.reason || new Error('Asset request was cancelled');
        }
        try {
            const response = await options.fetch(url.href, {
                credentials: 'omit',
                redirect: 'error',
                referrerPolicy: 'no-referrer',
                signal: controller.signal
            });
            const responseUrl = response?.url
                ? new URL(response.url)
                : null;
            if (
                response?.redirected ||
                response?.type === 'opaqueredirect' ||
                (Number.isInteger(response?.status) && response.status >= 300 && response.status < 400) ||
                (responseUrl && responseUrl.href.replace(/#.*$/, '') !== url.href.replace(/#.*$/, ''))
            )
                throw new Error('Asset HTTPS redirects are not allowed');
            if (!response?.ok) return null;
            const declaredBytes = Number(response.headers?.get?.('content-length'));
            if (Number.isFinite(declaredBytes) && declaredBytes > maxResourceBytes)
                throw new Error('Asset exceeds the resource byte budget');
            if (Number.isFinite(declaredBytes) && totalBytes + declaredBytes > maxTotalBytes)
                throw new Error('Assets exceed the aggregate byte budget');
            return await readBoundedResponseBytes(
                response,
                maxResourceBytes,
                reserveAggregate,
                controller.signal
            );
        } catch (error) {
            if (timedOut) throw new Error('Asset request timed out');
            if (callerSignal?.aborted)
                throw callerSignal.reason || new Error('Asset request was cancelled');
            throw error;
        } finally {
            clearTimeout(timeout);
            callerSignal?.removeEventListener('abort', abortFromCaller);
        }
    };
}

const EXPORT_UNSAFE_ELEMENTS = new Set([
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'link',
    'base',
    'form'
]);
const EXPORT_RESOURCE_ATTRIBUTES = new Set([
    'src',
    'poster',
    'href',
    'xlink:href',
    'background',
    'action',
    'formaction',
    'cite',
    'srcset',
    'imagesrcset'
]);

function exportDataUrlIsSafe(value) {
    const source = String(value || '').trim();
    if (/^data:image\/svg\+xml(?:;|,)/i.test(source)) return false;
    return /^data:(?:image\/(?:avif|bmp|gif|jpe?g|png|webp)|audio\/|video\/|application\/pdf)(?:[;,])/i.test(source);
}

function exportUrlIsSafe(value) {
    const source = String(value || '').trim();
    return source.startsWith('#') || exportDataUrlIsSafe(source);
}

const EXPORT_SAFE_STYLE_PROPERTIES = new Set([
    'display', 'position', 'inset', 'top', 'right', 'bottom', 'left',
    'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
    'box-sizing', 'overflow', 'overflow-x', 'overflow-y', 'visibility',
    'opacity', 'z-index', 'isolation', 'mix-blend-mode', 'pointer-events',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
    'border-width', 'border-style', 'border-color',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-radius', 'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-left-radius', 'border-bottom-right-radius',
    'outline', 'outline-color', 'outline-style', 'outline-width', 'outline-offset',
    'flex', 'flex-basis', 'flex-direction', 'flex-flow', 'flex-grow', 'flex-shrink',
    'flex-wrap', 'order', 'align-items', 'align-self', 'align-content',
    'justify-content', 'justify-items', 'justify-self', 'place-content', 'place-items', 'place-self',
    'grid', 'grid-area', 'grid-auto-columns', 'grid-auto-flow', 'grid-auto-rows',
    'grid-column', 'grid-row', 'grid-template', 'grid-template-areas',
    'grid-template-columns', 'grid-template-rows', 'gap', 'row-gap', 'column-gap',
    'color', 'background-color', 'fill', 'stroke', 'stroke-width',
    'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
    'stroke-dashoffset', 'vector-effect', 'shape-rendering', 'paint-order',
    'font', 'font-family', 'font-size', 'font-style', 'font-variant',
    'font-weight', 'font-stretch', 'line-height', 'letter-spacing', 'word-spacing',
    'text-align', 'text-decoration', 'text-decoration-color', 'text-decoration-line',
    'text-decoration-style', 'text-indent', 'text-overflow', 'text-transform',
    'vertical-align', 'white-space', 'word-break', 'overflow-wrap',
    'list-style-position', 'list-style-type', 'transform', 'transform-origin',
    'transform-box', 'unicode-bidi', 'direction'
]);
const EXPORT_NETWORK_STYLE_VALUE = /(?:\\|@import|expression\s*\(|url\s*\(|image-set\s*\(|cross-fade\s*\(|element\s*\(|paint\s*\(|https?:|file:|data:|blob:|javascript:|app:)/i;

function splitStyleDeclarations(value) {
    const declarations = [];
    let start = 0;
    let quote = '';
    let depth = 0;
    const source = String(value || '');
    for (let index = 0; index < source.length; index++) {
        const character = source[index];
        if (quote) {
            if (character === quote) quote = '';
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === '(') depth += 1;
        else if (character === ')' && depth > 0) depth -= 1;
        else if (character === ';' && depth === 0) {
            declarations.push(source.slice(start, index));
            start = index + 1;
        }
    }
    declarations.push(source.slice(start));
    return declarations;
}

function sanitizeExportStyle(value) {
    const safe = [];
    for (const declaration of splitStyleDeclarations(value)) {
        const colon = declaration.indexOf(':');
        if (colon <= 0) continue;
        const property = declaration.slice(0, colon).trim().toLowerCase();
        const propertyValue = declaration.slice(colon + 1).trim();
        if (!propertyValue || !EXPORT_SAFE_STYLE_PROPERTIES.has(property)) continue;
        if (EXPORT_NETWORK_STYLE_VALUE.test(propertyValue)) continue;
        safe.push(`${property}:${propertyValue}`);
    }
    return safe.join(';');
}

function sanitizeExportElement(element, options = {}) {
    if (!element?.cloneNode) throw new TypeError('An export DOM element is required');
    if (EXPORT_UNSAFE_ELEMENTS.has(String(element.tagName || '').toLowerCase()))
        throw new Error('Unsafe root element cannot be serialized for export');
    const clone = element.cloneNode(true);
    const elements = [clone, ...(clone.querySelectorAll?.('*') || [])];
    for (const current of elements) {
        const tagName = String(current.tagName || '').toLowerCase();
        if (EXPORT_UNSAFE_ELEMENTS.has(tagName)) {
            current.remove?.();
            continue;
        }
        for (const attribute of [...(current.attributes || [])]) {
            const name = String(attribute.name || '').toLowerCase();
            const value = String(attribute.value || '');
            if (
                /^on/i.test(name) ||
                name === 'srcdoc' ||
                name === 'ping' ||
                name === 'nonce' ||
                name === 'action' ||
                name === 'formaction'
            ) {
                current.removeAttribute?.(attribute.name);
                continue;
            }
            if (EXPORT_RESOURCE_ATTRIBUTES.has(name) && !exportUrlIsSafe(value)) {
                current.removeAttribute?.(attribute.name);
                if (tagName === 'a') current.remove?.();
                continue;
            }
            if (name === 'style')
                current.setAttribute?.(attribute.name, sanitizeExportStyle(value));
        }
    }
    return clone;
}

function serializeXmlSafe(element, options = {}) {
    const clone = sanitizeExportElement(element, options);
    const ownerDocument = options.document || element.ownerDocument || globalThis.document;
    const ownerWindow = ownerDocument?.defaultView || globalThis;
    const XMLSerializerConstructor =
        options.XMLSerializer || ownerWindow?.XMLSerializer || globalThis.XMLSerializer;
    if (typeof XMLSerializerConstructor !== 'function')
        throw new Error('XML serialization is unavailable');
    const serialized = new XMLSerializerConstructor().serializeToString(clone);
    if (typeof serialized !== 'string') throw new Error('XML serialization returned no markup');
    return serialized;
}

function exportCollection(value) {
    if (value instanceof Map) return Array.from(value.values());
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [];
}

function createExportPlan(snapshot = {}, options = {}) {
    const source = snapshot?.data && typeof snapshot.data === 'object'
        ? snapshot.data
        : snapshot;
    const replacementInput = options.replacements || {};
    const replacements = new Map();
    const replacementEntries = replacementInput instanceof Map
        ? Array.from(replacementInput.entries())
        : Object.entries(replacementInput);
    for (const [key, value] of replacementEntries)
        replacements.set(String(key), value);
    const sourceTopics = exportCollection(source.nodes ?? source.topics);
    const topicIds = new Set();
    const topics = [];
    for (const topic of sourceTopics) {
        if (!topic || topic.id === undefined || topic.id === null)
            throw new Error('Export plan topics must have stable IDs');
        const id = String(topic.id);
        if (topicIds.has(id)) throw new Error('Export plan topic IDs must be unique');
        topicIds.add(id);
        if (!replacements.has(id)) topics.push({ ...topic, id });
    }
    const includedIds = new Set(topics.map((topic) => topic.id));
    const expandEndpoint = (value) => {
        const id = String(value ?? '');
        const replacement = replacements.get(id);
        if (Array.isArray(replacement)) return replacement.map(String);
        if (replacement !== undefined) return [String(replacement)];
        return [id];
    };
    const edges = [];
    const edgeKeys = new Set();
    for (const [sourceIndex, sourceEdge] of exportCollection(source.edges).entries()) {
        if (!sourceEdge) continue;
        const fromValues = expandEndpoint(sourceEdge.fromNode ?? sourceEdge.from);
        const toValues = expandEndpoint(sourceEdge.toNode ?? sourceEdge.to);
        for (const fromNode of fromValues) {
            for (const toNode of toValues) {
                if (!includedIds.has(fromNode) || !includedIds.has(toNode)) {
                    if (options.strictEdges)
                        throw new Error('Export edge endpoint is not present in the plan');
                    continue;
                }
                const key = `${sourceIndex}\u0000${fromNode}\u0000${toNode}`;
                if (edgeKeys.has(key)) continue;
                edgeKeys.add(key);
                edges.push({ ...sourceEdge, fromNode, toNode });
            }
        }
    }
    const connected = new Set(edges.map((edge) => edge.toNode));
    return {
        title: String(snapshot.title || source.title || 'Mind map'),
        format: snapshot.format || source.format || options.format || 'svg',
        scope: snapshot.scope || source.scope || options.scope || 'whole',
        includeNestedMaps: Boolean(
            snapshot.includeNestedMaps ?? source.includeNestedMaps ?? options.includeNestedMaps ?? false
        ),
        topics,
        nodes: topics,
        edges,
        roots: topics.filter((topic) => !connected.has(topic.id)).map((topic) => topic.id)
    };
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

function throwIfExportCancelled(signal) {
    if (signal?.aborted)
        throw signal.reason || new Error('Export asset request was cancelled');
}

async function mapExportAssetsWithConcurrency(items, concurrency, resolveAsset) {
    const results = new Array(items.length);
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await resolveAsset(items[index], index);
        }
    };
    const workerCount = Math.min(items.length, concurrency);
    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
}

/**
 * Rewrite media references in an exported document so the standalone PDF, SVG,
 * and PNG show exactly what the canvas showed: Obsidian vault paths
 * (app://local/..., /...), explicitly approved local file resources, and
 * explicitly approved public HTTPS resources are inlined as data URIs.
 * Resolvers are injected so this stays testable without an Obsidian runtime.
 */
async function embedDocumentAssets(html, options = {}) {
    throwIfExportCancelled(options.signal);
    const maxBytes = Number.isFinite(options.maxBytes)
        ? Math.max(1, options.maxBytes)
        : 12 * 1024 * 1024;
    const maxTotalBytes = Number.isFinite(options.maxTotalBytes)
        ? Math.max(1, options.maxTotalBytes)
        : 32 * 1024 * 1024;
    const maxOutputBytes = Number.isFinite(options.maxOutputBytes)
        ? Math.max(1, options.maxOutputBytes)
        : 64 * 1024 * 1024;
    const assetResolver = options.assetResolver || createExportAssetResolver({
        ...options,
        maxResourceBytes: maxBytes,
        maxTotalBytes
    });
    if (typeof assetResolver?.resolve !== 'function')
        throw new TypeError('An export asset resolver capability is required');
    const concurrency = Number.isFinite(options.concurrency)
        ? Math.max(1, Math.floor(options.concurrency))
        : 4;
    const cache = new Map();
    const resolve = (url) => {
        if (cache.has(url)) return cache.get(url);
        const pending = (async () => {
            try {
                throwIfExportCancelled(options.signal);
                const bytes = await assetResolver.resolve(url, { signal: options.signal });
                throwIfExportCancelled(options.signal);
                if (!bytes) return null;
                const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
                if (view.length === 0 || view.length > maxBytes) return null;
                const mime = mimeForUrl(url);
                if (mime === "image/svg+xml") return null;
                return toDataUri(view, mime);
            } catch (error) {
                if (options.signal?.aborted)
                    throw options.signal.reason || error;
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
    const embedded = await mapExportAssetsWithConcurrency(
        targets,
        concurrency,
        (target) => resolve(target.url)
    );
    let output = source;
    for (let index = targets.length - 1; index >= 0; index--) {
        const dataUri = embedded[index];
        if (!dataUri) continue;
        const target = targets[index];
        output = output.slice(0, target.start) + dataUri + output.slice(target.end);
    }
    assertExportOutputWithinBudget(output, maxOutputBytes);
    return output;
}

async function readExportAssetBytes(url, options = {}) {
    throwIfExportCancelled(options.signal);
    if (/^(data:|blob:|about:|javascript:|#)/i.test(url)) return null;
    let bytes = null;
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
            if (!isSafeVaultAssetPath(candidate)) continue;
            const resolved = await options.readVaultFile?.(candidate);
            throwIfExportCancelled(options.signal);
            if (resolved) {
                bytes = resolved;
                break;
            }
        }
    } else if (url.startsWith('file://')) {
        if (options.readExternalFile && isLocalFileUrl(url))
            bytes = await options.readExternalFile(url);
    } else if (/^https:\/\//i.test(url)) {
        let publicUrl;
        try {
            publicUrl = new URL(url);
        } catch (_) {
            return null;
        }
        if (!isPublicHttpsUrl(publicUrl)) return null;
        if (options.resolveRemoteAsset)
            bytes = await options.resolveRemoteAsset(url, { signal: options.signal });
    } else if (url.startsWith('/')) {
        const vaultPath = url.slice(1);
        if (isSafeVaultAssetPath(vaultPath))
            bytes = await options.readVaultFile?.(vaultPath);
    }
    if (!bytes) return null;
    throwIfExportCancelled(options.signal);
    return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function createExportAssetResolver(options = {}) {
    const maxResourceBytes = Number.isFinite(options.maxResourceBytes)
        ? Math.max(1, options.maxResourceBytes)
        : 12 * 1024 * 1024;
    const maxTotalBytes = Number.isFinite(options.maxTotalBytes)
        ? Math.max(1, options.maxTotalBytes)
        : 32 * 1024 * 1024;
    let totalBytes = 0;
    const reserve = (byteLength) => {
        if (totalBytes + byteLength > maxTotalBytes)
            throw new Error('Assets exceed the aggregate byte budget');
        totalBytes += byteLength;
    };
    return Object.freeze({
        async resolve(url, requestOptions = {}) {
            const context = {
                ...options,
                signal: requestOptions.signal ?? options.signal
            };
            const bytes = await readExportAssetBytes(url, context);
            if (!bytes) return null;
            if (bytes.length === 0 || bytes.length > maxResourceBytes) return null;
            reserve(bytes.length);
            return bytes;
        }
    });
}

async function renderRasterPlan(svgInfo, ownerDocument, type, plan) {
    const ownerWindow = ownerDocument?.defaultView || globalThis.window;
    const BlobConstructor = ownerWindow?.Blob || globalThis.Blob;
    if (
        typeof ownerWindow?.Image !== 'function' ||
        typeof ownerWindow?.URL?.createObjectURL !== 'function' ||
        typeof ownerWindow?.URL?.revokeObjectURL !== 'function' ||
        typeof BlobConstructor !== 'function'
    )
        throw new Error('Image raster export capability is unavailable');
    const blob = new BlobConstructor([svgInfo.svg], {
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
        bitmap.width = plan.width;
        bitmap.height = plan.height;
        const context = bitmap.getContext('2d');
        if (!context) throw new Error('Canvas rendering is unavailable');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, plan.width, plan.height);
        context.drawImage(image, 0, 0, plan.width, plan.height);
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
        const output = new Uint8Array(await encoded.arrayBuffer());
        if (output.byteLength > plan.maxOutputBytes)
            throw new Error('Raster export exceeds the final output byte budget');
        return output;
    } finally {
        ownerWindow.URL.revokeObjectURL(url);
    }
}

function createRasterExportSession(options = {}) {
    const maxPixels = Number.isFinite(options.maxPixels)
        ? Math.max(1, Math.floor(options.maxPixels))
        : 16 * 1024 * 1024;
    const maxEstimatedBytes = Number.isFinite(options.maxEstimatedBytes)
        ? Math.max(1, options.maxEstimatedBytes)
        : 96 * 1024 * 1024;
    const maxDimension = Number.isFinite(options.maxDimension)
        ? Math.max(1, options.maxDimension)
        : 8192;
    const bytesPerPixel = Number.isFinite(options.bytesPerPixel)
        ? Math.max(1, options.bytesPerPixel)
        : 4;
    const maxOutputBytes = Number.isFinite(options.maxOutputBytes)
        ? Math.max(1, options.maxOutputBytes)
        : 64 * 1024 * 1024;
    let totalPixels = 0;
    let totalEstimatedBytes = 0;

    async function rasterize(svgInfo, ownerDocument, type = 'image/png') {
        const sourceWidth = Number(svgInfo?.width);
        const sourceHeight = Number(svgInfo?.height);
        if (
            !Number.isFinite(sourceWidth) ||
            !Number.isFinite(sourceHeight) ||
            sourceWidth <= 0 ||
            sourceHeight <= 0
        )
            throw new Error('SVG raster dimensions are invalid');
        const sourcePixels = sourceWidth * sourceHeight;
        const remainingPixels = maxPixels - totalPixels;
        const scale = Math.min(
            3,
            maxDimension / Math.max(sourceWidth, sourceHeight),
            Math.sqrt(remainingPixels / sourcePixels)
        );
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const pixels = width * height;
        const estimatedBytes =
            pixels * bytesPerPixel +
            new TextEncoder().encode(String(svgInfo?.svg || '')).byteLength;
        if (totalPixels + pixels > maxPixels)
            throw new Error('Raster export exceeds the total pixel budget');
        if (totalEstimatedBytes + estimatedBytes > maxEstimatedBytes)
            throw new Error('Raster export exceeds the estimated byte budget');
        totalPixels += pixels;
        totalEstimatedBytes += estimatedBytes;
        return renderRasterPlan(svgInfo, ownerDocument, type, {
            width,
            height,
            pixels,
            estimatedBytes,
            maxOutputBytes
        });
    }

    return Object.freeze({ rasterize });
}

async function rasterizeSvg(svgInfo, ownerDocument, type = 'image/png', options = {}) {
    const session = options.session || createRasterExportSession(options);
    return session.rasterize(svgInfo, ownerDocument, type);
}

function safeBaseName(value) {
	const source = String(value || '').trim();
	return portableFilenameStem(source || 'Mind map');
}

function safeExportExtension(value) {
    return String(value || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32) || 'bin';
}

function exportFileName(baseName, suffix, extension, reservedBytes = 0) {
    const safeSuffix = suffix ? ` - ${safeBaseName(suffix)}` : '';
    const safeExtension = safeExportExtension(extension);
    const filenameBudget = Math.max(1, MAX_FILENAME_BYTES - Math.max(0, reservedBytes));
    const fixedBytes = EXPORT_FILENAME_ENCODER.encode(`${safeSuffix}.${safeExtension}`).length;
    const baseBudget = filenameBudget - fixedBytes;
    if (baseBudget < 1) {
        const extensionOnlyBudget = filenameBudget - EXPORT_FILENAME_ENCODER.encode(`.${safeExtension}`).length;
        return `${portableFilenameStem(safeBaseName(baseName), Math.max(1, extensionOnlyBudget))}.${safeExtension}`;
    }
    return `${portableFilenameStem(safeBaseName(baseName), baseBudget)}${safeSuffix}.${safeExtension}`;
}

function exportContentByteLength(content) {
    if (typeof content === 'string')
        return new TextEncoder().encode(content).byteLength;
    if (content instanceof ArrayBuffer)
        return content.byteLength;
    if (ArrayBuffer.isView(content))
        return content.byteLength;
    if (Number.isFinite(content?.size)) return content.size;
    if (Number.isFinite(content?.byteLength)) return content.byteLength;
    return new TextEncoder().encode(String(content ?? '')).byteLength;
}

function assertExportOutputWithinBudget(content, maxOutputBytes) {
    const byteLength = exportContentByteLength(content);
    const limit = Number.isFinite(maxOutputBytes)
        ? Math.max(1, maxOutputBytes)
        : 64 * 1024 * 1024;
    if (byteLength > limit)
        throw new Error('Export exceeds the final output byte budget');
    return byteLength;
}

function createBrowserExportDelivery(browser, maxOutputBytes = 64 * 1024 * 1024) {
    return {
        kind: 'browser',
        async deliver(request) {
            assertExportOutputWithinBudget(request.content, maxOutputBytes);
            const ownerWindow = browser?.window;
            const ownerDocument = browser?.document || ownerWindow?.document;
            if (
                typeof ownerWindow?.Blob !== 'function' ||
                typeof ownerWindow?.URL?.createObjectURL !== 'function' ||
                typeof ownerWindow?.URL?.revokeObjectURL !== 'function' ||
                typeof ownerDocument?.createElement !== 'function' ||
                typeof ownerDocument?.body?.appendChild !== 'function'
            )
                throw new Error('Browser export download capability is unavailable');
            const fileName = exportFileName(
                request.baseName,
                request.suffix,
                request.extension
            );
            const blob = new ownerWindow.Blob([request.content], {
                type: mimeForUrl(fileName)
            });
            const url = ownerWindow.URL.createObjectURL(blob);
            let revoked = false;
            let revocationScheduled = false;
            const revoke = () => {
                if (revoked) return;
                revoked = true;
                ownerWindow.URL.revokeObjectURL(url);
            };
            try {
                const anchor = ownerDocument.createElement('a');
                anchor.href = url;
                anchor.download = fileName;
                anchor.rel = 'noopener';
                ownerDocument.body.appendChild(anchor);
                try {
                    anchor.click();
                } finally {
                    try {
                        anchor.remove();
                    } catch (_) {
                        // Keep the download/activation error as the primary failure.
                    }
                }
                (browser.setTimeout || setTimeout)(revoke, 10000);
                revocationScheduled = true;
                return fileName;
            } finally {
                if (!revocationScheduled) revoke();
            }
        }
    };
}

function createFilesystemExportDelivery(
    filesystem,
    maxOutputBytes = 64 * 1024 * 1024
) {
    const fs = filesystem?.fs;
    const path = filesystem?.path;
    if (
        typeof fs?.promises?.mkdir !== 'function' ||
        typeof fs?.promises?.writeFile !== 'function' ||
        typeof path?.join !== 'function' ||
        typeof path?.basename !== 'function' ||
        !filesystem?.directory
    )
        throw new Error('Filesystem export delivery capability is unavailable');
    return {
        kind: 'filesystem',
        async deliver(request) {
            assertExportOutputWithinBudget(request.content, maxOutputBytes);
            const extension = safeExportExtension(request.extension);
            const firstName = exportFileName(
                request.baseName,
                request.suffix,
                extension,
                6
            );
            const stem = firstName.slice(0, -(extension.length + 1));
            await fs.promises.mkdir(filesystem.directory, { recursive: true });
            for (let counter = 1; counter <= 10000; counter++) {
                const numberedStem = counter === 1 ? stem : `${stem} ${counter}`;
                const fileName = `${numberedStem}.${extension}`;
                const output = path.join(filesystem.directory, fileName);
                try {
                    await fs.promises.writeFile(output, request.content, { flag: 'wx' });
                    return path.basename(output);
                } catch (error) {
                    if (error?.code !== 'EEXIST') throw error;
                }
            }
            throw new Error('Could not allocate an export filename');
        }
    };
}

function createExportDelivery(capabilities = {}) {
    const maxOutputBytes = Number.isFinite(capabilities.maxOutputBytes)
        ? Math.max(1, capabilities.maxOutputBytes)
        : 64 * 1024 * 1024;
    if (capabilities.canWriteDownloads === true)
        return createFilesystemExportDelivery(capabilities.filesystem, maxOutputBytes);
    if (capabilities.canDownloadFiles === true)
        return createBrowserExportDelivery(capabilities.browser, maxOutputBytes);
    throw new Error('No supported export delivery capability is available');
}

async function saveToDownloads(baseName, suffix, extension, content, capabilities = {}) {
    return createExportDelivery(capabilities).deliver({
        baseName,
        suffix,
        extension,
        content
    });
}

module.exports = {
    colorDistance,
    createApprovedPublicHttpsAssetResolver,
    createBrowserExportDelivery,
    createExportAssetResolver,
    createExportDelivery,
    createFilesystemExportDelivery,
    createExportMindMapModal,
    createExportPlan,
    createRasterExportSession,
    embedDocumentAssets,
    paginatedPdfDocument,
    parseCssColor,
    rasterizeSvg,
    renderHtmlAsVectorPdf,
    safeBaseName,
    sanitizeExportElement,
    saveToDownloads,
    serializeXmlSafe,
    vectorPdfPageSize,
    visibleCardPaint
};
