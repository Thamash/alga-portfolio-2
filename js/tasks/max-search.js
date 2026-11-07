/* 7/B – Tallest child (maximum search). */
(function () {
  "use strict";

  const PY = Trace.source([
    "magassagok = []",
    "legmagasabb = magassagok[0]",
    "hely = 0",
    "for i in range(1, len(magassagok)):",
    "    if magassagok[i] > legmagasabb:",
    "        legmagasabb = magassagok[i]",
    "        hely = i",
    'print("A legmagasabb:", legmagasabb, "cm, a(z)", hely + 1, ". gyerek")',
  ]);

  const PSEUDO = [
    "magasságok ← []",
    "legmagasabb ← magasságok[0]",
    "hely ← 0",
    "ciklus i ← 1-től hossz(magasságok) − 1-ig",
    "    ha magasságok[i] > legmagasabb akkor",
    "        legmagasabb ← magasságok[i]",
    "        hely ← i",
    'kiír: "A legmagasabb:", legmagasabb, "cm, a(z)", hely + 1, ". gyerek"',
  ];

  const LINE = {
    list: PY.at("magassagok = []"),
    initMax: PY.at("legmagasabb = magassagok[0]"),
    initPos: PY.at("hely = 0"),
    loop: PY.at("for i in range(1, len(magassagok)):"),
    compare: PY.at("if magassagok[i] > legmagasabb:"),
    newMax: PY.at("legmagasabb = magassagok[i]"),
    newPos: PY.at("hely = i"),
    print: PY.at('print("A legmagasabb:", legmagasabb, "cm, a(z)", hely + 1, ". gyerek")'),
  };

  const pythonCode = (input) => PY.fill({ "magassagok = []": `magassagok = [${input.magassagok.join(", ")}]` });
  const pseudoCode = (input) => [`magasságok ← [${input.magassagok.join(", ")}]`, ...PSEUDO.slice(1)];


  function compareNote(i, value, best) {
    const test = `magassagok[${i}] > legmagasabb → ${value} > ${best} → `;
    if (value > best) return test + "igaz: új rekord!";
    if (value === best) return test + "hamis (egyenlők!). Szigorú >, ezért a korona marad.";
    return test + "hamis, marad az eddigi legmagasabb.";
  }

  function* generate(input) {
    const heights = [...input.magassagok];
    const n = heights.length;
    let best, bestIndex, i;
    const vars = () => Trace.assigned({ magassagok: [...heights], legmagasabb: best, hely: bestIndex, i });
    /** `current`: the child looked at; `compared`: the result of the comparison (null before it). */
    const visual = (current, compared = null) => ({ i: current, maxIndex: bestIndex === undefined ? null : bestIndex, cmp: compared });
    const step = (line, current, compared, note, extra) => ({ line, vars: vars(), visual: visual(current, compared), note, ...extra });

    yield step(LINE.list, null, null, `A listában ${n} gyerek magassága van (cm-ben). Az indexek 0-tól ${n - 1}-ig mennek.`);
    best = heights[0];
    yield { ...step(LINE.initMax, 0, null, `Az első gyereket tekintjük az eddigi legmagasabbnak: legmagasabb = ${best}.`), visual: { i: 0, maxIndex: 0, cmp: null } };
    bestIndex = 0;
    yield step(LINE.initPos, null, null, "hely = 0: az eddigi legmagasabb indexe. Vigyázat: az első gyerek indexe 0, nem 1!");

    for (i = 1; i < n; i++) {
      const loop = { label: "for i", iter: i, of: n - 1 };
      yield step(LINE.loop, i, null, `i = ${i}: a(z) ${i + 1}. gyereket nézzük (${heights[i]} cm).`, { loop });
      const bigger = heights[i] > best;
      yield step(LINE.compare, i, bigger, compareNote(i, heights[i], best));
      if (bigger) {
        const old = best;
        best = heights[i];
        yield step(LINE.newMax, i, true, `legmagasabb = ${best} (eddig ${old} volt).`);
        bestIndex = i;
        yield step(LINE.newPos, i, true, `hely = ${i}: a korona átkerül a(z) ${i + 1}. gyerekhez.`);
      }
    }
    i = n - 1;
    yield step(LINE.loop, null, null, "Nincs több gyerek: a for-ciklus véget ért.", { loop: null });
    yield step(LINE.print, null, null, `Kiírás: hely + 1 = ${bestIndex + 1}, mert az emberek 1-től számolnak, a Python 0-tól.`, {
      output: UI.pyPrint("A legmagasabb:", best, "cm, a(z)", bestIndex + 1, ". gyerek"),
    });
  }

  /* ---------- drawing ---------- */

  /** The tallest height (cm) the vertical scale is fitted to. */
  const SCALE_CM = 200;

  /** A stick figure standing on (0,0), `height` tall. */
  function figurePath(height, slot) {
    const head = Math.min(height * 0.09, slot * 0.26, 20);
    const neck = -height + 2 * head;
    const hip = -height * 0.47;
    const arm = -height * 0.72;
    const w = Math.max(8, Math.min(height * 0.14, slot * 0.32));
    return {
      head: { cy: -height + head, r: head },
      d: `M0,${neck} L0,${hip} M${-w},${arm + w * 0.9} L0,${arm} L${w},${arm + w * 0.9} M${-w * 0.8},0 L0,${hip} L${w * 0.8},0`,
    };
  }

  function render(step, stage, ctx) {
    const heights = ctx.input.magassagok;
    const W = ctx.width, C = ctx.theme;
    const svg = UI.ensureSvg(stage);
    const base = ctx.height - 70;
    const scale = (base - 80) / SCALE_CM;
    const slot = (W - 40) / heights.length;
    const geo = {
      base, scale, slot,
      xOf: (k) => 20 + slot * (k + 0.5),
      topOf: (k) => base - heights[k] * scale,
    };
    drawBestLine(svg, step.vars.legmagasabb, geo, W, C);
    const ground = UI.layer(svg, "ground");
    if (!ground.firstChild) ground.appendChild(UI.s("line", { x1: 10, x2: W - 10, y1: base + 1, y2: base + 1, stroke: C.strokeStrong, "stroke-width": 2 }));
    drawFigures(svg, heights, step, geo, C);
    drawCrown(svg, step.visual.maxIndex, geo, C);
    drawPointer(svg, step.visual.i, geo, C);
  }

  /** Dashed line at the height of the tallest so far. */
  function drawBestLine(svg, best, geo, W, C) {
    const layer = UI.layer(svg, "best");
    if (!layer.firstChild) {
      layer.appendChild(UI.s("g", { class: "anim best-line" }, [
        UI.s("line", { x1: 10, x2: W - 10, y1: 0, y2: 0, stroke: C.accent, "stroke-dasharray": "6 5", "stroke-width": 2 }),
        UI.s("text", { x: 12, y: -7, "font-size": 14, "font-weight": 600, fill: C.accent, stroke: C.panel, "stroke-width": 5, "paint-order": "stroke" }),
      ]));
    }
    const line = layer.firstChild;
    const known = best !== undefined;
    UI.move(line, 0, known ? geo.base - best * geo.scale : geo.base);
    line.style.opacity = known ? 1 : 0;
    if (known) line.lastChild.textContent = `legmagasabb = ${best}`;
  }

  function drawFigures(svg, heights, step, geo, C) {
    const { i, maxIndex, cmp } = step.visual;
    const lastLooked = step.vars.i;
    UI.reconcile(UI.layer(svg, "figs"), heights.map((value, k) => ({ value, k })), (item) => item.k,
      (item) => {
        const height = item.value * geo.scale;
        const figure = figurePath(height, geo.slot);
        return UI.s("g", {}, [
          UI.s("circle", { class: "anim", cx: 0, cy: figure.head.cy, r: figure.head.r, fill: C.surface, "stroke-width": 3 }),
          UI.s("path", { class: "anim", d: figure.d, fill: "none", "stroke-width": 3, "stroke-linecap": "round" }),
          UI.s("text", { x: 0, y: -height - 10, "text-anchor": "middle", "font-size": 15, "font-weight": 700, class: "mono", fill: C.text, stroke: C.panel, "stroke-width": 5, "paint-order": "stroke", text: item.value }),
          UI.s("text", { x: 0, y: 22, "text-anchor": "middle", "font-size": 14, text: `${item.k + 1}.` }),
          UI.s("text", { x: 0, y: 40, "text-anchor": "middle", "font-size": 12, fill: C.muted, class: "mono", text: `[${item.k}]` }),
        ]);
      },
      (node, { k }) => {
        node.setAttribute("transform", `translate(${geo.xOf(k)},${geo.base})`);
        let color = C.text2;
        if (k === i) color = cmp === true ? C.ok : cmp === false ? C.err : C.cur;
        else if (k === maxIndex) color = C.accent;
        const highlighted = k === i || k === maxIndex;
        const passed = i != null ? k < i : lastLooked !== undefined && k <= lastLooked;
        node.style.opacity = passed && !highlighted ? 0.55 : 1;
        const [head, body] = node.children;
        head.style.stroke = color;
        body.style.stroke = color;
        head.style.fill = k === maxIndex ? C.accentSoft : k === i ? C.curSoft : C.surface;
        node.style.filter = highlighted ? UI.glow(color, 8) : "none";
      });
  }

  /** A lazily created, animated marker shown at `pos` or hidden when pos is null. */
  function marker(svg, name, create, pos) {
    const layer = UI.layer(svg, name);
    if (!layer.firstChild) layer.appendChild(create());
    const node = layer.firstChild;
    if (pos) UI.move(node, pos[0], pos[1]);
    node.style.opacity = pos ? 1 : 0;
  }

  function drawCrown(svg, maxIndex, geo, C) {
    marker(svg, "crown",
      () => UI.s("g", { class: "anim" }, [
        UI.s("path", { d: "M-15,0 L-15,-16 L-7,-7 L0,-20 L7,-7 L15,-16 L15,0 Z", fill: C.warn, stroke: "none", style: { filter: UI.glow(C.warn, 8) } }),
      ]),
      maxIndex != null ? [geo.xOf(maxIndex), geo.topOf(maxIndex) - 30] : null);
  }

  function drawPointer(svg, i, geo, C) {
    marker(svg, "ptr",
      () => UI.s("g", { class: "anim" }, [
        UI.s("path", { d: "M0,0 L-9,13 L9,13 Z", fill: C.warn, style: { filter: UI.glow(C.warn, 6) } }),
        UI.s("text", { y: 30, "text-anchor": "middle", "font-size": 15, "font-weight": 700, class: "mono", text: "i" }),
      ]),
      i != null ? [geo.xOf(i), geo.base + 46] : null);
  }

  registerTask({
    id: "max-search",
    title: "Legmagasabb gyerek",
    grade: 7,
    level: "sima",
    topic: ["for-ciklus", "maximumkeresés"],
    intro:
      "<p>Az osztály sorban áll, mindenkinek ismerjük a magasságát. Ki a legmagasabb, és hányadik a sorban? " +
      "Végigmegyünk a soron, és mindig csak <b>az eddigi legmagasabbat</b> jegyezzük meg – ő kapja a koronát.</p>" +
      "<p>Ez a <b>maximumkiválasztás</b> programozási tétele; ugyanez a minta a minimum, az összegzés és a megszámlálás alapja.</p>",
    questions: [
      {
        q: "A 7 gyerekes sorban két 170 cm-es gyerek is van (a 4. és a 7.). Melyiket írja ki a program? Jósoljátok meg!",
        a: "<b>A 4.-et</b>: a feltétel szigorú (<code>&gt;</code>), ezért a második 170-es nem „győzi le” az elsőt. <code>&gt;=</code>-vel a 7.-et írná ki.",
        try: { values: { magassagok: [152, 161, 148, 170, 165, 158, 170] } },
      },
      {
        q: "Ha az első gyerek a legmagasabb (181 cm), hányszor változik a <code>legmagasabb</code> értéke a ciklusban?",
        a: "<b>Egyszer sem</b>: 181-ről indul, és senki sem magasabb nála. A ciklus ettől még mind a 4 többi gyereket megnézi – különben nem tudhatnánk, hogy ő a legmagasabb.",
        try: { values: { magassagok: [181, 150, 167, 172, 159] } },
      },
      {
        q: "Növekvő sorban (140, 147, 153, 160, 166, 174) hányszor kap valaki új koronát?",
        a: "<b>Minden összehasonlítás után</b>, vagyis 5-ször: mindenki magasabb az eddigieknél. Az összehasonlítások száma viszont ugyanannyi, mint bármelyik 6 fős sornál.",
        try: { values: { magassagok: [140, 147, 153, 160, 166, 174] } },
      },
      {
        q: "Miért nem jó a <code>legmagasabb = 0</code> kezdőérték, ha például hőmérsékletek közül keressük a legnagyobbat?",
        a: "Ha minden érték negatív (pl. −3, −8, −1 fok), egyik sem nagyobb 0-nál, így a program <b>0</b>-t írna ki – ami nem is szerepel a listában. Ezért az első elemből indulunk.",
      },
      {
        q: "Hány összehasonlítás kell egy 12 fős sornál? És egy 30 fősnél?",
        a: "Mindig <b>eggyel kevesebb</b>, mint ahány gyerek van: 11, illetve 29 – az első gyereket nem kell semmivel összehasonlítani. Kétszer hosszabb sor kétszer annyi munka.",
      },
    ],
    pythonCode,
    pseudoCode,
    inputs: [{ name: "magassagok", label: "Magasságok (cm, vesszővel)", type: "intList", minLen: 3, maxLen: 12, min: 100, max: 200, default: [152, 161, 148, 170, 165, 158, 170] }],
    presets: [
      { label: "7 gyerek", values: { magassagok: [152, 161, 148, 170, 165, 158, 170] } },
      { label: "Az első a legmagasabb", values: { magassagok: [181, 150, 167, 172, 159] } },
      { label: "Növekvő sor", values: { magassagok: [140, 147, 153, 160, 166, 174] } },
    ],
    randomInput: (rng) => {
      const n = rng.int(5, 10);
      return { magassagok: Array.from({ length: n }, () => rng.int(130, 190)) };
    },
    generate,
    render,
  });
})();
