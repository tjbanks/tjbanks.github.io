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

/* The timeline: point at a year to see everything that overlapped it. */
(function () {
  "use strict";
  var chart = document.getElementById("timeline-chart");
  var readout = document.getElementById("timeline-readout");
  if (!chart || !readout) return;
  var items = Array.prototype.slice.call(chart.querySelectorAll("[data-from]"));
  var cursor = chart.querySelector(".tl-cursor");
  var yearCells = chart.querySelectorAll(".tl-year");
  if (!items.length || !yearCells.length) return;
  var firstYear = parseInt(yearCells[0].getAttribute("data-year"), 10);
  var resting = readout.innerHTML, shown = null, lastPointer = "mouse";

  function show(year) {
    if (year === shown) return;
    shown = year;
    var active = items.filter(function (item) {
      var on = year >= +item.getAttribute("data-from") && year <= +item.getAttribute("data-to");
      item.classList.toggle("is-active", on);
      return on;
    });
    chart.classList.add("has-year");
    if (cursor) {
      cursor.style.gridColumn = String(year - firstYear + 1);
      cursor.hidden = false;
    }
    readout.textContent = "";
    var strong = document.createElement("b");
    strong.textContent = String(year);
    readout.appendChild(strong);
    if (!active.length) {
      readout.appendChild(document.createTextNode("Nothing on the CV is dated to this year."));
      return;
    }
    active.forEach(function (item, i) {
      var link = document.createElement("a");
      link.href = item.getAttribute("href");
      link.textContent = item.getAttribute("data-label");
      readout.appendChild(link);
      readout.appendChild(document.createTextNode(i < active.length - 1 ? "; " : "."));
    });
  }
  function clear() {
    if (shown === null) return;
    shown = null;
    chart.classList.remove("has-year");
    items.forEach(function (item) { item.classList.remove("is-active"); });
    if (cursor) cursor.hidden = true;
    readout.innerHTML = resting;
  }
  function yearAt(clientX) {
    var rect = chart.getBoundingClientRect();
    var column = Math.floor(((clientX - rect.left) / rect.width) * yearCells.length);
    return firstYear + Math.max(0, Math.min(yearCells.length - 1, column));
  }

  chart.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "touch") show(yearAt(e.clientX));
  });
  chart.addEventListener("pointerleave", function (e) {
    if (e.pointerType !== "touch" && !chart.contains(document.activeElement)) clear();
  });
  // On a touch screen a tap picks the year; the list below then links to each entry.
  chart.addEventListener("pointerdown", function (e) {
    lastPointer = e.pointerType;
    if (e.pointerType === "touch") show(yearAt(e.clientX));
  });
  chart.addEventListener("click", function (e) {
    if (lastPointer === "touch" && e.target.closest("a")) e.preventDefault();
  });
  // Keyboard: focusing a bar shows the year it starts in. Focus that comes from
  // a click or tap is left alone, since the pointer has already picked a year.
  chart.addEventListener("focusin", function (e) {
    var item = e.target.closest("[data-from]");
    if (item && item.matches(":focus-visible")) show(+item.getAttribute("data-from"));
  });
  chart.addEventListener("focusout", function (e) {
    if (!chart.contains(e.relatedTarget)) clear();
  });
})();
