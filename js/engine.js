/* The player's pure logic: views (tabs), step collection, output. No DOM, so tools/check.js uses it in Node too. */
(function () {
  "use strict";

  const DEFAULT_MAX_STEPS = 5000;
  /** Step fields inherited from the previous step when a generator omits them (null clears them). */
  const INHERITED = ["vars", "visual", "loop", "stack", "queue", "pq", "phase"];

  /** A task field may be a value or a function of the input (e.g. pythonCode with the input substituted). */
  const resolve = (value, input) => (typeof value === "function" ? value(input) : value);

  /** The task's views (tabs). Without tabs: one main view, plus a comparison tab when the task has `compare`. */
  function getViews(task) {
    const base = {
      pythonCode: task.pythonCode, pseudoCode: task.pseudoCode, generate: task.generate, render: task.render,
      maxSteps: task.maxSteps, dimLines: task.dimLines, pythonStdin: task.pythonStdin, pythonFiles: task.pythonFiles,
      notes: null, compare: null,
    };
    if (task.tabs && task.tabs.length) return task.tabs.map((tab) => withVariants({ ...base, ...tab }));
    const views = [];
    if (task.generate) views.push({ ...base, id: "main", label: task.mainLabel || task.title });
    if (task.compare) views.push(withVariants({ ...base, id: "compare", label: task.compare.title, compare: task.compare }));
    return views;
  }

  /** Comparison variants inherit the view's fields they do not set themselves. */
  function withVariants(view) {
    if (!view.compare) return view;
    const inherited = {
      render: view.render, maxSteps: view.maxSteps, pythonStdin: view.pythonStdin, pythonFiles: view.pythonFiles,
      dimLines: null, pseudoCode: null,
    };
    return { ...view, compare: { ...view.compare, variants: view.compare.variants.map((variant) => ({ ...inherited, ...variant })) } };
  }

  /** The runs a view consists of: one per comparison variant, otherwise the view itself. */
  const runDefs = (view) => (view.compare ? view.compare.variants : [view]);

  /** The input the player starts with: field defaults, overridden by the first preset. */
  function defaultInput(task) {
    const input = {};
    for (const field of task.inputs || []) input[field.name] = field.default;
    if (task.presets && task.presets[0]) Object.assign(input, task.presets[0].values);
    return input;
  }

  /** Collects the generator's steps, stopping at maxSteps. */
  function collect(def, input, maxSteps) {
    const limit = maxSteps || def.maxSteps || DEFAULT_MAX_STEPS;
    const ctx = { rng: UI.rng(UI.hash(JSON.stringify(input))), emitLimit: limit, input };
    const steps = [];
    let truncated = false, error = null;
    try {
      for (const step of def.generate(input, ctx)) {
        steps.push(step);
        if (steps.length >= limit) {
          truncated = true;
          break;
        }
      }
    } catch (e) {
      error = e;
      if (typeof console !== "undefined") console.error(e);
    }
    normalize(steps);
    return { steps, truncated, error };
  }

  /** Fills the INHERITED fields a step omitted from the previous step. */
  function normalize(steps) {
    let prev = {};
    for (const step of steps) {
      for (const key of INHERITED) if (step[key] === undefined) step[key] = prev[key] === undefined ? null : prev[key];
      prev = step;
    }
    return steps;
  }

  /** The Output panel's lines up to step `index` (one line per print). */
  function outputUpTo(steps, index) {
    const lines = [];
    for (let i = 0; i <= index && i < steps.length; i++) if (steps[i].output != null) lines.push(steps[i].output);
    return lines;
  }

  window.Engine = { getViews, runDefs, defaultInput, collect, normalize, outputUpTo, resolve, DEFAULT_MAX_STEPS };
})();
