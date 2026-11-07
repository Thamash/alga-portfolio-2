/* The shared player UI: input form, code/variables/output panels, controls, tabs, comparison mode, quiz cards.
 * task.html?id=... loads it; the task's own script is injected with a dynamic <script> tag. */
(function () {
  "use strict";

  const { resolve } = Engine;
  const FIELD_TYPES = Fields.TYPES;

  const INFO_OPEN_KEY = "alga.infoOpen";
  const SPEED_MS = { slow: 2000, fast: 100, initial: 800 };
  const TRANSITION_MS = 350;
  /** At or below this step interval, animations are switched off entirely. */
  const NO_ANIMATION_BELOW_MS = 120;
  const RESIZE_DEBOUNCE_MS = 150;
  const COPIED_FEEDBACK_MS = 1200;
  const QUIZ_FLIP_STAGGER_MS = 90;
  const LAYOUT = { footerGap: 30, singleMin: 460, singleMax: 900, variantMin: 380, variantMax: 640, variantGap: 12 };
  const SHOWN = { arrayCells: 30, queueCells: 24, matrixRows: 14, matrixCols: 16 };

  const state = {
    task: null,
    views: [],
    viewIndex: 0,
    input: null,
    runs: [],
    index: 0,
    playing: false,
    timer: null,
    speedMs: SPEED_MS.initial,
    transitionMs: null,
    codeView: "python",
    fields: {},
    dom: {},
    theme: null,
  };

  const currentView = () => state.views[state.viewIndex];
  const totalSteps = () => Math.max(0, ...state.runs.map((run) => run.steps.length));
  const button = (text, attrs) => UI.h("button", { type: "button", text, ...attrs });

  /* ---------- startup ---------- */

  function boot() {
    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    const meta = (window.TASK_INDEX || []).find((t) => t.id === id);
    if (!meta) return fatal(`Ismeretlen feladat: „${id || ""}”.`);
    const script = document.createElement("script");
    script.src = `js/tasks/${id}.js`;
    script.onload = () => {
      const task = window.TASKS[id];
      if (!task) return fatal(`A(z) ${id}.js betöltődött, de nem regisztrált feladatot.`);
      init(task, meta, params);
    };
    script.onerror = () => fatal(`Nem sikerült betölteni: js/tasks/${id}.js`);
    document.head.appendChild(script);
  }

  function fatal(message) {
    const app = document.getElementById("app");
    app.innerHTML = "";
    app.appendChild(UI.h("div", { class: "fatal" }, [
      UI.h("p", { text: message }),
      UI.h("a", { href: "index.html", text: "← Vissza a feladatlistához" }),
    ]));
  }

  function init(task, meta, params) {
    state.task = task;
    state.views = Engine.getViews(task);
    state.theme = UI.themeColors();
    state.viewIndex = Math.max(0, state.views.findIndex((view) => view.id === params.get("tab")));
    const pseudoFirst = task.pseudoDefault ?? task.grade === 7;
    state.codeView = params.get("view") || (pseudoFirst ? "pseudo" : "python");
    document.title = `${task.title} – Algoritmus-portfólió`;

    const dom = state.dom;
    dom.tabs = UI.h("nav", { class: "tabs" });
    dom.tabNotes = UI.h("div", { class: "tab-notes" });
    dom.main = UI.h("main", { class: "player" });
    dom.inputs = buildInputs(task);
    dom.extra = UI.h("section", { class: "extra" });
    const app = document.getElementById("app");
    app.innerHTML = "";
    for (const el of [buildHeader(task, meta), buildInfo(task), dom.tabs, dom.tabNotes, dom.main, buildControls(), dom.extra]) app.appendChild(el);
    buildTabs();

    setFormValues({ ...Engine.defaultInput(task), ...inputFromUrl(task, params) });
    if (!start({ initialStep: Number(params.get("step")) || 0 })) {
      // invalid input in the URL: start with the defaults, keeping the error visible
      const error = dom.formError.textContent;
      setFormValues(Engine.defaultInput(task));
      start({});
      dom.formError.textContent = "Az URL-ben kapott input hibás volt: " + error;
    }

    document.addEventListener("keydown", onKey);
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => renderAll(false), RESIZE_DEBOUNCE_MS);
    });
  }

  function inputFromUrl(task, params) {
    const input = {};
    for (const field of task.inputs || []) {
      if (!params.has(field.name)) continue;
      try {
        input[field.name] = FIELD_TYPES[field.type].decode(params.get(field.name), field);
      } catch (e) {
        // undecodable value: the default stays
      }
    }
    return input;
  }

  /* ---------- header, description, quiz ---------- */

  const chip = (text, cls) => UI.h("span", { class: "chip " + (cls || ""), text });

  function buildHeader(task, meta) {
    return UI.h("header", { class: "top" }, [
      UI.h("a", { class: "back", href: "index.html", text: "← Feladatok" }),
      UI.h("h1", {}, [meta.code ? UI.h("span", { class: "code-tag", text: meta.code }) : null, task.title]),
      UI.h("div", { class: "chips" }, [
        chip(`${task.grade}. évfolyam`, "grade"),
        chip(window.LEVEL_LABELS[task.level] || task.level, "level-" + task.level),
        ...(task.topic || []).map((topic) => chip(topic, "topic")),
      ]),
    ]);
  }

  function readInfoOpen() {
    try {
      return localStorage.getItem(INFO_OPEN_KEY) !== "0";
    } catch (e) {
      return true; // no storage (e.g. private mode)
    }
  }

  function buildInfo(task) {
    const details = UI.h("details", { class: "info", open: readInfoOpen() ? true : null }, [
      UI.h("summary", { text: "Leírás" }),
      UI.h("div", { class: "info-grid" }, [UI.h("div", { class: "intro", html: task.intro || "" })]),
      task.questions && task.questions.length ? buildQuiz(task.questions) : null,
    ]);
    details.addEventListener("toggle", () => {
      try {
        localStorage.setItem(INFO_OPEN_KEY, details.open ? "1" : "0");
      } catch (e) {
        // no storage: the state is simply not remembered
      }
      renderAll(false);
    });
    return details;
  }

  /** Questions for the class: cards that flip over to the answer. */
  function buildQuiz(questions) {
    const counter = UI.h("span", { class: "quiz-count" });
    const toggleAll = button("", { class: "btn small" });
    const cards = questions.map((question, i) => quizCard(question, i, updateCounter));
    const isOpen = (card) => card.el.classList.contains("open");

    function updateCounter() {
      const opened = cards.filter(isOpen).length;
      counter.textContent = `${opened} / ${cards.length} felfedve`;
      toggleAll.textContent = opened === cards.length ? "Mind elrejt" : "Mind felfed";
    }
    toggleAll.onclick = () => {
      const open = !cards.every(isOpen);
      cards.forEach((card, i) => setTimeout(() => card.flip(open), i * QUIZ_FLIP_STAGGER_MS));
    };
    updateCounter();

    return UI.h("div", { class: "quiz" }, [
      UI.h("div", { class: "quiz-head" }, [UI.h("h3", { text: "Kérdések a csoportnak" }), counter, toggleAll]),
      UI.h("div", { class: "quiz-grid" }, cards.map((card) => card.el)),
    ]);
  }

  function quizCard(question, index, onFlip) {
    const front = UI.h("div", { class: "qface front" }, [
      UI.h("span", { class: "qnum", text: String(index + 1) }),
      UI.h("div", { class: "qtext", html: question.q }),
      button("Válasz ↻", { class: "btn small qbtn", onclick: () => flip(true) }),
    ]);
    const back = UI.h("div", { class: "qface back", inert: true }, [
      UI.h("span", { class: "qlabel", text: "Válasz" }),
      UI.h("div", { class: "qtext", html: question.a }),
      UI.h("div", { class: "qactions" }, [
        question.try ? button("▶ " + (question.try.label || "Nézd meg a lejátszóban"), { class: "btn small primary", onclick: () => tryOut(question.try) }) : null,
        button("↺ Kérdés", { class: "btn small ghost", onclick: () => flip(false) }),
      ]),
    ]);
    const el = UI.h("div", { class: "qcard" }, [UI.h("div", { class: "qflip" }, [front, back])]);

    function flip(open) {
      el.classList.toggle("open", open);
      front.inert = open;
      back.inert = !open;
      if (open) {
        el.classList.remove("revealed");
        void el.offsetWidth; // restarts the reveal animation
        el.classList.add("revealed");
      }
      onFlip();
    }
    return { el, flip };
  }

  /** Loads a question's input (and tab) into the player and scrolls to it. */
  function tryOut(target) {
    if (target.tab) {
      const index = state.views.findIndex((view) => view.id === target.tab);
      if (index >= 0) selectView(index, false);
    }
    if (target.values) setFormValues(target.values);
    if (start({ initialStep: target.step, autoplay: target.step == null })) {
      const anchor = state.dom.tabs.style.display === "none" ? state.dom.main : state.dom.tabs;
      anchor.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /* ---------- tabs ---------- */

  function buildTabs() {
    const tabs = state.dom.tabs;
    tabs.innerHTML = "";
    if (state.views.length < 2) {
      tabs.style.display = "none";
      return;
    }
    state.views.forEach((view, i) => {
      tabs.appendChild(button(view.label, {
        class: "tab" + (i === state.viewIndex ? " on" : ""),
        onclick: () => { if (i !== state.viewIndex) selectView(i, true); },
      }));
    });
  }

  function selectView(index, run) {
    state.viewIndex = index;
    Array.from(state.dom.tabs.children).forEach((tab, i) => tab.classList.toggle("on", i === index));
    if (run) {
      runView(0);
      updateUrl();
    }
  }

  /* ---------- input form ---------- */

  function buildInputs(task) {
    const form = UI.h("form", { class: "inputs", onsubmit: (e) => { e.preventDefault(); start({ autoplay: true }); } });
    form.appendChild(UI.h("h2", { text: "Bemenet" }));
    for (const field of task.inputs || []) form.appendChild(buildField(field));
    if (task.presets && task.presets.length) {
      form.appendChild(UI.h("div", { class: "presets" }, [
        UI.h("span", { class: "lbl", text: "Előbeállítások" }),
        ...task.presets.map((preset) => button(preset.label, { class: "btn small", onclick: () => loadAndPlay(preset.values) })),
      ]));
    }
    form.appendChild(UI.h("div", { class: "form-btns" }, [
      task.randomInput ? button("🎲 Véletlen", { class: "btn", onclick: () => loadAndPlay(task.randomInput(UI.rng(randomSeed()))) }) : null,
      UI.h("button", { type: "submit", class: "btn primary", text: "▶ Indítás" }),
    ]));
    state.dom.formError = UI.h("div", { class: "form-error" });
    form.appendChild(state.dom.formError);
    return form;
  }

  function buildField(field) {
    const type = FIELD_TYPES[field.type];
    if (!type) throw new Error("Unknown input type: " + field.type);
    const editor = type.build(field);
    state.fields[field.name] = editor;
    return UI.h("label", { class: "field field-" + field.type }, [
      UI.h("span", { class: "lbl", text: field.label }),
      editor.el,
      field.help ? UI.h("span", { class: "hint", html: field.help }) : null,
    ]);
  }

  const randomSeed = () => (Date.now() ^ (Math.random() * 1e9)) >>> 0;

  /** Fills the form with the field defaults overridden by `values`, then runs and plays. */
  function loadAndPlay(values) {
    const defaults = {};
    for (const field of state.task.inputs || []) defaults[field.name] = field.default;
    setFormValues({ ...defaults, ...values });
    start({ autoplay: true });
  }

  function setFormValues(values) {
    for (const name in state.fields) if (values[name] !== undefined) state.fields[name].set(values[name]);
  }

  function readForm() {
    const input = {};
    for (const name in state.fields) input[name] = state.fields[name].get();
    return input;
  }

  /** Validates the form, generates the steps and draws them (autoplay: starts playback). Returns false on invalid input. */
  function start({ initialStep, autoplay }) {
    let input;
    try {
      input = readForm();
      const error = state.task.validate ? state.task.validate(input) : null;
      if (error) throw error;
    } catch (e) {
      state.dom.formError.textContent = typeof e === "string" ? e : "Hiba: " + e.message;
      return false;
    }
    state.dom.formError.textContent = "";
    state.input = input;
    runView(initialStep || 0);
    updateUrl();
    if (autoplay && totalSteps() > 1) togglePlay();
    return true;
  }

  function updateUrl() {
    if (!state.input) return;
    const params = new URLSearchParams();
    params.set("id", state.task.id);
    if (state.views.length > 1) params.set("tab", currentView().id);
    for (const field of state.task.inputs || []) params.set(field.name, FIELD_TYPES[field.type].encode(state.input[field.name], field));
    try {
      history.replaceState(null, "", "?" + params.toString());
    } catch (e) {
      // some browsers forbid it under file://
    }
  }

  /* ---------- running ---------- */

  function runOne(def) {
    const code = resolve(def.pythonCode, state.input) || "";
    const pseudo = resolve(def.pseudoCode, state.input) || null;
    return { def, lines: code.split("\n"), pseudo, ...Engine.collect(def, state.input), dom: {} };
  }

  function runView(initialStep) {
    stop();
    const view = currentView();
    state.runs = Engine.runDefs(view).map(runOne);
    state.index = UI.clamp(initialStep, 0, Math.max(0, totalSteps() - 1));
    showHtml(state.dom.tabNotes, view.notes);
    showHtml(state.dom.extra, resolve(view.extraHtml ?? state.task.extraHtml, state.input));
    buildLayout(view);
    renderAll(false);
  }

  function showHtml(el, html) {
    el.innerHTML = html || "";
    el.style.display = html ? "" : "none";
  }

  /* ---------- layout ---------- */

  function buildLayout(view) {
    const main = state.dom.main;
    main.innerHTML = "";
    main.className = "player " + (view.compare ? "compare" : "single");
    const left = UI.h("div", { class: "col-left panel" }, [state.dom.inputs]);
    main.appendChild(left);
    for (const run of state.runs) run.dom.stage = UI.h("div", { class: "stage" });

    if (view.compare) {
      main.appendChild(UI.h("div", { class: "variants" }, state.runs.map(buildVariant)));
      state.dom.note.style.display = "none";
    } else {
      const run = state.runs[0];
      left.appendChild(buildOutputPanel(run));
      main.appendChild(UI.h("div", { class: "col-mid" }, [buildCodePanel(run), buildVarsPanel(run)]));
      main.appendChild(UI.h("div", { class: "col-right panel stage-panel" }, [run.dom.stage]));
      state.dom.note.style.display = "";
    }
  }

  function buildVariant(run) {
    run.dom.note = UI.h("div", { class: "vnote" });
    run.dom.count = UI.h("span", { class: "vcount" });
    return UI.h("section", { class: "variant" }, [
      UI.h("div", { class: "vhead" }, [UI.h("h2", { text: run.def.label }), run.dom.count]),
      UI.h("div", { class: "vgrid" }, [
        UI.h("div", { class: "col-mid" }, [buildCodePanel(run), buildVarsPanel(run), buildOutputPanel(run)]),
        UI.h("div", { class: "col-right panel stage-panel" }, [run.dom.note, run.dom.stage]),
      ]),
    ]);
  }

  const panelHead = (title, extra) => UI.h("div", { class: "panel-head" }, [UI.h("h2", { text: title }), ...(extra || [])]);

  const CODE_VIEWS = [{ mode: "python", label: "Python" }, { mode: "pseudo", label: "Pszeudokód" }];

  function buildCodePanel(run) {
    const hasPseudo = Array.isArray(run.pseudo) && run.pseudo.length;
    const switcher = hasPseudo
      ? UI.h("div", { class: "segs" }, CODE_VIEWS.map(({ mode, label }) =>
          button(label, { class: "seg" + (state.codeView === mode ? " on" : ""), "data-mode": mode, onclick: () => setCodeView(mode) })))
      : null;
    const copy = button("Másolás", {
      class: "btn tiny", title: "A Python kód vágólapra másolása",
      onclick: (e) => copyText(run.lines.join("\n"), e.target),
    });
    run.dom.code = UI.h("div", { class: "code" });
    fillCode(run);
    return UI.h("div", { class: "panel code-panel" }, [panelHead("Kód", [switcher, copy]), run.dom.code]);
  }

  function setCodeView(mode) {
    state.codeView = mode;
    for (const run of state.runs) if (run.dom.code) fillCode(run);
    for (const seg of document.querySelectorAll(".seg")) seg.classList.toggle("on", seg.getAttribute("data-mode") === mode);
    renderAll(false);
  }

  const showsPseudo = (run) => state.codeView === "pseudo" && Array.isArray(run.pseudo);

  function fillCode(run) {
    const pseudo = showsPseudo(run);
    const dimmed = new Set(resolve(run.def.dimLines, state.input) || []);
    const highlight = pseudo ? UI.highlightPseudo : UI.highlightPy;
    run.dom.code.innerHTML = "";
    run.dom.code.classList.toggle("pseudo", pseudo);
    run.dom.lines = (pseudo ? run.pseudo : run.lines).map((text, i) =>
      run.dom.code.appendChild(UI.h("div", { class: "line" + (dimmed.has(i + 1) ? " dim" : "") }, [
        UI.h("span", { class: "ln", text: String(i + 1) }),
        UI.h("span", { class: "lc", html: highlight(text) || " " }),
      ])));
    run.dom.activeLine = null;
  }

  function copyText(text, btn) {
    const confirm = () => {
      const label = btn.textContent;
      btn.textContent = "Másolva ✓";
      setTimeout(() => (btn.textContent = label), COPIED_FEEDBACK_MS);
    };
    const copyViaTextarea = () => {
      const area = UI.h("textarea", { style: { position: "fixed", opacity: "0" } });
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        confirm();
      } catch (e) {
        // copying is not possible here; nothing to report
      }
      area.remove();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(confirm, copyViaTextarea);
    else copyViaTextarea();
  }

  function buildVarsPanel(run) {
    run.dom.vars = UI.h("div", { class: "vars" });
    return UI.h("div", { class: "panel vars-panel" }, [panelHead("Változók"), run.dom.vars]);
  }

  function buildOutputPanel(run) {
    run.dom.output = UI.h("pre", { class: "output" });
    return UI.h("div", { class: "panel output-panel" }, [panelHead("Output"), run.dom.output]);
  }

  /* ---------- controls ---------- */

  // the speed slider is logarithmic: 0 → slow, 100 → fast
  const sliderToMs = (value) => Math.round(SPEED_MS.slow * Math.pow(SPEED_MS.fast / SPEED_MS.slow, value / 100));
  const msToSlider = (ms) => Math.round((100 * Math.log(ms / SPEED_MS.slow)) / Math.log(SPEED_MS.fast / SPEED_MS.slow));

  function buildControls() {
    const dom = state.dom;
    const control = (text, title, onclick, cls) => button(text, { class: "btn " + (cls || ""), title, onclick });
    dom.note = UI.h("div", { class: "note" });
    dom.playBtn = control("▶ Lejátszás", "Lejátszás / szünet (Szóköz)", togglePlay, "primary play");
    dom.counter = UI.h("span", { class: "counter" });
    dom.compareCount = UI.h("div", { class: "compare-count" });
    return UI.h("footer", { class: "controls" }, [
      dom.note,
      dom.compareCount,
      UI.h("div", { class: "ctrl-row" }, [
        control("⏮ Elejére", "Elejére (Home)", () => goTo(0)),
        control("◀ Vissza", "Vissza (←)", () => goTo(state.index - 1)),
        dom.playBtn,
        control("Lépés ▶", "Lépés (→)", () => goTo(state.index + 1)),
        control("Végére ⏭", "Végére (End)", () => goTo(totalSteps() - 1)),
        buildSpeedControl(),
        dom.counter,
      ]),
    ]);
  }

  function buildSpeedControl() {
    const slider = UI.h("input", { type: "range", min: 0, max: 100, class: "speed" });
    const label = UI.h("span", { class: "speed-lbl" });
    const showSpeed = () => { label.textContent = (state.speedMs / 1000).toFixed(1).replace(".", ",") + " s/lépés"; };
    slider.value = msToSlider(state.speedMs);
    showSpeed();
    slider.addEventListener("input", () => {
      state.speedMs = sliderToMs(Number(slider.value));
      showSpeed();
      if (state.playing) {
        clearInterval(state.timer);
        state.timer = setInterval(tick, state.speedMs);
        setTransition();
      }
    });
    return UI.h("label", { class: "speed-wrap" }, ["Sebesség ", slider, label]);
  }

  function goTo(index) {
    const total = totalSteps();
    if (!total) return;
    const next = UI.clamp(index, 0, total - 1);
    if (next === state.index && index !== state.index) return;
    state.index = next;
    if (!state.playing) setTransition();
    renderAll(true);
  }

  function tick() {
    const last = totalSteps() - 1;
    if (state.index >= last) return stop();
    state.index++;
    renderAll(true);
    if (state.index >= last) stop();
  }

  function togglePlay() {
    if (state.playing) return stop();
    if (state.index >= totalSteps() - 1) state.index = 0;
    state.playing = true;
    state.dom.playBtn.textContent = "⏸ Szünet";
    setTransition();
    renderAll(true);
    state.timer = setInterval(tick, state.speedMs);
  }

  function stop() {
    state.playing = false;
    clearInterval(state.timer);
    state.timer = null;
    if (state.dom.playBtn) state.dom.playBtn.textContent = "▶ Lejátszás";
    setTransition();
  }

  /** Animations last TRANSITION_MS, but while playing at most half the step interval (none when very fast). */
  function setTransition() {
    let ms = TRANSITION_MS;
    if (state.playing) ms = state.speedMs <= NO_ANIMATION_BELOW_MS ? 0 : Math.min(TRANSITION_MS, Math.floor(state.speedMs / 2));
    state.transitionMs = ms;
    document.documentElement.style.setProperty("--t", ms + "ms");
  }

  const KEY_ACTIONS = {
    ArrowRight: () => goTo(state.index + 1),
    ArrowLeft: () => goTo(state.index - 1),
    " ": () => togglePlay(),
    Home: () => goTo(0),
    End: () => goTo(totalSteps() - 1),
  };

  function onKey(e) {
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
    const action = KEY_ACTIONS[e.key];
    if (typing || e.altKey || e.ctrlKey || e.metaKey || !action) return;
    action();
    e.preventDefault();
  }

  /* ---------- rendering ---------- */

  /** Sizes the player so the sticky footer does not cover it: with the description collapsed it fits the
   * first screen, when open it fits once scrolled to. In comparison mode the two variants share the space. */
  function fitLayout() {
    const main = state.dom.main;
    const footer = document.querySelector("footer.controls");
    if (!main || !footer) return;
    const infoOpen = document.querySelector("details.info")?.open;
    const above = infoOpen ? 8 : main.getBoundingClientRect().top + window.scrollY;
    const available = window.innerHeight - footer.offsetHeight - LAYOUT.footerGap - above;
    if (main.classList.contains("single")) {
      main.style.height = UI.clamp(available, LAYOUT.singleMin, LAYOUT.singleMax) + "px";
      return;
    }
    const head = main.querySelector(".vhead")?.offsetHeight || 30;
    const perVariant = Math.floor((available - LAYOUT.variantGap) / 2) - head - 4;
    for (const grid of main.querySelectorAll(".vgrid")) grid.style.height = UI.clamp(perVariant, LAYOUT.variantMin, LAYOUT.variantMax) + "px";
  }

  function renderAll(fromStep) {
    if (!state.runs.length) return;
    if (!fromStep) fitLayout();
    if (state.transitionMs == null) setTransition();
    const total = totalSteps();
    state.dom.counter.textContent = total ? `${state.index + 1} / ${total} lépés` : "0 lépés";
    for (const run of state.runs) renderRun(run, Math.min(state.index, run.steps.length - 1), fromStep);
    const view = currentView();
    if (view.compare) renderCompareCount(view);
    else state.dom.compareCount.style.display = "none";
  }

  function renderRun(run, index, fromStep) {
    const step = run.steps[index];
    const single = run.dom.note == null;
    const noteEl = single ? state.dom.note : run.dom.note;
    const noteClass = single ? "note" : "vnote";
    if (!step) {
      noteEl.textContent = run.error ? "Hiba a lépések előállításakor: " + run.error.message : "Nincs lépés.";
      noteEl.className = noteClass + " err";
      return;
    }
    const prev = index > 0 ? run.steps[index - 1] : null;
    const isLast = index === run.steps.length - 1;

    highlightLine(run, step.line);
    renderVars(run.dom.vars, step, prev);
    run.dom.output.textContent = Engine.outputUpTo(run.steps, index).join("\n");
    run.dom.output.scrollTop = run.dom.output.scrollHeight;
    renderNote(noteEl, noteClass, single, step, run, isLast);
    if (run.def.render) renderStage(run, step, prev, index, isLast, fromStep, noteEl, noteClass);
  }

  function highlightLine(run, lineNumber) {
    const lineEl = run.dom.lines[lineNumber - 1];
    if (run.dom.activeLine && run.dom.activeLine !== lineEl) run.dom.activeLine.classList.remove("active");
    if (lineEl) {
      lineEl.classList.add("active");
      run.dom.activeLine = lineEl;
      scrollIntoBox(run.dom.code, lineEl);
    }
    run.dom.code.classList.toggle("pseudo", showsPseudo(run));
  }

  /** Scrolls `box` so `el` is visible, about a third from the top. */
  function scrollIntoBox(box, el) {
    const top = el.offsetTop, bottom = top + el.offsetHeight;
    const margin = 4;
    if (top < box.scrollTop + margin || bottom > box.scrollTop + box.clientHeight - margin) box.scrollTop = top - box.clientHeight / 3;
  }

  function renderNote(noteEl, noteClass, single, step, run, isLast) {
    let text = step.note || "";
    let kind = "";
    if (isLast && run.truncated) {
      text = (text ? text + " – " : "") + "⚠ Túl hosszú futás ehhez az inputhoz, a lejátszás itt megszakad.";
      kind = " err";
    } else if (isLast && run.error) {
      text = "Hiba a lépések előállításakor: " + run.error.message;
      kind = " err";
    } else if (step.noteKind === "err") kind = " err";
    else if (isLast && !single) kind = " done";
    noteEl.className = noteClass + kind;
    noteEl.innerHTML = "";
    noteEl.appendChild(UI.h("span", { class: "note-lbl", text: single ? "Mi történik? " : "" }));
    noteEl.appendChild(UI.h("span", { text }));
  }

  function renderStage(run, step, prev, index, isLast, fromStep, noteEl, noteClass) {
    const stage = run.dom.stage;
    const ctx = {
      prevStep: prev, input: state.input, theme: state.theme, width: stage.clientWidth, height: stage.clientHeight,
      index, steps: run.steps, transitionMs: state.transitionMs, fromStep, isLast, view: run.def,
    };
    try {
      run.def.render(step, stage, ctx);
    } catch (e) {
      console.error(e);
      noteEl.className = noteClass + " err";
      noteEl.textContent = "Hiba a rajzolásban: " + e.message;
    }
  }

  function renderCompareCount(view) {
    const el = state.dom.compareCount;
    const unit = view.compare.countLabel || "lépés";
    const countKey = view.compare.countVar || "_count";
    // a variant without a counter variable counts its steps
    const countAt = (run, index) => {
      const vars = run.steps[index] && run.steps[index].vars;
      return vars && vars[countKey] != null ? vars[countKey] : index + 1;
    };
    el.style.display = "";
    el.innerHTML = "";
    state.runs.forEach((run, i) => {
      const lastIndex = run.steps.length - 1;
      const index = Math.min(state.index, lastIndex);
      const current = countAt(run, index);
      const done = index === lastIndex;
      if (run.dom.count) run.dom.count.textContent = `${current} ${unit}` + (done ? " · kész ✓" : "");
      if (i) el.appendChild(document.createTextNode(" ·  "));
      el.appendChild(UI.h("span", { class: "cc" + (done ? " done" : "") }, [
        UI.h("b", { text: run.def.label + ": " }),
        `${current} ${unit}`,
        UI.h("span", { class: "fin", text: done ? " ✓" : ` (végül ${countAt(run, lastIndex)})` }),
      ]));
    });
  }

  /* ---------- variables panel ---------- */

  const jsonEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const formatItem = (item) => (typeof item === "string" ? item : UI.py(item));

  function renderVars(box, step, prev) {
    const vars = step.vars || {};
    const prevVars = prev && prev.vars ? prev.vars : null;
    const table = UI.h("table", { class: "vtable" });
    for (const name of Object.keys(vars)) {
      const changed = prevVars && !jsonEqual(vars[name], prevVars[name]);
      table.appendChild(varRow(name, vars[name], changed ? prevVars[name] : undefined, changed));
    }
    if (step.loop) table.appendChild(loopRow(step.loop, !(prev && prev.loop && jsonEqual(prev.loop, step.loop))));
    box.innerHTML = "";
    box.appendChild(table);
    if (step.stack) box.appendChild(stackBox("Hívási verem / verem", step.stack));
    if (step.queue) box.appendChild(rowBox("Sor (queue)", step.queue, "eleje →"));
    if (step.pq) box.appendChild(rowBox("Prioritási sor", step.pq, "legkisebb →"));
  }

  /** Names starting with "_" are helper values shown in italics, not Python variables. */
  function varRow(name, value, prevValue, changed) {
    const helper = name.startsWith("_");
    return UI.h("tr", { class: (helper ? "helper" : "") + (changed ? " changed" : "") }, [
      UI.h("th", { text: helper ? name.slice(1) : name, title: helper ? "segédinformáció (nem Python-változó)" : "" }),
      UI.h("td", {}, [valueEl(value, prevValue)]),
    ]);
  }

  function loopRow(loop, changed) {
    const progress = loop.of != null ? `${loop.iter}/${loop.of}` : `${loop.iter}. iteráció`;
    return UI.h("tr", { class: "loop" + (changed ? " changed" : "") }, [
      UI.h("th", { text: "↻ ciklus" }),
      UI.h("td", { text: `${loop.label} – ${progress}` }),
    ]);
  }

  const isScalarLike = (x) => x === null || typeof x !== "object" || "__t" in x || "__repr" in x;

  function valueEl(value, prevValue) {
    const prevArray = Array.isArray(prevValue) ? prevValue : null;
    if (Array.isArray(value) && value.length && Array.isArray(value[0])) return matrixEl(value, prevArray);
    if (Array.isArray(value) && value.every(isScalarLike)) return arrayEl(value, prevArray);
    return UI.h("code", { text: UI.py(value) });
  }

  function arrayEl(items, prevItems) {
    const row = UI.h("div", { class: "arr" }, items.slice(0, SHOWN.arrayCells).map((item, i) =>
      UI.h("span", { class: "cell" + (prevItems && !jsonEqual(prevItems[i], item) ? " chg" : ""), title: `[${i}]`, text: UI.py(item) })));
    if (!items.length) row.appendChild(UI.h("span", { class: "empty", text: "[ ] üres" }));
    if (items.length > SHOWN.arrayCells) row.appendChild(UI.h("span", { class: "more", text: `… (+${items.length - SHOWN.arrayCells})` }));
    return row;
  }

  function matrixEl(matrix, prevMatrix) {
    if (matrix.length > SHOWN.matrixRows || matrix[0].length > SHOWN.matrixCols) {
      return UI.h("code", { text: `${matrix.length}×${matrix[0].length} táblázat` });
    }
    const changed = (i, j) => prevMatrix && prevMatrix[i] && !jsonEqual(prevMatrix[i][j], matrix[i][j]);
    return UI.h("table", { class: "mtx" }, matrix.map((row, i) => UI.h("tr", {}, row.map((cell, j) =>
      UI.h("td", { class: changed(i, j) ? "chg" : "", text: formatItem(cell) })))));
  }

  const boxTitle = (title, items, hint) => title + (items.length ? ` (${items.length})` : " – üres") + (hint === undefined ? "" : `  ${items.length ? hint : ""}`);

  /** A stack, drawn top first. */
  function stackBox(title, items) {
    const frames = [...items].reverse().map((item, i) => UI.h("div", { class: "frame" + (i === 0 ? " top" : ""), text: formatItem(item) }));
    return UI.h("div", { class: "stackbox" }, [
      UI.h("div", { class: "sub", text: boxTitle(title, items) }),
      UI.h("div", { class: "stack" }, frames),
    ]);
  }

  /** A queue or priority queue, drawn front first in a row. */
  function rowBox(title, items, hint) {
    return UI.h("div", { class: "stackbox" }, [
      UI.h("div", { class: "sub", text: boxTitle(title, items, hint) }),
      UI.h("div", { class: "arr" }, [
        ...items.slice(0, SHOWN.queueCells).map((item, i) => UI.h("span", { class: "cell" + (i === 0 ? " first" : ""), text: formatItem(item) })),
        items.length > SHOWN.queueCells ? UI.h("span", { class: "more", text: `… (+${items.length - SHOWN.queueCells})` }) : null,
      ]),
    ]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { if (document.getElementById("app")) boot(); });
  else if (document.getElementById("app")) boot();
})();
