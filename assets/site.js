/* Theme toggle and the "you are here" mark in the navigation. */
(function () {
  "use strict";
  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  function current() {
    return root.getAttribute("data-theme") || (prefersDark.matches ? "dark" : "light");
  }
  function label() {
    if (!toggle) return;
    var next = current() === "dark" ? "light" : "dark";
    toggle.textContent = next === "dark" ? "Dark" : "Light";
    toggle.setAttribute("aria-label", "Switch to " + next + " theme");
  }
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      label();
    });
    if (prefersDark.addEventListener) prefersDark.addEventListener("change", label);
    label();
  }

  var links = document.querySelectorAll(".nav-links a[href^='#']");
  if (!links.length || !("IntersectionObserver" in window)) return;
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      links.forEach(function (a) { a.removeAttribute("aria-current"); });
      var link = byId[entry.target.id];
      if (link) link.setAttribute("aria-current", "true");
    });
  }, { rootMargin: "-20% 0px -75% 0px" });
  Object.keys(byId).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) observer.observe(el);
  });
})();

/* The segmentation figure: draw the outline once when it scrolls into view. */
(function () {
  "use strict";
  var figure = document.getElementById("slide");
  if (!figure || !("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var replay = document.getElementById("slide-replay");

  figure.classList.add("is-armed");
  function trace() {
    figure.classList.remove("is-traced");
    void figure.offsetWidth; // restart the transition
    figure.classList.add("is-traced");
  }
  var observer = new IntersectionObserver(function (entries) {
    if (!entries[0].isIntersecting) return;
    observer.disconnect();
    trace();
    if (replay) replay.hidden = false;
  }, { threshold: 0.5 });
  observer.observe(figure);
  if (replay) replay.addEventListener("click", trace);
})();
