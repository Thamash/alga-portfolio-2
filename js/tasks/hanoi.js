/* 10/A – Towers of Hanoi (recursion, call stack). */
(function () {
  "use strict";

  const PRINT_MOVE = 'print(honnan, "->", hova)';
  const CALL_LINE = 'hanoi(N, "A", "B", "C")';

  const PY = Trace.source([
    "def hanoi(n, honnan, segéd, hova):",
    "    if n == 1:",
    "        " + PRINT_MOVE,
    "        return",
    "    hanoi(n - 1, honnan, hova, segéd)",
    "    " + PRINT_MOVE,
    "    hanoi(n - 1, segéd, honnan, hova)",
    "",
    CALL_LINE,
  ]);
  const LINE = {
    isBase: PY.at("if n == 1:"),
    baseMove: PY.at(PRINT_MOVE, "if n == 1:"),
    baseReturn: PY.at("return"),
    firstCall: PY.at("hanoi(n - 1, honnan, hova, segéd)"),
    middleMove: PY.at(PRINT_MOVE, "return"),
    secondCall: PY.at("hanoi(n - 1, segéd, honnan, hova)"),
    start: PY.at(CALL_LINE),
  };

  const PEGS = ["A", "B", "C"];
  const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const superscript = (k) => String(k).split("").map((digit) => SUPERSCRIPT_DIGITS[digit]).join("");

  function* generate(input) {
    const N = input.n;
    const pegs = { A: [], B: [], C: [] };
    for (let disk = N; disk >= 1; disk--) pegs.A.push(disk);
    const calls = Trace.callStack();
    let moves = 0;
    const visual = (extra) => ({ n: N, pegs: { A: [...pegs.A], B: [...pegs.B], C: [...pegs.C] }, moving: null, prints: moves, ...extra });

    /** Prints and performs one move. */
    function* move(line, honnan, hova, step) {
      moves++;
      const disk = pegs[honnan].pop();
      pegs[hova].push(disk);
      yield step(line, `Kiírjuk: ${honnan} -> ${hova} – a ${disk}-es korongot átrakjuk ${honnan}-ról ${hova}-ra.`, {
        output: `${honnan} -> ${hova}`,
        visual: visual({ moving: { disk, from: honnan, to: hova } }),
      });
    }

    function* hanoi(n, honnan, seged, hova) {
      const vars = () => ({ n, honnan, segéd: seged, hova, _lépések: moves });
      const step = (line, note, extra) => ({ line, vars: vars(), stack: calls.snapshot(), visual: visual(), note, ...extra });

      if (n === 1) {
        yield step(LINE.isBase, "n == 1 → igaz: egyetlen korong, ezt közvetlenül átrakhatjuk.");
        yield* move(LINE.baseMove, honnan, hova, step);
        yield step(LINE.baseReturn, `return – a hanoi(1, ${honnan}→${hova}) kész, a feladat visszakerül a hívóhoz.`);
        return;
      }
      yield step(LINE.isBase, `n == 1 → hamis (n = ${n}): a felső ${n - 1} korongot rábízzuk egy „beosztottra”.`);
      yield step(LINE.firstCall, `Hívás: hanoi(${n - 1}, ${honnan}, ${hova}, ${seged}) – a felső ${n - 1} korong ${honnan}-ról ${seged}-re, hogy a ${n}-es korong szabad legyen.`);
      yield* call(n - 1, honnan, hova, seged);
      yield* move(LINE.middleMove, honnan, hova, step);
      yield step(LINE.secondCall, `Hívás: hanoi(${n - 1}, ${seged}, ${honnan}, ${hova}) – a félrerakott ${n - 1} korong ${seged}-ről ${hova}-ra.`);
      yield* call(n - 1, seged, honnan, hova);
    }

    const call = (n, honnan, seged, hova) => calls.call(`hanoi(${n}, ${honnan}→${hova})`, () => hanoi(n, honnan, seged, hova));

    yield {
      line: LINE.start, vars: { _lépések: 0 }, stack: [], visual: visual(),
      note: `Elindítjuk: hanoi(${N}, "A", "B", "C") – ${N} korongot rakunk át A-ról C-re, B a segédrúd.`,
    };
    yield* call(N, "A", "B", "C");
  }

  /* ---------- drawing ---------- */

  function layout(N, W, H) {
    const diskHeight = Math.max(18, Math.min(30, (H - 230) / (N + 1)));
    // the tower is aligned from the top, so on a tall stage it does not slide under the control bar
    const baseY = Math.min(H - 70, 150 + (N + 1) * diskHeight + 40);
    const pegTop = baseY - (N + 1) * diskHeight - 14;
    const pegX = { A: W / 6, B: W / 2, C: (5 * W) / 6 };
    const maxWidth = Math.min(W / 3 - 24, 210);
    const minWidth = Math.min(44, maxWidth * 0.35);
    const widthOf = (disk) => (N === 1 ? maxWidth * 0.6 : minWidth + ((disk - 1) * (maxWidth - minWidth)) / (N - 1));
    return {
      W, H, diskHeight, baseY, pegTop, pegX, widthOf,
      liftY: pegTop - diskHeight - 8,
      position: (disk, peg, level) => [pegX[peg] - widthOf(disk) / 2, baseY - (level + 1) * diskHeight],
    };
  }

  function render(step, stage, ctx) {
    const C = ctx.theme;
    const svg = UI.ensureSvg(stage);
    const box = layout(step.visual.n, ctx.width, ctx.height);
    drawPegs(UI.layer(svg, "base"), step, box, C);
    drawDisks(UI.layer(svg, "disks"), step.visual, box, ctx);
    drawCallStack(UI.layer(svg, "stack"), step.stack || [], box, C);
    drawInfo(UI.layer(svg, "info"), step.visual, ctx);
  }

  /** The base, the three pegs with their names, and the role of each peg in the current call. */
  function drawPegs(layer, step, box, C) {
    const { pegX, pegTop, baseY } = box;
    layer.innerHTML = "";
    layer.appendChild(UI.s("rect", { x: 20, y: baseY, width: box.W - 40, height: 10, rx: 5, fill: C.strokeStrong }));
    const roles = {};
    if (step.vars && step.vars.honnan) {
      roles[step.vars.honnan] = ["honnan", C.accent];
      roles[step.vars["segéd"]] = ["segéd", C.muted];
      roles[step.vars.hova] = ["hova", C.ok];
    }
    for (const peg of PEGS) {
      layer.appendChild(UI.s("rect", { x: pegX[peg] - 4, y: pegTop, width: 8, height: baseY - pegTop, rx: 4, fill: C.surface2 }));
      layer.appendChild(UI.s("text", { x: pegX[peg], y: baseY + 34, "text-anchor": "middle", "font-size": 22, "font-weight": 700, text: peg }));
      if (roles[peg]) {
        const [role, color] = roles[peg];
        layer.appendChild(UI.s("text", { x: pegX[peg], y: baseY + 54, "text-anchor": "middle", "font-size": 14, "font-weight": 600, fill: color, text: role }));
      }
    }
  }

  function drawDisks(layer, v, box, ctx) {
    const C = ctx.theme;
    const disks = [];
    for (const peg of PEGS) v.pegs[peg].forEach((disk, level) => disks.push({ disk, peg, level }));
    const previous = {};
    if (ctx.prevStep && ctx.prevStep.visual) {
      for (const peg of PEGS) ctx.prevStep.visual.pegs[peg].forEach((disk, level) => (previous[disk] = [peg, level]));
    }
    UI.reconcile(layer, disks, (it) => it.disk,
      () => UI.s("g", { class: "anim" }, [UI.s("rect", { rx: 9, "stroke-width": 2 }), UI.s("text", { "text-anchor": "middle", "font-weight": 700, "font-size": 14 })]),
      (node, it) => {
        const width = box.widthOf(it.disk);
        const rect = node.firstChild, label = node.lastChild;
        const moving = v.moving && v.moving.disk === it.disk;
        rect.setAttribute("width", width);
        rect.setAttribute("height", box.diskHeight - 3);
        rect.style.fill = C.palette[(it.disk - 1) % C.palette.length];
        rect.style.stroke = moving ? C.text : "none";
        rect.style.strokeWidth = moving ? 3 : 0;
        node.style.filter = moving ? UI.glow(C.cur, 12) : "none";
        label.setAttribute("x", width / 2);
        label.setAttribute("y", box.diskHeight / 2 + 3);
        label.textContent = it.disk;
        label.style.fill = C.bg;
        const [x, y] = box.position(it.disk, it.peg, it.level);
        const from = previous[it.disk];
        const animateMove = moving && ctx.fromStep && from && from[0] === v.moving.from && ctx.transitionMs > 0;
        if (animateMove) liftAndDrop(node, box.position(it.disk, from[0], from[1]), [x, y], box.liftY, ctx.transitionMs);
        else UI.move(node, x, y);
      });
  }

  /** Animates a moved disk up, across and down instead of the straight CSS transition. */
  function liftAndDrop(node, [fromX, fromY], [x, y], liftY, transitionMs) {
    node.style.transition = "none";
    UI.move(node, x, y);
    UI.flush(node);
    node.style.transition = "";
    node.animate([
      { transform: `translate(${fromX}px, ${fromY}px)` },
      { transform: `translate(${fromX}px, ${liftY}px)`, offset: 0.3 },
      { transform: `translate(${x}px, ${liftY}px)`, offset: 0.7 },
      { transform: `translate(${x}px, ${y}px)` },
    ], { duration: Math.round(transitionMs * 1.6), easing: "ease-in-out" });
  }

  /** The call stack below the tower (if it fits): the high priest on the left, the deepest helper on the right. */
  function drawCallStack(layer, frames, box, C) {
    layer.innerHTML = "";
    if (!frames.length || box.H - box.baseY < 150) return;
    const y = box.baseY + 96;
    const width = Math.min(150, (box.W - 40) / frames.length - 8);
    layer.appendChild(UI.s("text", { x: 20, y: y - 8, "font-size": 13, fill: C.muted, text: "Hívási verem (balra a legkorábbi, jobbra az, aki most dolgozik):" }));
    frames.forEach((frame, i) => {
      const top = i === frames.length - 1;
      const x = 20 + i * (width + 8);
      layer.appendChild(UI.s("rect", { x, y, width, height: 30, rx: 8, fill: top ? C.curSoft : C.surface, stroke: top ? C.cur : C.stroke, "stroke-width": top ? 2 : 1, style: top ? { filter: UI.glow(C.cur, 8) } : null }));
      layer.appendChild(UI.s("text", { x: x + width / 2, y: y + 20, "text-anchor": "middle", "font-size": width < 110 ? 12 : 14, "font-weight": top ? 700 : 400, fill: top ? C.text : C.text2, text: frame }));
    });
  }

  /** The move counter, and the summary at the end. */
  function drawInfo(layer, v, ctx) {
    const C = ctx.theme;
    layer.innerHTML = "";
    layer.appendChild(UI.s("text", { x: 20, y: 30, "font-size": 17, text: `Átrakások: ${v.prints}` }));
    if (!ctx.isLast) return;
    layer.appendChild(UI.s("text", { x: 20, y: 60, "font-size": 19, "font-weight": 700, fill: C.ok, text: `✓ Kész! ${v.prints} átrakás = 2${superscript(v.n)} − 1` }));
    layer.appendChild(UI.s("text", { x: 20, y: 86, "font-size": 14, fill: C.muted, text: "1 korong: 1 · 2: 3 · 3: 7 · 4: 15 · … · 64 korong: ~585 milliárd év (másodpercenként 1 lépéssel)" }));
  }

  registerTask({
    id: "hanoi",
    title: "Hanoi tornyai",
    grade: 10,
    level: "sima",
    topic: ["rekurzió", "függvény", "hívási verem"],
    intro:
      "<p>Egy kolostorban a szerzetesek 64 aranykorongot raknak át az egyik rúdról a harmadikra, a középsőt segédként használva. " +
      "Egyszerre csak egy korong mozdítható, és nagyobb korong sosem kerülhet kisebbre. A legenda szerint, ha végeznek, vége a világnak.</p>" +
      "<p>A főpap trükkje: a felső n − 1 korongot <b>rábízza egy beosztottjára</b> (az a segédrúdra rakja), " +
      "ő maga csak a legnagyobbat rakja át, majd a beosztott visszarakja a kisebbeket a legnagyobbra. A beosztott ugyanígy gondolkodik…</p>",
    questions: [
      {
        q: "Hány lépésben lehet átrakni 4 korongot? Jósoljátok meg az 1, 2, 3 korongos esetből!",
        a: "<b>15</b>. A sorozat 1, 3, 7, 15, …: minden új korong megduplázza a munkát, és még egyet hozzátesz, így n korongra 2ⁿ − 1 lépés kell.",
        try: { values: { n: 4 } },
      },
      {
        q: "3 korongnál legfeljebb hány <code>hanoi</code>-hívás van egyszerre a hívási veremben?",
        a: "<b>3</b>: hanoi(3) → hanoi(2) → hanoi(1). A verem mélysége a korongok száma – mindegyik „beosztott” eggyel kisebb toronnyal foglalkozik.",
        try: { values: { n: 3 }, step: 5, label: "Ugrás a legmélyebb ponthoz" },
      },
      {
        q: "A legenda 64 korongjánál, másodpercenként egy lépéssel, mennyi ideig dolgoznának a szerzetesek?",
        a: "2⁶⁴ − 1 ≈ 1,8 · 10¹⁹ lépés, ez kb. <b>585 milliárd év</b> – a világegyetem eddigi koránál is sokszorta hosszabb.",
      },
      {
        q: "Mi történik, ha az alapesetből kimarad a <code>return</code>?",
        a: "Kiírja az első lépést, de utána továbbmegy: meghívja a <code>hanoi(0, …)</code>-t, az a <code>hanoi(-1, …)</code>-t, és így tovább – a rekurzió nem áll meg, " +
          "a program <code>RecursionError</code>-ral leáll.",
      },
      {
        q: "Figyeljétek meg: melyik korong mozog minden második lépésben?",
        a: "A legkisebb, az <b>1-es</b>: az 1., 3., 5., … lépés mindig az 1-es korongot mozgatja. Erre épül a Hanoi nem rekurzív megoldása is.",
        try: { values: { n: 4 } },
      },
    ],
    inputs: [{ name: "n", label: "Korongok száma (n)", type: "int", min: 1, max: 6, default: 3 }],
    presets: [
      { label: "3 korong", values: { n: 3 } },
      { label: "1", values: { n: 1 } },
      { label: "2", values: { n: 2 } },
      { label: "4", values: { n: 4 } },
      { label: "6", values: { n: 6 } },
    ],
    randomInput: (rng) => ({ n: rng.int(2, 5) }),
    maxSteps: 2000,
    pythonCode: (input) => PY.fill({ [CALL_LINE]: `hanoi(${input.n}, "A", "B", "C")` }),
    generate,
    render,
  });
})();
