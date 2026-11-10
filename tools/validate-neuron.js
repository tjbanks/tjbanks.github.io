#!/usr/bin/env node
/*
 * Checks the JavaScript port in assets/neuron.js against the numbers saved for
 * the original NEURON cell in tjbanks/AmygdalaTheta,
 * single_cell_profiles/InterneuronCellf.ipynb (bmtool's single-cell Profiler).
 *
 *   node tools/validate-neuron.js
 *
 * Exits non-zero if the port has drifted from the reference.
 */
"use strict";
const { createCell, meanFiringRate } = require("../assets/neuron.js");

const REF = {
  vRest: -70.0,          // mV
  rIn: 371.22,           // megohms
  tau: 19.9,             // ms
  fiAmps: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],            // nA
  fiSpikes: [0, 2, 18, 49, 79, 102, 120, 135, 148, 160, 170]                 // per 1000 ms
};

function seeded(seed) {
  let s = seed;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

// Passive properties: no background noise, -0.1 nA step for one second.
function passive() {
  const dt = 0.025;
  const cell = createCell({ dt, noise: false });
  for (let t = 0; t < 200; t += dt) cell.step(0);
  const vRest = cell.soma.v;
  const trace = [];
  for (let t = 0; t < 1000; t += dt) trace.push(cell.step(-0.1));
  const vFinal = trace[trace.length - 1];
  const target = vRest - (vRest - vFinal) * 0.632;
  const tau = trace.findIndex((v) => v <= target) * dt;
  return { vRest, rIn: (vRest - vFinal) / 0.1, tau };
}

// F-I curve: background noise on, a one-second step at each amplitude.
function spikesAt(amp, seed) {
  const dt = 0.025;
  const cell = createCell({ dt, random: seeded(seed) });
  for (let t = 0; t < 50; t += dt) cell.step(0);
  let count = 0, above = false;
  for (let t = 0; t < 1000; t += dt) {
    const v = cell.step(amp);
    if (v > 0 && !above) { count++; above = true; }
    if (v < -20) above = false;
  }
  return count;
}

let failed = false;
function check(label, got, want, tolerance, unit) {
  const ok = Math.abs(got - want) <= tolerance;
  if (!ok) failed = true;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${label.padEnd(22)} port ${got.toFixed(2).padStart(8)}   NEURON ${String(want).padStart(7)} ${unit}`
  );
}

const p = passive();
check("resting potential", p.vRest, REF.vRest, 0.05, "mV");
check("input resistance", p.rIn, REF.rIn, 2, "MOhm");
check("time constant", p.tau, REF.tau, 0.5, "ms");

console.log("\nF-I curve (spikes in 1000 ms; port = mean of 10 noise seeds)");
const seeds = [11, 23, 37, 41, 59, 67, 73, 89, 97, 123];
REF.fiAmps.forEach((amp, i) => {
  const counts = seeds.map((s) => spikesAt(amp, s));
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const want = REF.fiSpikes[i];
  // The noise differs draw for draw from NEURON's Random123 stream, so allow
  // a few spikes near threshold and 5% above it.
  const tolerance = Math.max(6, want * 0.05);
  const ok = Math.abs(mean - want) <= tolerance;
  if (!ok) failed = true;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${amp.toFixed(1)} nA   port ${mean.toFixed(1).padStart(6)}  (${Math.min(...counts)}-${Math.max(...counts)})   NEURON ${String(want).padStart(4)}`
  );
});

// The rate shown beside the sliders comes from meanFiringRate. With the rhythm
// off it should land on the same F-I curve.
console.log("\nRate readout with the rhythm off (steady current)");
[[0.2, 18], [0.5, 102], [1.0, 170]].forEach(([amp, want]) => {
  check(`readout at ${amp.toFixed(1)} nA`, meanFiringRate({ bias: amp, amplitude: 0.3, hz: 0 }), want, Math.max(6, want * 0.05), "spikes/s");
});
const started = Date.now();
const dflt = meanFiringRate({ bias: 0.15, amplitude: 0.3, hz: 8 });
console.log(`\nDefault page settings (0.15 nA + 0.3 nA sine at 8 Hz): ${dflt.toFixed(1)} spikes/s, computed in ${Date.now() - started} ms`);

process.exit(failed ? 1 : 0);
