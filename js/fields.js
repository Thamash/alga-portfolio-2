/* Input field types of the input form. Each type builds an editor ({ el, set, get }) and (de)serializes
 * its value for the URL. get() validates and throws a Hungarian message string for invalid input. */
(function () {
  "use strict";

  const INT_RE = /^-?\d+$/;

  function rangeText(field) {
    if (field.min != null && field.max != null) return `${field.min} és ${field.max} között`;
    if (field.min != null) return `legalább ${field.min}`;
    if (field.max != null) return `legfeljebb ${field.max}`;
    return "";
  }

  function checkRange(field, n, what) {
    const tooSmall = field.min != null && n < field.min;
    const tooLarge = field.max != null && n > field.max;
    if (tooSmall || tooLarge) throw `${what}: ${rangeText(field)} legyen (most ${n}).`;
  }

  /** An editor around a single <input>/<textarea> whose value is read by `parse`. */
  function simpleEditor(el, format, parse) {
    return {
      el,
      set(value) { el.value = value == null ? "" : format(value); },
      get: () => parse(el.value),
    };
  }

  const identity = (x) => x;

  const TYPES = {
    int: {
      build: (field) => simpleEditor(
        UI.h("input", { type: "number", min: field.min, max: field.max, step: 1, class: "inp" }),
        identity,
        (raw) => {
          const text = raw.trim();
          if (!INT_RE.test(text)) throw `${field.label}: egész számot adj meg.`;
          const n = Number(text);
          checkRange(field, n, field.label);
          return n;
        }),
      encode: (value) => String(value),
      decode: (text) => Number(text),
    },

    intList: {
      build(field) {
        const input = UI.h("input", { type: "text", class: "inp", placeholder: "pl. 5, 3, 8" });
        return simpleEditor(input, (list) => list.join(", "), (raw) => {
          const parts = raw.split(/[\s,;]+/).filter(Boolean);
          for (const part of parts) if (!INT_RE.test(part)) throw `${field.label}: csak egész számok lehetnek, vesszővel elválasztva („${part}” nem az).`;
          let numbers = parts.map(Number);
          if (field.minLen != null && numbers.length < field.minLen) throw `${field.label}: legalább ${field.minLen} szám kell (most ${numbers.length}).`;
          if (field.maxLen != null && numbers.length > field.maxLen) throw `${field.label}: legfeljebb ${field.maxLen} szám lehet (most ${numbers.length}).`;
          for (const n of numbers) checkRange(field, n, field.label + " eleme");
          if (field.distinct && new Set(numbers).size !== numbers.length) throw `${field.label}: a számok legyenek különbözők.`;
          if (field.sorted) {
            numbers = [...numbers].sort((a, b) => a - b);
            input.value = numbers.join(", ");
          }
          return numbers;
        });
      },
      encode: (list) => list.join(","),
      decode: (text) => text.split(",").filter(Boolean).map(Number),
    },

    string: {
      build: (field) => simpleEditor(UI.h("input", { type: "text", class: "inp", maxlength: field.maxLen }), identity, (text) => {
        if (field.maxLen != null && text.length > field.maxLen) throw `${field.label}: legfeljebb ${field.maxLen} karakter.`;
        if (field.minLen != null && text.length < field.minLen) throw `${field.label}: legalább ${field.minLen} karakter.`;
        return text;
      }),
      encode: identity,
      decode: identity,
    },

    textarea: {
      build: (field) => simpleEditor(UI.h("textarea", { class: "inp ta", rows: field.rows || 10, spellcheck: "false" }), identity, (raw) => {
        const text = raw.replace(/\r\n/g, "\n");
        if (field.maxLen != null && text.length > field.maxLen) throw `${field.label}: túl hosszú (legfeljebb ${field.maxLen} karakter).`;
        if (!text.trim()) throw `${field.label}: üres.`;
        return text;
      }),
      encode: identity,
      decode: identity,
    },
  };

  window.Fields = { TYPES };
})();
