#!/usr/bin/env node
/* Acceptance check in Node, without a browser. For every task:
 *  - the generator runs on the presets, the questions' inputs and a few random inputs without reaching maxSteps,
 *  - every step points to an existing, executable line (not empty, def/class/comment/else),
 *  - the pseudo code has as many lines as the Python code,
 *  - the Python code REALLY runs with python3 and its output equals the Output panel.
 *
 * Usage:  node tools/check.js [id ...] [--no-python] [--export] [--random=N]
 *   --export   writes each task's Python code (first preset) with its input files into python/.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PYTHON_TIMEOUT_MS = 20000;
const NON_EXECUTABLE = /^\s*(def |class |#|import |from \S+ import |else:|try:|except|@)/;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")).map((a) => a.split("=")[0]));
const randomCount = Number((args.find((a) => a.startsWith("--random=")) || "--random=3").split("=")[1]);

globalThis.window = globalThis;
const load = (rel) => vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel });
["js/registry.js", "js/ui.js", "js/trace.js", "js/engine.js"].forEach(load);

const requestedIds = args.filter((a) => !a.startsWith("--"));
const ids = requestedIds.length
  ? requestedIds
  : window.TASK_INDEX.map((t) => t.id).filter((id) => fs.existsSync(path.join(ROOT, "js/tasks", id + ".js")));

let failures = 0, checks = 0;
const pythonCache = new Map();

function fail(where, message) {
  failures++;
  console.log(`  ✗ ${where}: ${message}`);
}

/** Runs `code` as main.py in a temporary directory with `files` next to it; returns stdout, stderr and new files. */
function runPython(code, stdin, files) {
  const key = JSON.stringify([code, stdin, files]);
  if (pythonCache.has(key)) return pythonCache.get(key);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alga-"));
  fs.writeFileSync(path.join(dir, "main.py"), code);
  for (const [name, content] of Object.entries(files || {})) fs.writeFileSync(path.join(dir, name), content);
  const proc = spawnSync("python3", ["-I", "main.py"], { cwd: dir, input: stdin || "", encoding: "utf8", timeout: PYTHON_TIMEOUT_MS });
  const result = { out: proc.stdout || "", err: proc.stderr || "", status: proc.status, files: {} };
  for (const name of fs.readdirSync(dir)) {
    if (name !== "main.py" && !(files && name in files)) result.files[name] = fs.readFileSync(path.join(dir, name), "utf8");
  }
  fs.rmSync(dir, { recursive: true, force: true });
  pythonCache.set(key, result);
  return result;
}

/** Normalizes line endings and trailing whitespace before comparing outputs. */
const normalizeText = (text) => text.replace(/\r\n/g, "\n").split("\n").map((line) => line.replace(/\s+$/, "")).join("\n").replace(/\n+$/, "");

function fieldDefaults(task) {
  const defaults = {};
  for (const field of task.inputs || []) defaults[field.name] = field.default;
  return defaults;
}

function inputsFor(task) {
  const defaults = fieldDefaults(task);
  const list = (task.presets || []).map((preset) => ({ label: `preset „${preset.label}”`, input: { ...defaults, ...preset.values } }));
  (task.questions || []).forEach((question, i) => {
    if (question.try && question.try.values) list.push({ label: `kérdés #${i + 1}`, input: { ...defaults, ...question.try.values } });
  });
  if (task.randomInput) {
    for (let k = 1; k <= randomCount; k++) list.push({ label: `véletlen #${k}`, input: { ...defaults, ...task.randomInput(UI.rng(1000 + k)) } });
  }
  return list;
}

/** The checked runs of a view: one per comparison variant, otherwise the view itself. */
const namedDefs = (view) => Engine.runDefs(view).map((def) => ({ def, name: view.compare ? `${view.id}/${def.id}` : view.id }));

function checkMeta(task) {
  const meta = window.TASK_INDEX.find((t) => t.id === task.id);
  if (!meta) return fail("meta", "nincs a TASK_INDEX-ben");
  for (const key of ["title", "grade", "level"]) if (meta[key] !== task[key]) fail("meta", `${key} eltér: registry=${meta[key]} task=${task[key]}`);
  if (!task.intro) fail("meta", "hiányzik az intro");
  if (!task.presets || !task.presets.length) fail("meta", "nincs preset");
  checkQuestions(task);
}

function checkQuestions(task) {
  const questions = task.questions || [];
  if (questions.length < 3) fail("meta", "questions: legalább 3 kérdés kell");
  const views = Engine.getViews(task);
  questions.forEach((question, i) => {
    const where = `questions[${i}]`;
    if (!question.q || !question.a) fail("meta", `${where}: hiányzik a q vagy az a`);
    const target = question.try;
    if (!target) return;
    const view = target.tab ? views.find((v) => v.id === target.tab) : views[0];
    if (!view) return fail("meta", `${where}.try: nincs ilyen fül: ${target.tab}`);
    if (target.step == null) return;
    const input = { ...Engine.defaultInput(task), ...(target.values || {}) };
    const stepCount = Math.max(...Engine.runDefs(view).map((def) => Engine.collect(def, input).steps.length));
    if (!(target.step >= 0 && target.step < stepCount)) fail("meta", `${where}.try.step=${target.step}, de csak ${stepCount} lépés van`);
  });
}

function checkDef(def, name, input, label, needPseudo) {
  const where = `${name} · ${label}`;
  checks++;
  const code = Engine.resolve(def.pythonCode, input);
  if (!code) return fail(where, "nincs pythonCode");
  const lines = code.split("\n");
  const pseudo = Engine.resolve(def.pseudoCode, input);
  if (pseudo && pseudo.length !== lines.length) fail(where, `pszeudokód ${pseudo.length} sor, Python ${lines.length} sor`);
  if (needPseudo && !pseudo) fail(where, "7–8. évfolyamon kötelező a pszeudokód");

  const { steps, truncated, error } = Engine.collect(def, input);
  if (error) return fail(where, "generátor hiba: " + (error.stack || error));
  if (truncated && !def.allowTruncate) fail(where, `elérte a maxSteps-et (${steps.length})`);
  if (!steps.length) return fail(where, "nincs egy lépés sem");
  checkStepLines(where, steps, lines);
  if (!flags.has("--no-python") && def.pythonCheck !== false) checkAgainstPython(where, def, input, code, steps, truncated);
}

function checkStepLines(where, steps, lines) {
  steps.forEach((step, i) => {
    const line = lines[step.line - 1];
    if (!Number.isInteger(step.line) || line === undefined) fail(where, `${i}. lépés: nem létező sor (${step.line})`);
    else if (!line.trim()) fail(where, `${i}. lépés: üres sorra mutat (${step.line})`);
    else if (NON_EXECUTABLE.test(line)) fail(where, `${i}. lépés: nem végrehajtható sorra mutat (${step.line}: ${line.trim()})`);
    if (step.vars) for (const [name, value] of Object.entries(step.vars)) if (value === undefined) fail(where, `${i}. lépés: undefined változó: ${name}`);
  });
}

function checkAgainstPython(where, def, input, code, steps, truncated) {
  const stdin = Engine.resolve(def.pythonStdin, input) || "";
  const files = Engine.resolve(def.pythonFiles, input) || {};
  const result = runPython(code, stdin, files);
  if (result.status !== 0) return fail(where, "a Python futás hibával állt le:\n" + result.err.split("\n").slice(-6).join("\n"));
  const expected = normalizeText(result.out);
  const actual = normalizeText(Engine.outputUpTo(steps, steps.length - 1).join("\n"));
  if (truncated) {
    if (!expected.startsWith(actual)) fail(where, "a (megszakított) output nem a Python-kimenet eleje");
  } else if (expected !== actual) {
    const a = expected.split("\n"), b = actual.split("\n");
    let k = 0;
    while (k < a.length && a[k] === b[k]) k++;
    fail(where, `output eltér a(z) ${k + 1}. sorban:\n      Python: ${JSON.stringify(a[k])}\n      lejátszó: ${JSON.stringify(b[k])}`);
  }
  if (!def.checkOutFiles) return;
  for (const [name, content] of Object.entries(def.checkOutFiles(steps) || {})) {
    if (!(name in result.files)) fail(where, `a Python nem írta meg: ${name}`);
    else if (normalizeText(result.files[name]) !== normalizeText(content)) fail(where, `${name} tartalma eltér`);
  }
}

/** Writes python/<id>[-tab][-variant].py for the first preset, plus its stdin (.be.txt) and input files. */
function exportPython(task) {
  const views = Engine.getViews(task);
  const input = Engine.defaultInput(task);
  const outDir = path.join(ROOT, "python");
  fs.mkdirSync(outDir, { recursive: true });
  const written = new Set();
  for (const view of views) {
    for (const def of Engine.runDefs(view)) {
      let base = task.id;
      if (views.length > 1 && view.id !== "main") base += "-" + view.id;
      if (view.compare) base += "-" + def.id;
      const code = Engine.resolve(def.pythonCode, input);
      if (written.has(code)) continue;
      written.add(code);
      fs.writeFileSync(path.join(outDir, base + ".py"), code.replace(/\n*$/, "\n"));
      const stdin = Engine.resolve(def.pythonStdin, input);
      if (stdin) fs.writeFileSync(path.join(outDir, base + ".be.txt"), stdin);
      for (const [name, content] of Object.entries(Engine.resolve(def.pythonFiles, input) || {})) fs.writeFileSync(path.join(outDir, name), content);
    }
  }
}

function checkTask(id) {
  const file = path.join(ROOT, "js/tasks", id + ".js");
  if (!fs.existsSync(file)) {
    console.log(`${id}: nincs ilyen fájl`);
    failures++;
    return;
  }
  try {
    load("js/tasks/" + id + ".js");
  } catch (e) {
    return fail(id, "betöltési hiba: " + e.stack);
  }
  const task = window.TASKS[id];
  if (!task) return fail(id, "nem regisztrált");
  const before = failures;
  console.log(`${id}:`);
  checkMeta(task);
  const views = Engine.getViews(task);
  const gradeNeedsPseudo = task.grade === 7 || task.grade === 8;
  for (const { label, input } of inputsFor(task)) {
    const invalid = task.validate && task.validate(input);
    if (invalid) {
      fail(label, "a validate elutasítja: " + invalid);
      continue;
    }
    views.forEach((view, viewIndex) => {
      const needPseudo = gradeNeedsPseudo && viewIndex === 0 && !view.compare;
      for (const { def, name } of namedDefs(view)) checkDef(def, name, input, label, needPseudo);
    });
  }
  if (flags.has("--export")) exportPython(task);
  console.log(failures === before ? "  ✓ rendben" : `  ${failures - before} hiba`);
}

ids.forEach(checkTask);
console.log(`\n${checks} ellenőrzött futás, ${failures} hiba.`);
process.exit(failures ? 1 : 0);
