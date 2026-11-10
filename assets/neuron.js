/*
 * The trace at the top of the page.
 *
 * It is the fast-spiking PV interneuron from the amygdala theta model
 * (github.com/tjbanks/AmygdalaTheta, template InterneuronCellf in
 * components_homogenous/templates/feng.hoc), ported from NEURON to plain
 * JavaScript: a soma and one dendrite, each with the nainter, kdrinter and
 * leakinter channels, plus the Gfluct_exc / Gfluct_inh background conductances
 * the template adds at the soma. Every constant below is copied from those files.
 *
 * tools/validate-neuron.js checks this port against the cell's saved profile
 * (single_cell_profiles/InterneuronCellf.ipynb): resting potential, input
 * resistance, time constant and the F-I curve.
 *
 * No dependencies. Respects prefers-reduced-motion by drawing one still sweep.
 */
(function (root) {
  "use strict";

  // --- the cell ----------------------------------------------------------

  var PI = Math.PI;

  // Geometry (micrometres) and passive properties, one segment per section.
  var SOMA = { L: 15, diam: 15, Ra: 150 * 22.5, gna: 0.035, gk: 0.008 };
  var DEND = { L: 150, diam: 10, Ra: 150, gna: 0.010, gk: 0.003 };
  var CM = 1;            // uF/cm2
  var G_LEAK = 1 / 20000; // S/cm2 (Rm = 20000 ohm cm2)
  var E_LEAK = -70, E_NA = 45, E_K = -80; // mV

  // Background synaptic bombardment at the soma (Destexhe et al. 2001), in uS.
  var NOISE = {
    exc: { g0: 0.00121, sd: 0.00012, tau: 3, E: 0 },
    inh: { g0: 0.00573, sd: 0.00264, tau: 10.49, E: -75 }
  };

  function areaCm2(sec) { return PI * sec.diam * sec.L * 1e-8; }
  // Axial resistance of half a section, in megohms.
  function halfAxialMohm(sec) {
    var lengthCm = (sec.L / 2) * 1e-4, radiusCm = (sec.diam / 2) * 1e-4;
    return (sec.Ra * lengthCm) / (PI * radiusCm * radiusCm) / 1e6;
  }

  function compartment(sec) {
    var a = areaCm2(sec);
    return {
      C: CM * a * 1e3,          // nF
      gna: sec.gna * a * 1e6,   // uS
      gk: sec.gk * a * 1e6,     // uS
      gl: G_LEAK * a * 1e6,     // uS
      v: E_LEAK, m: 0, h: 0, n: 0
    };
  }

  // Channel kinetics. Each gate relaxes to x_inf with time constant x_tau,
  // where x_inf = a / (a + b) and x_tau = 1 / (a + b).
  function setRest(c) {
    var v = c.v;
    var ma = 2.1 * Math.exp((v + 18.5) / 11.75), mb = 2.1 * Math.exp(-(v + 18.5) / 27);
    var ha = 0.045 * Math.exp(-(v + 29) / 33), hb = 0.045 * Math.exp((v + 29) / 12.2);
    var na = 0.15 * Math.exp((v + 19) / 10.67), nb = 0.15 * Math.exp(-(v + 19) / 42.68);
    c.m = ma / (ma + mb);
    c.h = ha / (ha + hb);
    c.n = na / (na + nb);
  }
  function advanceGates(c, dt) {
    var v = c.v;
    var ma = 2.1 * Math.exp((v + 18.5) / 11.75), mb = 2.1 * Math.exp(-(v + 18.5) / 27);
    var ha = 0.045 * Math.exp(-(v + 29) / 33), hb = 0.045 * Math.exp((v + 29) / 12.2);
    var na = 0.15 * Math.exp((v + 19) / 10.67), nb = 0.15 * Math.exp(-(v + 19) / 42.68);
    // Exact update for a gate at fixed voltage (NEURON's "cnexp").
    c.m += (ma / (ma + mb) - c.m) * (1 - Math.exp(-dt * (ma + mb)));
    c.h += (ha / (ha + hb) - c.h) * (1 - Math.exp(-dt * (ha + hb)));
    c.n += (na / (na + nb) - c.n) * (1 - Math.exp(-dt * (na + nb)));
  }

  /*
   * createCell({ dt, noise, random })
   *   dt      integration step in ms (default 0.025, NEURON's default)
   *   noise   include the background conductances (default true)
   *   random  function returning uniform numbers in [0, 1)
   * Returns { step(currentNa), soma, dend, rin }. step() advances one dt with
   * the given current injected at the soma, in nanoamps.
   */
  function createCell(options) {
    options = options || {};
    var dt = options.dt || 0.025;
    var withNoise = options.noise !== false;
    var random = options.random || Math.random;

    var soma = compartment(SOMA), dend = compartment(DEND);
    var gAxial = 1 / (halfAxialMohm(SOMA) + halfAxialMohm(DEND)); // uS
    setRest(soma);
    setRest(dend);

    var ge1 = 0, gi1 = 0;
    var decayE = Math.exp(-dt / NOISE.exc.tau), decayI = Math.exp(-dt / NOISE.inh.tau);
    var ampE = NOISE.exc.sd * Math.sqrt(1 - Math.exp((-2 * dt) / NOISE.exc.tau));
    var ampI = NOISE.inh.sd * Math.sqrt(1 - Math.exp((-2 * dt) / NOISE.inh.tau));
    function gauss() {
      var u = random() || 1e-12, w = random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * PI * w);
    }

    function step(currentNa) {
      // Total conductance (uS) and the current it drives toward (nA) per compartment.
      var m3hS = soma.m * soma.m * soma.m * soma.h, n4S = soma.n * soma.n * soma.n * soma.n;
      var gS = soma.gna * m3hS + soma.gk * n4S + soma.gl;
      var iS = soma.gna * m3hS * E_NA + soma.gk * n4S * E_K + soma.gl * E_LEAK + (currentNa || 0);
      if (withNoise) {
        // Ornstein-Uhlenbeck conductances, exact update (Gillespie 1996).
        ge1 = decayE * ge1 + ampE * gauss();
        gi1 = decayI * gi1 + ampI * gauss();
        var ge = Math.max(0, NOISE.exc.g0 + ge1), gi = Math.max(0, NOISE.inh.g0 + gi1);
        gS += ge + gi;
        iS += ge * NOISE.exc.E + gi * NOISE.inh.E;
      }
      var m3hD = dend.m * dend.m * dend.m * dend.h, n4D = dend.n * dend.n * dend.n * dend.n;
      var gD = dend.gna * m3hD + dend.gk * n4D + dend.gl;
      var iD = dend.gna * m3hD * E_NA + dend.gk * n4D * E_K + dend.gl * E_LEAK;

      // Backward Euler on the two coupled voltages, as NEURON's fixed-step
      // method does: solve the 2x2 system for the voltages at t + dt.
      var a11 = soma.C / dt + gS + gAxial, a22 = dend.C / dt + gD + gAxial;
      var b1 = (soma.C / dt) * soma.v + iS, b2 = (dend.C / dt) * dend.v + iD;
      var det = a11 * a22 - gAxial * gAxial;
      soma.v = (b1 * a22 + gAxial * b2) / det;
      dend.v = (a11 * b2 + gAxial * b1) / det;

      advanceGates(soma, dt);
      advanceGates(dend, dt);
      return soma.v;
    }

    return { step: step, soma: soma, dend: dend, dt: dt, gAxial: gAxial };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createCell: createCell };
  }
  if (typeof document === "undefined") return;

  // --- the page ------------------------------------------------------------

  var canvas = document.getElementById("trace");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var injectBtn = document.getElementById("trace-inject");
  var pauseBtn = document.getElementById("trace-pause");
  var reducedMotion = root.matchMedia("(prefers-reduced-motion: reduce)");

  var DT = 0.025;           // ms
  var SAMPLE_MS = 0.25;     // ms between stored samples
  var STEPS_PER_SAMPLE = Math.round(SAMPLE_MS / DT);
  var THETA_HZ = 8;         // the basal forebrain input frequency in the model
  var BIAS = 0.15, THETA_AMP = 0.3, INJECT = 0.4; // nA at the soma

  // Small seeded generator so the picture does not depend on Math.random.
  var seed = (Date.now() & 0x7fffffff) || 1;
  function rand() {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  }

  var cell = createCell({ dt: DT, random: rand });
  var t = 0, injecting = false, injectLevel = 0;

  function stepSample() {
    var I = 0, v = 0;
    for (var i = 0; i < STEPS_PER_SAMPLE; i++) {
      // Ease the extra current in and out over a few milliseconds.
      injectLevel += ((injecting ? INJECT : 0) - injectLevel) * (DT / 3);
      I = BIAS + THETA_AMP * Math.sin((2 * PI * THETA_HZ * t) / 1000) + injectLevel;
      v = cell.step(I);
      t += DT;
    }
    push(v, I);
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
    dpr = Math.min(root.devicePixelRatio || 1, 2);
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

    // Voltage occupies the upper part, the injected current a strip below it.
    var vTop = H * 0.06, vBottom = H * 0.70;
    var iTop = H * 0.80, iBottom = H * 0.95;
    var V_MAX = 45, V_MIN = -85, I_MAX = 0.9, I_MIN = -0.25;
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
    ctx.moveTo(0, Math.round(yV(-70)) + 0.5);
    ctx.lineTo(W, Math.round(yV(-70)) + 0.5);
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
  root.addEventListener("pointerup", release);
  root.addEventListener("pointercancel", release);

  if ("IntersectionObserver" in root) {
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
  root.addEventListener("resize", resize);
  // The theme toggle changes the palette; repaint with the new colours.
  new MutationObserver(function () { readColors(); draw(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (root.matchMedia) {
    var scheme = root.matchMedia("(prefers-color-scheme: dark)");
    if (scheme.addEventListener) scheme.addEventListener("change", function () { readColors(); draw(); });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);

  resize();
  sync();
})(typeof window !== "undefined" ? window : this);
