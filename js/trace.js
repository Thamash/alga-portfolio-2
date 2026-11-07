/* Helpers for the step generators (`function*` mirrors of the Python code). */
(function () {
  "use strict";

  /**
   * Python source with line lookup by content, so generators never hard-code line numbers.
   * @param {string[]} lines
   */
  function source(lines) {
    const trimmed = lines.map((line) => line.trim());

    /**
     * The 1-based number of the line whose trimmed text is `text`.
     * Ambiguous lines need `after`: the line text that precedes the wanted one (e.g. its `def` line).
     */
    function at(text, after) {
      const from = after == null ? 0 : at(after);
      const index = trimmed.indexOf(text, from);
      if (index < 0) throw new Error(`source.at: no line "${text}"` + (after ? ` after "${after}"` : ""));
      if (after == null && trimmed.indexOf(text, index + 1) >= 0) throw new Error(`source.at: "${text}" is ambiguous, pass \`after\``);
      return index + 1;
    }

    /** The code with whole lines replaced, keyed by their trimmed text; indentation and line numbers stay. */
    function fill(replacements) {
      return lines.map((line, i) => {
        const key = trimmed[i];
        return key in replacements ? line.slice(0, line.indexOf(key)) + replacements[key] : line;
      }).join("\n");
    }

    return { lines, text: lines.join("\n"), at, fill };
  }

  /** The call stack shown in the Variables panel. */
  function callStack() {
    const frames = [];
    return {
      /** Runs the generator function `body` with `label` on top of the stack; returns its result. */
      *call(label, body) {
        frames.push(label);
        try {
          return yield* body();
        } finally {
          frames.pop();
        }
      },
      /** A copy of the frames, bottom first (the format of `step.stack`). */
      snapshot: () => [...frames],
      get depth() {
        return frames.length;
      },
    };
  }

  /** The variables that already have a value: Python shows a variable only after its first assignment. */
  const assigned = (vars) => Object.fromEntries(Object.entries(vars).filter(([, value]) => value !== undefined));

  window.Trace = { source, callStack, assigned };
})();
