/* Task registry and the home page's task metadata.
 * Loaded as a plain <script> (not an ES module) so it works under file:// too. */
(function () {
  "use strict";

  /** @type {Record<string, object>} */
  window.TASKS = window.TASKS || {};

  /** A task file registers itself with this. */
  window.registerTask = function (def) {
    window.TASKS[def.id] = def;
  };

  window.LEVEL_LABELS = {
    sima: "Sima csoport",
  };

  /** The home page cards: what is known about each task without loading its file. */
  window.TASK_INDEX = [
    { id: "collatz", code: "7/A", title: "Collatz-sorozat", grade: 7, level: "sima",
      topic: ["while-ciklus", "elágazás"],
      summary: "Felezünk vagy háromszorozunk, amíg 1 nem lesz – de hány lépés kell?" },
    { id: "max-search", code: "7/B", title: "Legmagasabb gyerek", grade: 7, level: "sima",
      topic: ["for-ciklus", "maximumkeresés"],
      summary: "Végigmegyünk a soron, és mindig csak az eddigi legmagasabbat jegyezzük meg." },
    { id: "hanoi", code: "10/A", title: "Hanoi tornyai", grade: 10, level: "sima",
      topic: ["rekurzió", "függvény", "hívási verem"],
      summary: "A főpap rábízza a kisebb tornyot a beosztottjára – rekurzió hívási veremmel." },
  ];
})();
