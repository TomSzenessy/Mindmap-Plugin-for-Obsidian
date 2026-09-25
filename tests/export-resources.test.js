"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const {
  createApprovedPublicHttpsAssetResolver,
  createExportAssetResolver,
  createExportDelivery,
  createExportPlan,
  createRasterExportSession,
  embedDocumentAssets,
  renderHtmlAsVectorPdf,
  safeBaseName,
  serializeXmlSafe
} = require("../lib/export.js");

function streamedResponse(chunks, onCancel = () => {}) {
  let index = 0;
  return {
    ok: true,
    headers: { get: () => null },
    body: {
      getReader: () => ({
        read: async () => index < chunks.length
          ? { done: false, value: new Uint8Array(chunks[index++]) }
          : { done: true },
        cancel: async (reason) => onCancel(reason)
      })
    }
  };
}

function rasterDocument({ failFirst = false } = {}) {
  const canvasSizes = [];
  const revoked = [];
  let imageLoads = 0;
  const ownerDocument = {
    createElement: () => {
      const canvas = {
        getContext: () => ({
          drawImage: () => {},
          fillRect: () => {},
          imageSmoothingEnabled: true,
          imageSmoothingQuality: "high",
          fillStyle: ""
        }),
        toBlob: (callback) => callback({
          size: 2,
          arrayBuffer: async () => new Uint8Array([1, 2]).buffer
        })
      };
      Object.defineProperty(canvas, "width", {
        set(value) {
          canvasSizes[canvasSizes.length - 1][0] = value;
        }
      });
      Object.defineProperty(canvas, "height", {
        set(value) {
          canvasSizes[canvasSizes.length - 1][1] = value;
        }
      });
      canvasSizes.push([0, 0]);
      return canvas;
    }
  };
  const ownerWindow = {
    Blob: class {
      constructor(content, options) {
        this.type = options.type;
      }
    },
    Image: class {
      set src(value) {
        imageLoads += 1;
        queueMicrotask(() => {
          if (failFirst && imageLoads === 1) this.onerror?.();
          else this.onload?.();
        });
      }
    },
    URL: {
      createObjectURL: () => "blob:raster",
      revokeObjectURL: (url) => revoked.push(url)
    }
  };
  ownerDocument.defaultView = ownerWindow;
  return { ownerDocument, ownerWindow, canvasSizes, revoked, get imageLoads() { return imageLoads; } };
}

function xmlNode(tagName, attributes = {}, children = []) {
  const node = {
    tagName: String(tagName).toLowerCase(),
    attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
    childNodes: children,
    parentNode: null,
    ownerDocument: null,
    cloneNode() {
      return xmlNode(
        this.tagName,
        Object.fromEntries(this.attributes.map((attribute) => [attribute.name, attribute.value])),
        this.childNodes.map((child) => child.cloneNode(true))
      );
    },
    querySelectorAll(selector) {
      if (selector !== "*") throw new Error(`Unexpected selector: ${selector}`);
      const descendants = [];
      const visit = (parent) => {
        for (const child of parent.childNodes) {
          descendants.push(child);
          visit(child);
        }
      };
      visit(this);
      return descendants;
    },
    removeAttribute(name) {
      this.attributes = this.attributes.filter((attribute) => attribute.name !== name);
    },
    setAttribute(name, value) {
      const existing = this.attributes.find((attribute) => attribute.name === name);
      if (existing) existing.value = value;
      else this.attributes.push({ name, value });
    },
    remove() {
      if (!this.parentNode) return;
      this.parentNode.childNodes = this.parentNode.childNodes.filter((child) => child !== this);
      this.parentNode = null;
    }
  };
  for (const child of children) child.parentNode = node;
  return node;
}

function xmlSerializer(root) {
  const render = (node) => {
    const attributes = node.attributes.map(({ name, value }) => ` ${name}="${String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`).join("");
    if (["br", "img", "input", "meta", "link"].includes(node.tagName))
      return `<${node.tagName}${attributes}/>`;
    return `<${node.tagName}${attributes}>${node.childNodes.map(render).join("")}</${node.tagName}>`;
  };
  return render(root);
}

test("approved HTTPS asset resolution accepts a public literal address", async () => {
  const resolveAsset = createApprovedPublicHttpsAssetResolver({
    isApproved: () => true,
    fetch: async () => streamedResponse([[8]])
  });

  const bytes = await resolveAsset("https://8.8.8.8/image.png");
  assert.deepEqual([...bytes], [8]);
});

test("approved HTTPS asset resolution rejects loopback before fetch", async () => {
  const requests = [];
  const resolveAsset = createApprovedPublicHttpsAssetResolver({
    isApproved: () => true,
    fetch: async (url, options) => {
      requests.push({ url, options });
      throw new Error("unexpected fetch");
    }
  });

  await assert.rejects(
    resolveAsset("https://127.0.0.1/private.png"),
    /public HTTPS/
  );
  assert.deepEqual(requests, []);
});

test("approved HTTPS asset resolution rejects non-public destinations", async () => {
  let requests = 0;
  const resolveAsset = createApprovedPublicHttpsAssetResolver({
    isApproved: () => true,
    fetch: async () => {
      requests += 1;
      throw new Error("unexpected fetch");
    }
  });

  for (const url of [
    "http://example.com/image.png",
    "https://user:secret@example.com/image.png",
    "https://localhost/image.png",
    "https://service.local/image.png",
    "https://10.0.0.8/image.png",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/image.png",
    "https://[fe80::1]/image.png",
    "https://[fc00::1]/image.png",
    "https://[::ffff:192.168.1.1]/image.png"
  ]) {
    await assert.rejects(resolveAsset(url), /public HTTPS/);
  }
  assert.equal(requests, 0);
});

test("approved HTTPS policy cannot mutate a public URL into a private target", async () => {
  let requests = 0;
  const resolveAsset = createApprovedPublicHttpsAssetResolver({
    isApproved: (url) => {
      url.hostname = "127.0.0.1";
      return true;
    },
    fetch: async () => {
      requests += 1;
      return { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer };
    }
  });

  await assert.rejects(
    resolveAsset("https://assets.example.com/image.png"),
    /public HTTPS/
  );
  assert.equal(requests, 0);
});

test("approved HTTPS asset resolution rejects private DNS answers", async () => {
  let requests = 0;
  const resolveAsset = createApprovedPublicHttpsAssetResolver({
    isApproved: () => true,
    resolveHostname: async (hostname) => {
      assert.equal(hostname, "assets.example.com");
      return ["192.168.1.20", "203.0.113.9"];
    },
    fetch: async () => {
      requests += 1;
      throw new Error("unexpected fetch");
    }
  });

  await assert.rejects(
    resolveAsset("https://assets.example.com/image.png"),
    /public HTTPS/
  );
  assert.equal(requests, 0);
});

test("approved HTTPS asset resolution omits credentials and redirect following", async () => {
  let request;
  const resolveAsset = createApprovedPublicHttpsAssetResolver({
    isApproved: () => true,
    fetch: async (url, options) => {
      request = { url, options };
      return streamedResponse([[1, 2, 3]]);
    }
  });

  const bytes = await resolveAsset("https://assets.example.com/image.png#unused");

  assert.deepEqual([...bytes], [1, 2, 3]);
  assert.equal(request.url, "https://assets.example.com/image.png#unused");
  assert.equal(request.options.credentials, "omit");
  assert.equal(request.options.redirect, "error");
  assert.equal(request.options.referrerPolicy, "no-referrer");
});

test("approved HTTPS asset resolution rejects followed redirects", async () => {
  const resolveAsset = createApprovedPublicHttpsAssetResolver({
    isApproved: () => true,
    fetch: async () => ({
      ok: true,
      redirected: true,
      url: "https://elsewhere.example/image.png",
      arrayBuffer: async () => new Uint8Array([9]).buffer
    })
  });

  await assert.rejects(
    resolveAsset("https://assets.example.com/image.png"),
    /redirect/i
  );
});

test("export base names use the portable filename policy", () => {
  assert.equal(safeBaseName("CON"), "_CON");
  assert.equal(safeBaseName("Map...  "), "Map");
  assert.ok(new TextEncoder().encode(safeBaseName("界".repeat(200))).byteLength <= 255);
});

test("composed export filenames stay within the filesystem byte cap", async () => {
  const writes = [];
  const delivery = createExportDelivery({
    canWriteDownloads: true,
    filesystem: {
      fs: {
        promises: {
          mkdir: async () => {},
          writeFile: async (_output, _content, _options) => writes.push(_output)
        }
      },
      path: { join: (...parts) => parts.join("/"), basename: (value) => value.slice(value.lastIndexOf("/") + 1) },
      directory: "/Downloads"
    }
  });

  const filename = await delivery.deliver({
    baseName: "a".repeat(255),
    suffix: "Whole map",
    extension: "pdf",
    content: new Uint8Array([1])
  });

  assert.ok(new TextEncoder().encode(filename).byteLength <= 255);
  assert.ok(filename.endsWith(" - Whole map.pdf"));
  assert.equal(writes.length, 1);
});

test("approved HTTPS asset resolution aborts a slow peer at its timeout", async () => {
  let requestSignal;
  const resolveAsset = createApprovedPublicHttpsAssetResolver({
    isApproved: () => true,
    timeoutMs: 5,
    fetch: async (url, request) => {
      requestSignal = request.signal;
      return new Promise((resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason));
      });
    }
  });

  await assert.rejects(
    resolveAsset("https://assets.example.com/slow.png"),
    /timed out/i
  );
  assert.equal(requestSignal.aborted, true);
});

test("approved HTTPS asset resolution rejects oversized content before streaming", async () => {
  let reads = 0;
  const resolveAsset = createApprovedPublicHttpsAssetResolver({
    isApproved: () => true,
    maxResourceBytes: 4,
    fetch: async () => ({
      ok: true,
      headers: { get: (name) => name === "content-length" ? "5" : null },
      body: {
        getReader: () => ({
          read: async () => {
            reads += 1;
            return { done: true };
          }
        })
      }
    })
  });

  await assert.rejects(
    resolveAsset("https://assets.example.com/large.png"),
    /resource byte budget/i
  );
  assert.equal(reads, 0);
});

test("approved HTTPS asset resolution stops a streamed resource at its limit", async () => {
  let cancelReason;
  const resolveAsset = createApprovedPublicHttpsAssetResolver({
    isApproved: () => true,
    maxResourceBytes: 4,
    fetch: async () => streamedResponse(
      [[1, 2, 3], [4, 5]],
      (reason) => {
        cancelReason = reason;
      }
    )
  });

  await assert.rejects(
    resolveAsset("https://assets.example.com/large.png"),
    /resource byte budget/i
  );
  assert.match(cancelReason?.message || "", /resource byte budget/i);
});

test("approved HTTPS asset resolution never buffers a non-streaming response", async () => {
  let arrayBufferCalls = 0;
  const resolveAsset = createApprovedPublicHttpsAssetResolver({
    isApproved: () => true,
    fetch: async () => ({
      ok: true,
      headers: { get: () => null },
      body: null,
      arrayBuffer: async () => {
        arrayBufferCalls += 1;
        return new Uint8Array(1024).buffer;
      }
    })
  });

  assert.equal(await resolveAsset("https://assets.example.com/no-stream.png"), null);
  assert.equal(arrayBufferCalls, 0);
});

test("approved HTTPS asset resolution shares one aggregate byte budget", async () => {
  let resource = 0;
  const resolveAsset = createApprovedPublicHttpsAssetResolver({
    isApproved: () => true,
    maxResourceBytes: 4,
    maxTotalBytes: 4,
    fetch: async () => streamedResponse([resource++ === 0 ? [1, 2, 3] : [4, 5]])
  });

  assert.deepEqual(
    [...(await resolveAsset("https://assets.example.com/one.png"))],
    [1, 2, 3]
  );
  await assert.rejects(
    resolveAsset("https://assets.example.com/two.png"),
    /aggregate byte budget/i
  );
});

test("approved HTTPS asset resolution cancels an active response body", async () => {
  const controller = new AbortController();
  let releaseRead;
  let cancelled = false;
  const resolveAsset = createApprovedPublicHttpsAssetResolver({
    isApproved: () => true,
    fetch: async () => ({
      ok: true,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          read: () => new Promise((resolve) => {
            releaseRead = resolve;
          }),
          cancel: async () => {
            cancelled = true;
            releaseRead?.({ done: true });
          }
        })
      }
    })
  });

  const pending = resolveAsset("https://assets.example.com/pending.png", {
    signal: controller.signal
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort(new Error("cancelled by caller"));
  releaseRead?.({ done: true });

  await assert.rejects(pending, /cancelled by caller/);
  assert.equal(cancelled, true);
});

test("export asset resolver reads vault assets by default", async () => {
  const resolver = createExportAssetResolver({
    readVaultFile: async (path) => new Uint8Array([path.length])
  });

  const bytes = await resolver.resolve("/notes/topic.png");
  assert.deepEqual([...bytes], ["notes/topic.png".length]);
});

test("document asset embedding bounds vault resource concurrency", async () => {
  let active = 0;
  let peak = 0;
  const html = [
    '<img src="/one.png">',
    '<img src="/two.png">',
    '<img src="/three.png">',
    '<img src="/four.png">'
  ].join("");
  const embedded = await embedDocumentAssets(html, {
    concurrency: 2,
    readVaultFile: async (path) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return new Uint8Array([path.length]);
    }
  });

  assert.equal(peak, 2);
  assert.equal((embedded.match(/data:image\/png/g) || []).length, 4);
});

test("document asset embedding propagates caller cancellation", async () => {
  const controller = new AbortController();
  let release;
  const pending = embedDocumentAssets('<img src="/slow.png">', {
    signal: controller.signal,
    readVaultFile: () => new Promise((resolve) => {
      release = resolve;
    })
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort(new Error("cancelled by caller"));
  release(new Uint8Array([1]));

  await assert.rejects(pending, /cancelled by caller/);
});

test("document asset embedding never reads file URLs implicitly", async () => {
  const fileUrl = pathToFileURL(path.join(__dirname, "export.test.js")).href;
  const html = `<img src="${fileUrl}">`;

  assert.equal(await embedDocumentAssets(html), html);
});

test("document assets use only the explicit approved HTTPS resolver", async () => {
  let legacyCalls = 0;
  const resolveRemoteAsset = createApprovedPublicHttpsAssetResolver({
    isApproved: (url) => url.hostname === "assets.example.com",
    fetch: async () => streamedResponse([[4, 5, 6, 7]])
  });
  const html = '<img src="https://assets.example.com/image.png">';

  const embedded = await embedDocumentAssets(html, {
    resolveRemoteAsset,
    fetchUrl: async () => {
      legacyCalls += 1;
      return new Uint8Array([9]);
    }
  });

  assert.match(embedded, /src="data:image\/png;base64,BAUGBw=="/);
  assert.equal(legacyCalls, 0);
});

test("document assets share an aggregate vault byte budget", async () => {
  const html = [
    '<img src="/one.png">',
    '<img src="/two.png">',
    '<img src="/three.png">'
  ].join("");
  const embedded = await embedDocumentAssets(html, {
    maxBytes: 4,
    maxTotalBytes: 4,
    concurrency: 1,
    readVaultFile: async () => new Uint8Array([1, 2, 3])
  });

  assert.equal((embedded.match(/data:image\/png/g) || []).length, 1);
  assert.match(embedded, /src="\/two\.png"/);
  assert.match(embedded, /src="\/three\.png"/);
});

test("document assets do not invoke a remote callback for a private HTTPS URL", async () => {
  let calls = 0;
  const html = '<img src="https://127.0.0.1/private.png">';
  const embedded = await embedDocumentAssets(html, {
    resolveRemoteAsset: async () => {
      calls += 1;
      return new Uint8Array([1]);
    }
  });

  assert.equal(embedded, html);
  assert.equal(calls, 0);
});

test("document vault assets reject traversal paths before vault reads", async () => {
  let reads = 0;
  const html = '<img src="app://local/../outside.png">';
  const embedded = await embedDocumentAssets(html, {
    readVaultFile: async () => {
      reads += 1;
      return new Uint8Array([1]);
    }
  });

  assert.equal(embedded, html);
  assert.equal(reads, 0);
});

test("document asset embedding bounds the final markup output", async () => {
  const html = '<img src="data:image/png;base64,AAAA">';
  await assert.rejects(
    embedDocumentAssets(html, { maxOutputBytes: 4 }),
    /output byte budget/i
  );
});

test("explicit file asset readers reject non-local file URLs", async () => {
  let reads = 0;
  const html = '<img src="file://server/share/secret.png">';
  const embedded = await embedDocumentAssets(html, {
    readExternalFile: async () => {
      reads += 1;
      return new Uint8Array([1]);
    }
  });

  assert.equal(embedded, html);
  assert.equal(reads, 0);
});

test("export delivery selects the mobile adapter from explicit capabilities", () => {
  const delivery = createExportDelivery({
    canWriteDownloads: false,
    canDownloadFiles: true,
    browser: { window: {}, document: {} }
  });

  assert.equal(delivery.kind, "browser");
});

test("browser export delivery revokes its object URL after download", async () => {
  const events = [];
  const anchor = {
    download: "",
    href: "",
    click: () => events.push("click"),
    remove: () => events.push("remove")
  };
  const delivery = createExportDelivery({
    canWriteDownloads: false,
    canDownloadFiles: true,
    browser: {
      window: {
        Blob: class {
          constructor(content, options) {
            this.content = content;
            this.type = options.type;
          }
        },
        URL: {
          createObjectURL: (blob) => {
            events.push(`create:${blob.type}`);
            return "blob:export";
          },
          revokeObjectURL: (url) => events.push(`revoke:${url}`)
        }
      },
      document: {
        body: { appendChild: () => events.push("append") },
        createElement: () => anchor
      },
      setTimeout: (callback) => {
        callback();
        return 1;
      }
    }
  });

  const filename = await delivery.deliver({
    baseName: "Roadmap",
    suffix: "Whole map",
    extension: "png",
    content: new Uint8Array([1, 2, 3])
  });

  assert.equal(filename, "Roadmap - Whole map.png");
  assert.equal(anchor.href, "blob:export");
  assert.equal(anchor.download, filename);
  assert.deepEqual(events, [
    "create:image/png",
    "append",
    "click",
    "remove",
    "revoke:blob:export"
  ]);
});

test("filesystem export delivery writes Downloads files without collisions", async () => {
  const writes = [];
  let attempts = 0;
  const fs = {
    promises: {
      mkdir: async (directory) => writes.push(["mkdir", directory]),
      writeFile: async (output, content, options) => {
        attempts += 1;
        writes.push(["write", output, [...content], options]);
        if (attempts === 1) {
          const error = new Error("exists");
          error.code = "EEXIST";
          throw error;
        }
      }
    }
  };
  const delivery = createExportDelivery({
    canWriteDownloads: true,
    canDownloadFiles: true,
    filesystem: {
      fs,
      path: {
        join: (...parts) => parts.join("/"),
        basename: (value) => value.slice(value.lastIndexOf("/") + 1)
      },
      directory: "/Downloads"
    }
  });

  const filename = await delivery.deliver({
    baseName: "Roadmap",
    suffix: "Whole map",
    extension: "pdf",
    content: new Uint8Array([1, 2, 3])
  });

  assert.equal(filename, "Roadmap - Whole map 2.pdf");
  assert.deepEqual(writes, [
    ["mkdir", "/Downloads"],
    ["write", "/Downloads/Roadmap - Whole map.pdf", [1, 2, 3], { flag: "wx" }],
    ["write", "/Downloads/Roadmap - Whole map 2.pdf", [1, 2, 3], { flag: "wx" }]
  ]);
});

test("export delivery enforces the final output budget before side effects", async () => {
  let objectUrls = 0;
  const delivery = createExportDelivery({
    canWriteDownloads: false,
    canDownloadFiles: true,
    maxOutputBytes: 3,
    browser: {
      window: {
        Blob: class {},
        URL: {
          createObjectURL: () => {
            objectUrls += 1;
            return "blob:too-large";
          },
          revokeObjectURL: () => {}
        }
      },
      document: { createElement: () => ({}) }
    }
  });

  await assert.rejects(
    delivery.deliver({
      baseName: "Map",
      suffix: "",
      extension: "txt",
      content: "four"
    }),
    /output byte budget/i
  );
  assert.equal(objectUrls, 0);
});

test("browser export delivery revokes its object URL when activation throws", async () => {
  const revoked = [];
  const anchor = {
    click: () => {
      throw new Error("download activation failed");
    },
    remove: () => {}
  };
  const delivery = createExportDelivery({
    canWriteDownloads: false,
    canDownloadFiles: true,
    browser: {
      window: {
        Blob: class {},
        URL: {
          createObjectURL: () => "blob:failing",
          revokeObjectURL: (url) => revoked.push(url)
        }
      },
      document: {
        body: { appendChild: () => {} },
        createElement: () => anchor
      }
    }
  });

  await assert.rejects(
    delivery.deliver({
      baseName: "Map",
      suffix: "",
      extension: "png",
      content: new Uint8Array([1])
    }),
    /download activation failed/
  );
  assert.deepEqual(revoked, ["blob:failing"]);
});

test("rich and fallback raster paths share one total pixel budget", async () => {
  const host = rasterDocument({ failFirst: true });
  const raster = createRasterExportSession({
    maxPixels: 150,
    maxEstimatedBytes: 10000,
    maxDimension: 100
  });
  const svgInfo = { width: 10, height: 10, svg: "<svg></svg>" };

  await assert.rejects(
    raster.rasterize(svgInfo, host.ownerDocument, "image/png"),
    /render the SVG/
  );
  const fallback = await raster.rasterize(
    svgInfo,
    host.ownerDocument,
    "image/png"
  );
  assert.deepEqual([...fallback], [1, 2]);
  assert.equal(host.canvasSizes.length, 1);
  assert.deepEqual(host.canvasSizes[0], [2, 2]);
  assert.equal(144 + 4 <= 150, true);
  assert.equal(host.imageLoads, 2);
  assert.deepEqual(host.revoked, ["blob:raster", "blob:raster"]);
});

test("raster session fails closed after the pixel budget is exhausted", async () => {
  const host = rasterDocument();
  const raster = createRasterExportSession({
    maxPixels: 4,
    maxEstimatedBytes: 1000,
    maxDimension: 2
  });
  const svgInfo = { width: 2, height: 2, svg: "<svg></svg>" };

  await raster.rasterize(svgInfo, host.ownerDocument, "image/png");
  await assert.rejects(
    raster.rasterize(svgInfo, host.ownerDocument, "image/png"),
    /pixel budget/i
  );
  assert.equal(host.canvasSizes.length, 1);
});

test("raster export enforces its final encoded output budget", async () => {
  const host = rasterDocument();
  const raster = createRasterExportSession({
    maxPixels: 100,
    maxEstimatedBytes: 1000,
    maxDimension: 10,
    maxOutputBytes: 1
  });

  await assert.rejects(
    raster.rasterize({ width: 10, height: 10, svg: "<svg></svg>" }, host.ownerDocument),
    /output byte budget/i
  );
  assert.deepEqual(host.revoked, ["blob:raster"]);
});

test("rich and fallback raster paths share one estimated-byte budget", async () => {
  const host = rasterDocument({ failFirst: true });
  const raster = createRasterExportSession({
    maxPixels: 1000,
    maxEstimatedBytes: 500,
    maxDimension: 10
  });
  const svgInfo = { width: 10, height: 10, svg: "<svg></svg>" };

  await assert.rejects(
    raster.rasterize(svgInfo, host.ownerDocument, "image/png"),
    /render the SVG/
  );
  await assert.rejects(
    raster.rasterize(svgInfo, host.ownerDocument, "image/png"),
    /estimated byte budget/i
  );
  assert.equal(host.imageLoads, 1);
  assert.deepEqual(host.revoked, ["blob:raster"]);
});

test("export XML serialization removes active content and self-closes void elements", () => {
  const root = xmlNode("div", { style: "background:url(https://evil.example/a.png);color:red" }, [
    xmlNode("img", { src: "data:image/png;base64,AAAA", alt: "kept" }),
    xmlNode("img", { src: "https://evil.example/remote.png", onclick: "run()" }),
    xmlNode("br"),
    xmlNode("input", { type: "checkbox", checked: "checked" }),
    xmlNode("a", { href: "https://evil.example/" }),
    xmlNode("script", {}, [xmlNode("span", {}, [xmlNode("span")])])
  ]);
  root.ownerDocument = { defaultView: {} };

  const serialized = serializeXmlSafe(root, {
    XMLSerializer: class {
      serializeToString(node) {
        return xmlSerializer(node);
      }
    }
  });

  assert.match(serialized, /<img src="data:image\/png;base64,AAAA" alt="kept"\/>/);
  assert.match(serialized, /<br\/>/);
  assert.match(serialized, /<input type="checkbox" checked="checked"\/>/);
  assert.doesNotMatch(serialized, /evil\.example|onclick|<script|<a/);
  assert.doesNotMatch(serialized, /url\(https:\/\//);
});

test("export XML style sanitization rejects indirect and escaped network values", () => {
  const root = xmlNode("div", {
    style: [
      "color:blue",
      "background-color:rgb(1, 2, 3)",
      "width:calc(100% - 2px)",
      'background-image:image-set("https://evil.example/pixel.png")',
      "mask:u\\72l(https://evil.example/mask.svg)",
      "cursor:image-set(https://evil.example/cursor.png)"
    ].join(";")
  });
  root.ownerDocument = { defaultView: {} };

  const serialized = serializeXmlSafe(root, {
    XMLSerializer: class {
      serializeToString(node) {
        return xmlSerializer(node);
      }
    }
  });

  assert.doesNotMatch(serialized, /evil\.example|image-set|u\\72l|mask:/i);
  assert.match(serialized, /color:blue/);
  assert.match(serialized, /background-color:rgb\(1, 2, 3\)/);
  assert.match(serialized, /width:calc\(100% - 2px\)/);
});

test("export plan preserves every root and applies endpoint replacements coherently", () => {
  const plan = createExportPlan({
    title: "Nested map",
    nodes: [
      { id: "parent", type: "file", file: "nested.canvas" },
      { id: "sibling", text: "Sibling" },
      { id: "other-root", text: "Other root" },
      { id: "child-a", text: "Child A" },
      { id: "child-b", text: "Child B" }
    ],
    edges: [
      { id: "one", fromNode: "parent", toNode: "sibling" },
      { id: "two", fromNode: "parent", toNode: "missing" }
    ]
  }, {
    replacements: new Map([["parent", ["child-a", "child-b"]]])
  });

  assert.equal(plan.title, "Nested map");
  assert.deepEqual(plan.roots, ["other-root", "child-a", "child-b"]);
  assert.deepEqual(plan.edges.map((edge) => [edge.fromNode, edge.toNode]), [
    ["child-a", "sibling"],
    ["child-b", "sibling"]
  ]);
  assert.equal(plan.topics.some((topic) => topic.id === "parent"), false);
  assert.equal(plan.topics.find((topic) => topic.id === "child-a").text, "Child A");
});

test("export plan preserves distinct authored parallel edges", () => {
  const plan = createExportPlan({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { id: "one", fromNode: "a", toNode: "b", label: "first", color: "#f00" },
      { id: "two", fromNode: "a", toNode: "b", label: "second", lineType: "straight" }
    ]
  });

  assert.equal(plan.edges.length, 2);
  assert.deepEqual(plan.edges.map((edge) => edge.label), ["first", "second"]);
  assert.equal(plan.edges[1].lineType, "straight");
});

test("canonical vector PDF rendering enforces the final output budget", async () => {
  await assert.rejects(
    renderHtmlAsVectorPdf(
      "<svg></svg>",
      { width: 100, height: 100, svg: "<svg></svg>" },
      null,
      {
        maxOutputBytes: 3,
        svgToPdf: async () => new Uint8Array([1, 2, 3, 4])
      }
    ),
    /output byte budget/i
  );
});
