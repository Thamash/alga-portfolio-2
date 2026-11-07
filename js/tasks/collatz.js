/* 7/A – Collatz sequence. The reference task: shows every panel, the pseudo code view and the render pattern. */
(function () {
  "use strict";

  const PY = Trace.source([
    "n = int(input())",
    "while n != 1:",
    "    print(n)",
    "    if n % 2 == 0:",
    "        n = n // 2",
    "    else:",
    "        n = 3 * n + 1",
    "print(n)",
  ]);

  const PSEUDO = [
    "be: n",
    "ciklus amíg n ≠ 1",
    "    kiír: n",
    "    ha n páros akkor",
    "        n ← n div 2",
    "    különben",
    "        n ← 3 · n + 1",
    "kiír: n",
  ];

  const LINE = {
    read: PY.at("n = int(input())"),
    loop: PY.at("while n != 1:"),
    print: PY.at("print(n)", "while n != 1:"),
    isEven: PY.at("if n % 2 == 0:"),
    halve: PY.at("n = n // 2"),
    triple: PY.at("n = 3 * n + 1"),
    printLast: PY.at("print(n)", "n = 3 * n + 1"),
  };

  /** The rule applied to n in the current step (shown in the drawing). */
  const RULE = { even: "páros", odd: "páratlan" };

  function* generate(input) {
    let n = input.n;
    let steps = 0;
    const chain = [n];
    const vars = () => ({ n, _lépések: steps });
    const visual = (rule) => ({ chain: [...chain], current: n, rule });

    yield { line: LINE.read, vars: vars(), visual: visual(null), note: `Beolvassuk a kezdő számot: n = ${n}.` };

    for (let iter = 1; ; iter++) {
      const loop = { label: "while", iter };
      if (n === 1) {
        yield { line: LINE.loop, loop, note: "n != 1 → hamis (n = 1), a feltétel hamis, kilépünk a ciklusból." };
        break;
      }
      yield { line: LINE.loop, loop, visual: visual(null), note: `n != 1 → igaz (n = ${n}), belépünk a ciklusmagba.` };
      yield { line: LINE.print, output: String(n), note: `Kiírjuk az aktuális értéket: ${n}.` };
      const even = n % 2 === 0;
      const rule = even ? RULE.even : RULE.odd;
      yield { line: LINE.isEven, visual: visual(rule), note: `n % 2 == 0 → ${even ? "igaz" : "hamis"}: ${n} ${rule}.` };
      const old = n;
      n = even ? Math.floor(n / 2) : 3 * n + 1;
      steps++;
      chain.push(n);
      yield even
        ? { line: LINE.halve, vars: vars(), visual: visual(rule), note: `${old} páros → felezzük: n = ${old} // 2 = ${n}.` }
        : { line: LINE.triple, vars: vars(), visual: visual(rule), note: `${old} páratlan → n = 3 · ${old} + 1 = ${n}.` };
    }
    yield { line: LINE.printLast, loop: null, output: String(n), visual: visual(null), note: `Kiírjuk az 1-et. Kész: ${steps} lépés kellett.` };
  }

  /* ---------- drawing ---------- */

  const R_BIG = 58, R_SMALL = 17, GAP = 46;
  /** Centre of the big circle showing the current n. */
  const BIG = { x: 30 + R_BIG, y: 20 + R_BIG };
  const BAND_Y = 20 + 2 * R_BIG + 62;
  const CHART_GAP = 50;

  function render(step, stage, ctx) {
    const { chain, current, rule } = step.visual;
    const C = ctx.theme;
    const svg = UI.ensureSvg(stage);
    drawCurrent(svg, step.visual, C);
    drawChain(svg, chain, ctx);
    drawChart(UI.layer(svg, "chart"), chain, { x: 40, y: BAND_Y + CHART_GAP, w: ctx.width - 70, h: ctx.height - (BAND_Y + CHART_GAP) - 30 }, C);
  }

  function ruleColor(rule, C) {
    return rule === RULE.even ? C.accent : rule === RULE.odd ? C.cur : C.muted;
  }

  function ruleText(rule, current) {
    if (rule === RULE.even) return "páros → n // 2";
    if (rule === RULE.odd) return "páratlan → 3 · n + 1";
    return current === 1 ? "elértük az 1-et ✓" : "";
  }

  /** The big circle with the current n, the rule applied and the step count. */
  function drawCurrent(svg, { chain, current, rule }, C) {
    const top = UI.layer(svg, "top");
    if (!top.firstChild) {
      top.appendChild(UI.s("circle", { class: "anim big", cx: BIG.x, cy: BIG.y, r: R_BIG, "stroke-width": 4 }));
      top.appendChild(UI.s("text", { class: "big-n mono", x: BIG.x, y: BIG.y + 11, "text-anchor": "middle", "font-weight": 700 }));
      top.appendChild(UI.s("text", { x: BIG.x, y: BIG.y + R_BIG + 22, "text-anchor": "middle", "font-size": 15, fill: C.muted, text: "n" }));
      top.appendChild(UI.s("text", { class: "rule", x: BIG.x + R_BIG + 30, y: BIG.y - 6, "font-size": 22, "font-weight": 600 }));
      top.appendChild(UI.s("text", { class: "count", x: BIG.x + R_BIG + 30, y: BIG.y + 26, "font-size": 16 }));
    }
    const color = ruleColor(rule, C);
    const big = top.querySelector(".big");
    big.style.fill = rule === RULE.even ? C.accentSoft : rule === RULE.odd ? C.curSoft : C.surface;
    big.style.stroke = color;
    big.style.filter = UI.glow(color, 14);
    const digits = String(current).length;
    const bigText = top.querySelector(".big-n");
    bigText.textContent = current;
    bigText.setAttribute("font-size", digits > 6 ? 22 : digits > 4 ? 30 : 40);
    const ruleEl = top.querySelector(".rule");
    ruleEl.textContent = ruleText(rule, current);
    ruleEl.style.fill = current === 1 && !rule ? C.ok : color;
    top.querySelector(".count").textContent = `eddig ${chain.length - 1} lépés`;
  }

  /** The chain as a sliding band; a new element "swims in" from the big circle. */
  function drawChain(svg, chain, ctx) {
    const C = ctx.theme;
    const arrow = UI.arrowMarker(svg, "collatz-arrow", C.strokeStrong);
    const perRow = Math.max(4, Math.floor((ctx.width - 60) / GAP));
    const first = Math.max(0, chain.length - perRow);
    const xOf = (i) => 40 + (i - first) * GAP;
    const items = chain.map((value, i) => ({ value, i })).filter((item) => item.i >= first - 1);

    UI.reconcile(UI.layer(svg, "edges"), items.filter((item) => item.i > 0), (item) => item.i,
      () => UI.s("line", { class: "anim", stroke: C.strokeStrong, "stroke-width": 2, "marker-end": arrow, x1: 0, y1: 0, x2: GAP - 2 * R_SMALL - 4, y2: 0 }),
      (node, item, k, isNew) => {
        const x = xOf(item.i - 1) + R_SMALL + 2;
        if (isNew) {
          UI.move(node, x, BAND_Y);
          node.style.opacity = 0;
          UI.flush(node);
        }
        UI.move(node, x, BAND_Y);
        node.style.opacity = item.i - 1 < first ? 0 : 1;
      });

    UI.reconcile(UI.layer(svg, "nodes"), items, (item) => item.i,
      () => UI.s("g", { class: "anim" }, [
        UI.s("circle", { r: R_SMALL, "stroke-width": 2 }),
        UI.s("text", { y: 5, "text-anchor": "middle", class: "mono" }),
      ]),
      (node, item, k, isNew) => {
        const isLast = item.i === chain.length - 1;
        const circle = node.firstChild, text = node.lastChild;
        circle.setAttribute("fill", isLast ? C.curSoft : C.surface);
        circle.setAttribute("stroke", isLast ? C.cur : item.value === 1 ? C.ok : C.strokeStrong);
        const label = String(item.value);
        text.textContent = label.length > 5 ? label.slice(0, 3) + "…" : label;
        text.setAttribute("font-size", label.length > 3 ? 10 : 13);
        if (isNew && ctx.fromStep && item.i > 0) {
          UI.move(node, BIG.x, BIG.y, "scale(1.6)");
          node.style.opacity = 0.2;
          UI.flush(node);
        }
        UI.move(node, xOf(item.i), BAND_Y);
        node.style.opacity = item.i < first ? 0 : 1;
      });

    const hidden = UI.layer(svg, "hidden-label");
    hidden.innerHTML = "";
    if (first > 0) {
      hidden.appendChild(UI.s("text", {
        x: ctx.width - 16, y: BAND_Y - R_SMALL - 10, "font-size": 13, fill: C.muted, "text-anchor": "end",
        text: `a sáv eleje előtt még ${first} elem ←`,
      }));
    }
  }

  /** Mini line chart of the values so far, marking the maximum. */
  function drawChart(g, chain, box, C) {
    g.innerHTML = "";
    if (box.h < 60 || chain.length < 2) return;
    const maxValue = Math.max(...chain);
    const maxIndex = chain.indexOf(maxValue);
    const xSteps = Math.max(chain.length - 1, 10);
    const px = (i) => box.x + (i / xSteps) * box.w;
    const py = (value) => box.y + box.h - (value / maxValue) * box.h;
    const bottom = box.y + box.h;
    g.appendChild(UI.s("line", { x1: box.x, y1: bottom, x2: box.x + box.w, y2: bottom, stroke: C.stroke }));
    g.appendChild(UI.s("line", { x1: box.x, y1: box.y, x2: box.x, y2: bottom, stroke: C.stroke }));
    g.appendChild(UI.s("text", { x: box.x, y: box.y - 8, "font-size": 13, fill: C.muted, text: "az eddigi értékek (vízszintesen: lépés, függőlegesen: n)" }));
    g.appendChild(UI.s("polyline", {
      points: chain.map((value, i) => `${px(i)},${py(value)}`).join(" "),
      fill: "none", stroke: C.accent, "stroke-width": 2.5, "stroke-linejoin": "round", style: { filter: UI.glow(C.accent, 4) },
    }));
    g.appendChild(UI.s("circle", { cx: px(maxIndex), cy: py(maxValue), r: 4, fill: C.err }));
    const labelLeft = px(maxIndex) > box.x + box.w - 80;
    g.appendChild(UI.s("text", {
      x: px(maxIndex) + (labelLeft ? -8 : 8), y: py(maxValue) + 4, "font-size": 14, fill: C.err, "text-anchor": labelLeft ? "end" : "start",
      text: `max: ${maxValue}`,
    }));
    const last = chain.length - 1;
    g.appendChild(UI.s("circle", { cx: px(last), cy: py(chain[last]), r: 5, fill: C.cur }));
  }

  registerTask({
    id: "collatz",
    title: "Collatz-sorozat",
    grade: 7,
    level: "sima",
    topic: ["while-ciklus", "elágazás"],
    intro:
      "<p>Adott egy pozitív egész <b>n</b>. Ha páros, elfelezzük, ha páratlan, megszorozzuk 3-mal és hozzáadunk 1-et. " +
      "Ezt ismételjük, amíg 1-hez nem érünk, és közben minden értéket kiírunk.</p>" +
      "<p>Hogy minden kezdőszámra eljutunk-e az 1-hez, az máig <b>nyitott matematikai probléma</b> (Collatz-sejtés) – " +
      "számítógéppel óriási számokig ellenőrizték, bizonyítás nincs.</p>",
    questions: [
      {
        q: "Hány lépés kell a <b>6</b>-tól az 1-ig? Jósoljátok meg, aztán írjátok fel a sorozatot a füzetbe!",
        a: "<b>8 lépés</b>: <code>6 3 10 5 16 8 4 2 1</code> – összesen 9 kiírt szám.",
        try: { values: { n: 6 } },
      },
      {
        q: "És a <b>27</b>-től? Tippeljetek: több vagy kevesebb, mint 20 lépés?",
        a: "Sokkal több: <b>111 lépés</b>! Közben a sorozat egészen <b>9232</b>-ig felmegy, mielőtt visszaesik. A kicsi kezdőszám nem jelent rövid sorozatot.",
        try: { values: { n: 27 }, step: 308, label: "Ugrás a csúcshoz (9232)" },
      },
      {
        q: "Mi történik, ha <b>n = 1</b>-gyel indítunk? Hányszor fut le a ciklus?",
        a: "<b>Egyszer sem</b>: az <code>n != 1</code> feltétel már az elején hamis. A program csak az utolsó sorban kiírja az 1-et.",
        try: { values: { n: 1 } },
      },
      {
        q: "Miért <code>while</code> ciklust használunk, és miért nem <code>for</code>-t?",
        a: "Mert <b>előre nem tudjuk</b>, hányszor kell ismételni: a 16-nál 4, a 27-nél 111 lépés kell. A <code>for</code> akkor jó, ha előre tudjuk, hányszor fut.",
      },
      {
        q: "Mi változna, ha <code>n // 2</code> helyett <code>n / 2</code>-t írnánk?",
        a: "Az osztás eredménye tizedes tört lesz, így a kiírás is elromlik: <code>6 3.0 10.0 5.0 16.0 …</code>. A <code>//</code> egész osztás, a <code>/</code> mindig tizedes törtet ad.",
      },
      {
        q: "Melyik kezdőszámok adnak nagyon rövid sorozatot? (Tipp: 16, 32, 64 …)",
        a: "A <b>2 hatványai</b>: ezeket csak felezni kell, sosem lesznek páratlanok 1 előtt. 16 → 8 → 4 → 2 → 1, vagyis 4 lépés.",
        try: { values: { n: 16 } },
      },
    ],
    pythonCode: PY.text,
    pseudoCode: PSEUDO,
    pythonStdin: (input) => input.n + "\n",
    inputs: [{ name: "n", label: "Kezdő szám (n)", type: "int", min: 1, max: 1000000, default: 6 }],
    presets: [
      { label: "6", values: { n: 6 } },
      { label: "27", values: { n: 27 } },
      { label: "97", values: { n: 97 } },
    ],
    randomInput: (rng) => ({ n: rng.int(2, 200) }),
    maxSteps: 5000,
    generate,
    render,
  });
})();
