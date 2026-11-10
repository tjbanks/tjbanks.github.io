/*
 * The trace at the top of the page: a single-compartment Hodgkin-Huxley neuron
 * (squid axon parameters, 1952) integrated in the browser and driven by an
 * 8 Hz theta-band current, so it fires a short burst on each cycle.
 * No dependencies. Respects prefers-reduced-motion by drawing one still sweep.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("trace");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var injectBtn = document.getElementById("trace-inject");
  var pauseBtn = document.getElementById("trace-pause");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // --- model -----------------------------------------------------------
  var DT = 0.02;            // ms, integration step
  var SAMPLE_MS = 0.25;     // ms between stored samples
  var STEPS_PER_SAMPLE = Math.round(SAMPLE_MS / DT);
  var THETA_HZ = 8;
  var BIAS = 1, THETA_AMP = 8, INJECT = 14;   // uA/cm^2
  var NOISE_SD = 1.1, NOISE_TAU = 4;          // Ornstein-Uhlenbeck noise

  var V = -65, m = 0.053, h = 0.596, n = 0.318, t = 0, noise = 0;
  var injecting = false, injectLevel = 0;

  // Small seeded generator: the picture should not depend on Math.random quality.
  var seed = (Date.now() & 0x7fffffff) || 1;
  function rand() {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  }
  function gauss() {
    var u = rand() || 1e-9, v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function stepSample() {
    var I = 0;
    for (var i = 0; i < STEPS_PER_SAMPLE; i++) {
      // Ease the injected current in and out over a few milliseconds.
      injectLevel += ((injecting ? INJECT : 0) - injectLevel) * (DT / 3);
      noise += (-noise / NOISE_TAU) * DT + NOISE_SD * Math.sqrt((2 * DT) / NOISE_TAU) * gauss();
      I = BIAS + THETA_AMP * Math.sin((2 * Math.PI * THETA_HZ * t) / 1000) + noise + injectLevel;

      var am = Math.abs(V + 40) < 1e-6 ? 1 : (0.1 * (V + 40)) / (1 - Math.exp(-(V + 40) / 10));
      var bm = 4 * Math.exp(-(V + 65) / 18);
      var ah = 0.07 * Math.exp(-(V + 65) / 20);
      var bh = 1 / (1 + Math.exp(-(V + 35) / 10));
      var an = Math.abs(V + 55) < 1e-6 ? 0.1 : (0.01 * (V + 55)) / (1 - Math.exp(-(V + 55) / 10));
      var bn = 0.125 * Math.exp(-(V + 65) / 80);

      // Exponential Euler on the gates keeps the step stable.
      m += (am / (am + bm) - m) * (1 - Math.exp(-DT * (am + bm)));
      h += (ah / (ah + bh) - h) * (1 - Math.exp(-DT * (ah + bh)));
      n += (an / (an + bn) - n) * (1 - Math.exp(-DT * (an + bn)));

      V += DT * (I - 120 * m * m * m * h * (V - 50) - 36 * n * n * n * n * (V + 77) - 0.3 * (V + 54.387));
      t += DT;
    }
    push(V, I);
  }

  // --- sample buffer (ring) ----------------------------------------------
  var PX_PER_MS = 1.5;      // horizontal scale, CSS pixels per millisecond
  var MS_PER_SECOND = 110;  // simulated milliseconds drawn per real second
  var cap = 0, head = 0, count = 0, bufV, bufI;

  function allocate(widthCss) {
    cap = Math.max(64, Math.ceil(widthCss / PX_PER_MS / SAMPLE_MS) + 2);
    bufV = new Float32Array(cap);
    bufI = new Float32Array(cap);
    head = 0;
    count = 0;
  }
  function push(v, i) {
    bufV[head] = v;
    bufI[head] = i;
    head = (head + 1) % cap;
    if (count < cap) count++;
  }
  function fill() {
    for (var i = 0; i < cap; i++) stepSample();
  }

  // --- drawing -------------------------------------------------------------
  var W = 0, H = 0, dpr = 1, colors = {};

  function readColors() {
    var cs = getComputedStyle(canvas);
    colors.trace = cs.getPropertyValue("--eosin").trim() || "#d6336c";
    colors.current = cs.getPropertyValue("--stain").trim() || "#4a3aa7";
    colors.soft = cs.getPropertyValue("--ink-soft").trim() || "#55517a";
    colors.paper = cs.getPropertyValue("--paper").trim() || "#f7f6fb";
    colors.rule = cs.getPropertyValue("--rule").trim() || "#dcd8ec";
    colors.font = cs.getPropertyValue("font-family") || "sans-serif";
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var widthChanged = Math.round(rect.width) !== W;
    W = Math.round(rect.width);
    H = Math.round(rect.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    if (widthChanged || !bufV) {
      allocate(W);
      fill();
    }
    readColors();
    draw();
  }

  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Voltage occupies the upper part, the stimulus current a strip below it.
    var vTop = H * 0.06, vBottom = H * 0.70;
    var iTop = H * 0.80, iBottom = H * 0.95;
    var V_MAX = 45, V_MIN = -85, I_MAX = 26, I_MIN = -10;
    function yV(v) { return vTop + ((V_MAX - v) / (V_MAX - V_MIN)) * (vBottom - vTop); }
    function yI(i) { return iTop + ((I_MAX - i) / (I_MAX - I_MIN)) * (iBottom - iTop); }
    var dx = SAMPLE_MS * PX_PER_MS;
    var x0 = W - (count - 1) * dx;
    var start = (head - count + cap) % cap;

    // Resting potential reference.
    ctx.strokeStyle = colors.rule;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(0, Math.round(yV(-65)) + 0.5);
    ctx.lineTo(W, Math.round(yV(-65)) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.strokeStyle = colors.current;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (var k = 0; k < count; k++) {
      var yi = yI(bufI[(start + k) % cap]);
      if (k === 0) ctx.moveTo(x0, yi); else ctx.lineTo(x0 + k * dx, yi);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = colors.trace;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    for (var j = 0; j < count; j++) {
      var yv = yV(bufV[(start + j) % cap]);
      if (j === 0) ctx.moveTo(x0, yv); else ctx.lineTo(x0 + j * dx, yv);
    }
    ctx.stroke();

    // Scale bars, as on a recording figure. They sit on a patch of paper so the
    // trace passing behind never tangles with the labels.
    var barMs = W < 600 ? 50 : 100;
    var barH = (40 / (V_MAX - V_MIN)) * (vBottom - vTop);
    var barW = barMs * PX_PER_MS;
    var padX = 12, labelW = 54;
    var boxW = Math.max(barW, labelW + 8) + padX * 2;
    var boxH = barH + 36;
    var edge = Math.max(16, (W - 1120) / 2 + Math.min(48, Math.max(20, W * 0.04)));
    var boxX = W - edge - boxW;
    var boxY = vTop;
    ctx.fillStyle = colors.paper;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    var bx = boxX + padX;
    var by = boxY + 8 + barH;
    ctx.strokeStyle = colors.soft;
    ctx.fillStyle = colors.soft;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(bx, by - barH);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + barW, by);
    ctx.stroke();
    ctx.font = "500 12px " + colors.font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("40 mV", bx + 8, by - barH / 2);
    ctx.textBaseline = "top";
    ctx.fillText(barMs + " ms", bx + 8, by + 7);
  }

  // --- loop ----------------------------------------------------------------
  var running = false, userPaused = false, visible = true, raf = 0, last = 0, carry = 0;

  function frame(now) {
    raf = 0;
    if (!running) return;
    var elapsed = Math.min(now - last, 100);
    last = now;
    carry += (elapsed / 1000) * MS_PER_SECOND / SAMPLE_MS;
    var steps = Math.floor(carry);
    carry -= steps;
    for (var i = 0; i < steps; i++) stepSample();
    draw();
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    var should = !userPaused && visible && !document.hidden && !reducedMotion.matches;
    if (should && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!should && running) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function setInjecting(on) {
    injecting = on;
    if (injectBtn) injectBtn.setAttribute("aria-pressed", on ? "true" : "false");
    // With no animation running, show the effect as a fresh still sweep.
    if (!running) {
      fill();
      draw();
    }
  }

  if (injectBtn) {
    injectBtn.addEventListener("click", function () { setInjecting(!injecting); });
  }
  if (pauseBtn) {
    if (reducedMotion.matches) pauseBtn.hidden = true;
    pauseBtn.addEventListener("click", function () {
      userPaused = !userPaused;
      pauseBtn.setAttribute("aria-pressed", userPaused ? "true" : "false");
      pauseBtn.textContent = userPaused ? "Resume" : "Pause";
      sync();
    });
  }

  // Press and hold on the trace itself injects for as long as it is held.
  var heldByPointer = false;
  canvas.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 || injecting) return;
    heldByPointer = true;
    setInjecting(true);
  });
  function release() {
    if (!heldByPointer) return;
    heldByPointer = false;
    setInjecting(false);
  }
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      sync();
    }).observe(canvas);
  }
  document.addEventListener("visibilitychange", sync);
  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener("change", function () {
      if (pauseBtn) pauseBtn.hidden = reducedMotion.matches;
      sync();
    });
  }
  window.addEventListener("resize", resize);
  // The theme toggle changes the palette; repaint with the new colours.
  new MutationObserver(function () { readColors(); draw(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (window.matchMedia) {
    var scheme = window.matchMedia("(prefers-color-scheme: dark)");
    if (scheme.addEventListener) scheme.addEventListener("change", function () { readColors(); draw(); });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);

  resize();
  sync();
})();
