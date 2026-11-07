/* Shared helpers: DOM/SVG building, Python-like value formatting, seeded randomness, syntax highlighting.
 * Touches no DOM at load time, so tools/check.js can load it in Node. */
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  /* ---------- DOM ---------- */

  /**
   * Creates an HTML element.
   * @param {string} tag
   * @param {object} [attrs]  class, text, html, style (object), on<Event> (function), any other attribute
   * @param {Array|Node|string} [children]
   */
  function h(tag, attrs, children) {
    return build(document.createElement(tag), attrs, children);
  }

  /** Creates an SVG element; same as h(), in the SVG namespace. */
  function s(tag, attrs, children) {
    return build(document.createElementNS(SVG_NS, tag), attrs, children);
  }

  function build(node, attrs, children) {
    if (attrs) setAttrs(node, attrs);
    if (children != null) {
      for (const child of [].concat(children)) {
        if (child == null || child === false) continue;
        node.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
      }
    }
    return node;
  }

  /** Updates attributes; understands the same keys as h(). */
  function setAttrs(node, attrs) {
    for (const key in attrs) {
      const value = attrs[key];
      if (value === undefined) continue;
      if (key === "class") node.setAttribute("class", value);
      else if (key === "text") node.textContent = value;
      else if (key === "html") node.innerHTML = value;
      else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value === null || value === false) node.removeAttribute(key);
      else node.setAttribute(key, value === true ? "" : value);
    }
    return node;
  }

  /** The stage's persistent <svg>, sized to the stage (1 unit = 1 px). */
  function ensureSvg(stage) {
    let svg = stage.querySelector(":scope > svg.stage-svg");
    if (!svg) {
      svg = s("svg", { class: "stage-svg" });
      stage.appendChild(svg);
    }
    const width = stage.clientWidth || 600;
    const height = stage.clientHeight || 400;
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    return svg;
  }

  /** A named layer (<g> in SVG, <div> in HTML); creation order is the z-order. */
  function layer(parent, name) {
    let group = parent.querySelector(`:scope > [data-layer="${name}"]`);
    if (!group) {
      group = parent instanceof SVGElement ? s("g") : h("div", { class: "layer" });
      group.setAttribute("data-layer", name);
      parent.appendChild(group);
    }
    return group;
  }

  /**
   * Keyed reuse of child elements: existing nodes are only updated, so CSS transitions animate.
   * @param {Element} root
   * @param {Array} items
   * @param {(item:any, i:number) => string|number} keyFn
   * @param {(item:any, i:number) => Element} createFn
   * @param {(node:Element, item:any, i:number, isNew:boolean) => void} updateFn
   */
  function reconcile(root, items, keyFn, createFn, updateFn) {
    const existing = new Map();
    for (const child of Array.from(root.children)) {
      const key = child.getAttribute("data-key");
      if (key != null) existing.set(key, child);
    }
    const seen = new Set();
    items.forEach((item, i) => {
      const key = String(keyFn(item, i));
      if (seen.has(key)) throw new Error("reconcile: duplicate key: " + key);
      seen.add(key);
      let node = existing.get(key);
      const isNew = !node;
      if (isNew) {
        node = createFn(item, i);
        node.setAttribute("data-key", key);
        root.appendChild(node);
      }
      if (updateFn) updateFn(node, item, i, isNew);
    });
    for (const [key, node] of existing) if (!seen.has(key)) node.remove();
  }

  /** Positions a node with a CSS transform (animatable in SVG too). */
  function move(node, x, y, extra) {
    node.style.transform = `translate(${x}px, ${y}px)` + (extra ? " " + extra : "");
  }

  /** Forces a style recalculation, so the value set next animates from the current one. */
  function flush(node) {
    void node.getBoundingClientRect();
  }

  /** Adds a task's own <style> to the page once (identified by `id`). */
  function addStyle(id, css) {
    if (!document.getElementById(id)) document.head.appendChild(h("style", { id, text: css }));
  }

  /** CSS filter for a soft glow around an element. */
  const glow = (color, blur = 10) => `drop-shadow(0 0 ${blur}px ${color})`;

  /** Defines an arrowhead marker in the svg (once) and returns its url(#id) reference. */
  function arrowMarker(svg, id, color) {
    if (!svg.querySelector("#" + id)) {
      let defs = svg.querySelector(":scope > defs");
      if (!defs) defs = svg.insertBefore(s("defs"), svg.firstChild);
      defs.appendChild(
        s("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" },
          [s("path", { d: "M0,0 L10,5 L0,10 z", fill: color })])
      );
    }
    return `url(#${id})`;
  }

  /* ---------- Python-like values ---------- */

  /** A tuple in `vars`, shown as (a, b). */
  const tuple = (...items) => ({ __t: items });
  /** A set in `vars`, shown as {a, b}. */
  const pyset = (items) => ({ __set: [...items] });
  /** Preformatted text in `vars`, shown verbatim. */
  const repr = (text) => ({ __repr: String(text) });

  /** Approximates Python's repr(). */
  function py(value) {
    if (value === null || value === undefined) return "None";
    if (value === true) return "True";
    if (value === false) return "False";
    if (typeof value === "number") {
      if (value === Infinity) return "inf";
      if (value === -Infinity) return "-inf";
      if (Number.isNaN(value)) return "nan";
      return String(value);
    }
    if (typeof value === "string") return "'" + value.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
    if (Array.isArray(value)) return "[" + value.map(py).join(", ") + "]";
    if (typeof value === "object") {
      if ("__repr" in value) return value.__repr;
      if ("__t" in value) return "(" + value.__t.map(py).join(", ") + (value.__t.length === 1 ? ",)" : ")");
      if ("__set" in value) return value.__set.length ? "{" + value.__set.map(py).join(", ") + "}" : "set()";
      return "{" + Object.keys(value).map((key) => py(key) + ": " + py(value[key])).join(", ") + "}";
    }
    return String(value);
  }

  /** Python's str(): strings without quotes, everything else as repr. */
  const pyStr = (value) => (typeof value === "string" ? value : py(value));

  /** The output of Python's print(*args): one line without the newline. */
  const pyPrint = (...args) => args.map(pyStr).join(" ");

  /** Deep copy for vars/visual snapshots (keeps ±Infinity, which JSON would lose). */
  function clone(value) {
    if (value === undefined) return undefined;
    const encode = (key, x) => (x === Infinity ? "__inf" : x === -Infinity ? "__-inf" : x);
    const decode = (key, x) => (x === "__inf" ? Infinity : x === "__-inf" ? -Infinity : x);
    return JSON.parse(JSON.stringify(value, encode), decode);
  }

  /* ---------- Randomness ---------- */

  /** Seeded random generator (mulberry32) with int/pick/shuffle helpers. */
  function rng(seed) {
    let state = seed >>> 0;
    const random = function () {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    random.int = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
    random.pick = (items) => items[Math.floor(random() * items.length)];
    random.shuffle = (items) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };
    return random;
  }

  /** String → 32-bit FNV-1a hash (seeds the generator from the input). */
  function hash(text) {
    let x = 2166136261;
    for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 16777619);
    return x >>> 0;
  }

  /* ---------- Syntax highlighting ---------- */

  const PY_KEYWORDS = new Set("def return if elif else while for in not and or import from class None True False break continue pass with as lambda is global yield try except".split(" "));
  const PY_BUILTINS = new Set("print input int len range min max sorted sum list set open str float map abs append pop split strip dict tuple enumerate add sort reverse heappush heappop".split(" "));
  const PSEUDO_KEYWORDS = /^(ciklus|amíg|amig|ha|akkor|különben|egyébként|vége|elágazás|kiír|be|beolvas|eljárás|függvény|vissza|minden|-tól|-ig|és|vagy|nem|igaz|hamis|tól|ig)$/i;
  const PY_TOKEN = /(#.*$)|([fr]?"(?:[^"\\]|\\.)*"|[fr]?'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_áéíóöőúüűÁÉÍÓÖŐÚÜŰ][\wáéíóöőúüűÁÉÍÓÖŐÚÜŰ]*)/g;

  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /** HTML of one Python line with simple token highlighting. */
  function highlightPy(line) {
    const span = (cls, text) => `<span class="${cls}">${text}</span>`;
    let html = "", last = 0, match;
    PY_TOKEN.lastIndex = 0;
    while ((match = PY_TOKEN.exec(line))) {
      html += escapeHtml(line.slice(last, match.index));
      const token = escapeHtml(match[0]);
      const [, comment, string, number, word] = match;
      if (comment) html += span("tk-com", token);
      else if (string) html += span("tk-str", token);
      else if (number) html += span("tk-num", token);
      else if (PY_KEYWORDS.has(word)) html += span("tk-kw", token);
      else if (PY_BUILTINS.has(word)) html += span("tk-bi", token);
      else html += token;
      last = PY_TOKEN.lastIndex;
    }
    return html + escapeHtml(line.slice(last));
  }

  /** HTML of one Hungarian pseudo code line (keywords highlighted). */
  function highlightPseudo(line) {
    return escapeHtml(line).replace(/[A-Za-záéíóöőúüűÁÉÍÓÖŐÚÜŰ-]+/g, (word) => (PSEUDO_KEYWORDS.test(word) ? `<span class="tk-kw">${word}</span>` : word));
  }

  /* ---------- Misc ---------- */

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  /** Theme tokens (css/style.css :root). Key: the CSS variable in camelCase, e.g. --surface-2 → surface2. */
  const THEME_TOKENS = [
    "bg", "panel", "panel-2", "code-bg", "surface", "surface-2", "stroke", "stroke-strong", "line",
    "text", "text-2", "muted", "accent", "accent-2", "ok", "warn", "err", "cur",
    "accent-soft", "ok-soft", "warn-soft", "err-soft", "cur-soft", "hl",
    "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8",
  ];
  const PALETTE_TOKENS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
  const camelCase = (name) => name.replace(/-(\w)/g, (m, c) => c.toUpperCase());

  /** The current theme colors read from the CSS variables (passed to renders as ctx.theme). */
  function themeColors() {
    const style = getComputedStyle(document.documentElement);
    const colors = {};
    for (const token of THEME_TOKENS) colors[camelCase(token)] = style.getPropertyValue("--" + token).trim();
    colors.palette = PALETTE_TOKENS.map((token) => colors[token]);
    return colors;
  }

  window.UI = {
    h, s, setAttrs, addStyle, ensureSvg, layer, reconcile, move, flush, glow, arrowMarker,
    tuple, pyset, repr, py, pyStr, pyPrint, clone,
    rng, hash, highlightPy, highlightPseudo, escapeHtml, clamp, themeColors,
  };
})();
