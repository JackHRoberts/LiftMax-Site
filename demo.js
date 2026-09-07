/* The prescription demo on the homepage.
 *
 * Every constant and formula below is ported from the app's own engine —
 * src/engine/{progression,layoff,warmup}.ts — rather than approximated for the
 * web. That is the entire point of the thing: a visitor dragging these controls
 * is running the same arithmetic the app runs, so if the demo and the app ever
 * disagree, the demo is the bug. Ports are marked with the function they came
 * from; keep them in step.
 *
 * Progressive enhancement: index.html ships a static card showing this demo's
 * default output (82.5 kg, 4 x 8). With JS off that card is simply what the
 * page has always shown. This file reveals the controls and takes over the
 * numbers only once it has run.
 */
(function () {
  'use strict';

  var root = document.getElementById('demo');
  if (!root) return;

  /* ── Ported constants ──────────────────────────────────────────── */

  // progression.ts
  var EPLEY_CONSTANT = 30;
  var MIN_ESTIMATE_RPE = 7;
  var FAILURE_SET_REPS_CEILING = 12;
  var SET_RPE_CREEP = 0.4;
  var BASIS_WINDOW = 3;
  var BASIS_DECAY = 0.5;
  var OVERREACHING_DELTA = 1;
  var TOO_EASY_DELTA = -1.5;
  var TREND_PCT_ADJUST = {
    increase_big: 0.03,
    increase_normal: 0.015,
    hold: 0,
    deload: -0.03
  };

  // progression.ts — GOAL_SCHEMES. Only the goals the demo offers.
  var GOAL_SCHEMES = {
    strength:    { repsLow: 3, repsHigh: 5,  setsLow: 4, setsHigh: 5, pctLow: 0.61,  pctHigh: 0.86,  rpeLow: 7, rpeHigh: 9 },
    hypertrophy: { repsLow: 8, repsHigh: 12, setsLow: 3, setsHigh: 4, pctLow: 0.63,  pctHigh: 0.77,  rpeLow: 7, rpeHigh: 9 },
    general:     { repsLow: 8, repsHigh: 10, setsLow: 3, setsHigh: 3, pctLow: 0.635, pctHigh: 0.755, rpeLow: 7, rpeHigh: 8 }
  };

  // progression.ts — EQUIPMENT_INCREMENTS (kg table).
  var EQUIPMENT_INCREMENTS = {
    barbell: 2.5,
    dumbbell: 2,
    kettlebell: 4,
    machine: 5
  };

  // layoff.ts
  var LAYOFF_MIN_DAYS = 10;
  var LAYOFF_FULL_DAYS = 42;
  var LAYOFF_MIN_REDUCTION = 0.1;
  var LAYOFF_MAX_REDUCTION = 0.2;

  // warmup.ts
  var WARMUP_LADDER = [
    { fraction: 0.4, reps: 5 },
    { fraction: 0.6, reps: 3 },
    { fraction: 0.8, reps: 2 }
  ];
  var MIN_RAMPED_WEIGHT = 40;

  /* ── Ported functions ──────────────────────────────────────────── */

  // progression.ts — rpeFromRir. RPE and reps-in-reserve trade one for one.
  function rpeFromRir(rir) { return 10 - rir; }

  // progression.ts — roundToPlate. Nearest multiple, NOT downward: this is the
  // weight being prescribed, and the app only floors numbers it *displays* as
  // estimates (floorToPlate).
  function roundToPlate(weight, increment) {
    return Math.round(weight / increment) * increment;
  }

  // progression.ts — estimate1RM. RPE-adjusted Epley, with the high-rep
  // truncation rather than a refusal.
  function estimate1RM(weight, reps, rpe, k) {
    if (weight <= 0 || rpe < MIN_ESTIMATE_RPE) return null;
    if (reps === 1) return weight;
    var effectiveReps = Math.min(reps + (10 - rpe), FAILURE_SET_REPS_CEILING);
    return Math.round(weight * (1 + effectiveReps / k) * 10) / 10;
  }

  // progression.ts — lowerBoundOneRepMax, for the one set case. A set rated
  // softer than RPE 7 is not refused, it is priced *as if* it were an RPE 7:
  // that is the most the evidence supports, and understating is the direction
  // to be wrong in.
  function boundedEstimate(weight, reps, rpe, k) {
    var direct = estimate1RM(weight, reps, rpe, k);
    if (direct !== null) return { value: direct, floored: false };
    var floor = estimate1RM(weight, reps, Math.max(rpe, MIN_ESTIMATE_RPE), k);
    return { value: floor === null ? 0 : floor, floored: true };
  }

  // progression.ts — smoothedBasis. Newest first; 4/7, 2/7, 1/7 across the
  // window. No tested maxes in the demo, so the tested-at-head branch is
  // deliberately omitted.
  function smoothedBasis(series) {
    if (series.length === 0) return 0;
    var weighted = 0;
    var total = 0;
    series.slice(0, BASIS_WINDOW).forEach(function (value, i) {
      var weight = Math.pow(BASIS_DECAY, i);
      weighted += weight * value;
      total += weight;
    });
    return Math.round((weighted / total) * 10) / 10;
  }

  // progression.ts — expectedSetRpe. targetRpe applies to the FINAL set;
  // earlier sets are expected to run cooler by SET_RPE_CREEP each.
  function expectedSetRpe(setIndex, targetRpe, totalSets) {
    var setsRemaining = Math.max(totalSets - 1 - setIndex, 0);
    return targetRpe - SET_RPE_CREEP * setsRemaining;
  }

  // progression.ts — repMaxPct. Unrounded fraction of 1RM implied by hitting
  // `reps` at `rpe`.
  function repMaxPct(reps, rpe, k) {
    var effectiveReps = reps + (10 - rpe);
    return 1 / (1 + effectiveReps / k);
  }

  // progression.ts — taperedTarget at sessionFatigue = 0 and minReps = 0, which
  // is the fresh-compound case the demo models: the first exercise of the day,
  // no fatigue accrued. reps collapses to repsLow, RPE to rpeHigh, sets to
  // setsHigh.
  function freshTarget(scheme) {
    return { reps: scheme.repsLow, targetRpe: scheme.rpeHigh, sets: scheme.setsHigh };
  }

  // progression.ts — setOvershoot / meanOvershoot / classifyDelta, for a
  // session summarised by one representative set.
  function classifyOneSet(rpe, reps, targetRpe, targetReps) {
    var expected = expectedSetRpe(0, targetRpe, 1);
    var shortfall = Math.max(targetReps - reps, 0);
    var overshoot = rpe + shortfall - expected;
    var delta = shortfall > 0 ? Math.max(overshoot, shortfall) : overshoot;
    if (delta >= OVERREACHING_DELTA) return 'overreaching';
    if (delta <= TOO_EASY_DELTA) return 'too_easy';
    return 'on_target';
  }

  // progression.ts — computeTrend. previousTrend is null here: the demo has no
  // session before the three on screen, so the deload-repeat guard cannot fire.
  function computeTrend(last3) {
    var easyCount = last3.filter(function (c) { return c === 'too_easy'; }).length;
    var overCount = last3.filter(function (c) { return c === 'overreaching'; }).length;
    if (overCount >= 2) return 'deload';
    if (last3[last3.length - 1] === 'overreaching') return 'hold';
    if (easyCount >= 2) return 'increase_big';
    return 'increase_normal';
  }

  // layoff.ts — layoffReduction.
  function layoffReduction(days) {
    if (days < LAYOFF_MIN_DAYS) return 0;
    var through = Math.min(
      (days - LAYOFF_MIN_DAYS) / (LAYOFF_FULL_DAYS - LAYOFF_MIN_DAYS),
      1
    );
    return LAYOFF_MIN_REDUCTION + through * (LAYOFF_MAX_REDUCTION - LAYOFF_MIN_REDUCTION);
  }

  // layoff.ts — layoffReasonText.
  function layoffReasonText(days) {
    var weeks = Math.floor(days / 7);
    var gap = weeks >= 2 ? weeks + ' weeks' : Math.floor(days) + ' days';
    return 'First session back after ' + gap + ' — starting lighter to rebuild.';
  }

  // warmup.ts — warmupPlan.
  function warmupPlan(workingWeight, increment) {
    if (workingWeight < MIN_RAMPED_WEIGHT || increment <= 0) return [];
    var plan = [];
    WARMUP_LADDER.forEach(function (rung) {
      var weight = Math.round((workingWeight * rung.fraction) / increment) * increment;
      if (weight <= 0 || weight >= workingWeight) return;
      if (plan.length > 0 && weight <= plan[plan.length - 1].weight) return;
      plan.push({ weight: weight, reps: rung.reps });
    });
    return plan;
  }

  // progression.ts — prescribeForTarget, minus the floor/ceiling clamps the
  // demo has no history to supply. Returns the weight and enough of the
  // working to explain itself.
  function prescribe(basis, scheme, target, trend, increment, k) {
    var anchorRpe = expectedSetRpe(0, target.targetRpe, target.sets);
    var anchorPct = repMaxPct(target.reps, anchorRpe, k);
    var trendAdjust = TREND_PCT_ADJUST[trend];

    var rawPct = anchorPct + trendAdjust;
    var anchorInBand = anchorPct >= scheme.pctLow && anchorPct <= scheme.pctHigh;
    var clampPct = function (pct) {
      return anchorInBand ? Math.min(Math.max(pct, scheme.pctLow), scheme.pctHigh) : pct;
    };
    var clampedPct = clampPct(rawPct);
    var clampedEnd = !anchorInBand
      ? null
      : rawPct > scheme.pctHigh ? 'high'
      : rawPct < scheme.pctLow ? 'low'
      : null;

    var weight = roundToPlate(basis * clampedPct, increment);

    // The rounding nudge: a coarse increment can erase a trend entirely, so
    // compare against what a zero-adjustment prescription would have rounded
    // to and step one increment if the trend moved nothing.
    var nudged = false;
    if (basis > 0 && trendAdjust !== 0 && clampedEnd === null) {
      var holdWeight = roundToPlate(basis * clampPct(anchorPct), increment);
      if (weight === holdWeight) {
        weight = trendAdjust > 0
          ? holdWeight + increment
          : Math.max(increment, holdWeight - increment);
        nudged = true;
      }
    }

    return {
      weight: weight,
      anchorPct: anchorPct,
      clampedPct: clampedPct,
      clampedEnd: clampedEnd,
      nudged: nudged
    };
  }

  /* ── Formatting ────────────────────────────────────────────────── */

  // Plate arithmetic lands on values like 82.50000000000001; the grid is never
  // finer than 0.25 kg, so two decimals is always enough to clean that up.
  function fmt(n) {
    return String(Math.round(n * 100) / 100);
  }

  var TREND_LABEL = {
    increase_big: 'Bigger jump than usual',
    increase_normal: 'Normal increase',
    hold: 'Holding',
    deload: 'Backing off'
  };

  // progression.ts — trendReason, keyed on trend alone. The app also keys on
  // the grade that produced the trend; the demo shows the grades separately.
  var TREND_REASON = {
    increase_big: 'Last two sessions landed well under target effort.',
    increase_normal: 'Effort landed in the target band.',
    hold: 'Last session ran hot — holding the load until one comes back clean.',
    deload: 'Two of the last three sessions ran past target effort.'
  };

  var GRADE_LABEL = {
    too_easy: 'too easy',
    on_target: 'on target',
    overreaching: 'overreaching'
  };

  /* ── Wiring ────────────────────────────────────────────────────── */

  var rows = Array.prototype.slice.call(root.querySelectorAll('[data-session]'));
  var goalEl = root.querySelector('[data-goal]');
  var equipEl = root.querySelector('[data-equipment]');
  var daysEl = root.querySelector('[data-days]');
  var daysOut = root.querySelector('[data-days-out]');

  var out = {
    exercise: root.querySelector('[data-out-exercise]'),
    prescription: root.querySelector('[data-out-prescription]'),
    why: root.querySelector('[data-out-why]'),
    basis: root.querySelector('[data-out-basis]'),
    trend: root.querySelector('[data-out-trend]'),
    warmup: root.querySelector('[data-out-warmup]'),
    chart: root.querySelector('[data-out-chart]'),
    steps: root.querySelector('[data-out-steps]')
  };

  // A half-typed field is the normal state of an input someone is editing, so
  // clamp rather than let a transient blank read as a real zero. Weight is
  // allowed to reach 0 — that is the "nothing logged yet" case update() checks
  // for — but a set of no reps is not a thing anyone can log.
  function readRow(row) {
    return {
      weight: Math.max(parseFloat(row.querySelector('[data-weight]').value) || 0, 0),
      reps: Math.max(parseInt(row.querySelector('[data-reps]').value, 10) || 0, 1),
      rir: parseInt(row.querySelector('[data-rir]').value, 10)
    };
  }

  // The e1RM sparkline: three session estimates, plus the smoothed basis drawn
  // as the line the prescription is actually priced off. Signal Cyan for the
  // data, per the palette — the accent stays on the prescription alone.
  function renderChart(estimates, basis, adjustedBasis) {
    var w = 320, h = 84, padX = 6, padY = 12;
    var all = estimates.map(function (e) { return e.value; }).concat([basis, adjustedBasis]);
    var lo = Math.min.apply(null, all);
    var hi = Math.max.apply(null, all);
    var span = hi - lo || 1;
    // A flat series should read as flat, not fill the box, so pad the range.
    var pad = span * 0.6;
    lo -= pad; hi += pad; span = hi - lo;

    var x = function (i) {
      return padX + (i / Math.max(estimates.length - 1, 1)) * (w - padX * 2);
    };
    var y = function (v) {
      return padY + (1 - (v - lo) / span) * (h - padY * 2);
    };

    // Oldest on the left, which is the reverse of the newest-first series the
    // basis is computed from.
    var pts = estimates.slice().reverse();
    var line = pts.map(function (e, i) { return x(i) + ',' + y(e.value); }).join(' ');
    var dots = pts.map(function (e, i) {
      return '<circle cx="' + x(i) + '" cy="' + y(e.value) + '" r="3.5" class="dot' +
        (e.floored ? ' dot-floored' : '') + '"/>';
    }).join('');

    var basisY = y(adjustedBasis);
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Estimated one-rep max across the three sessions, and the smoothed basis the next weight is priced from.">' +
      '<line x1="' + padX + '" y1="' + basisY + '" x2="' + (w - padX) + '" y2="' + basisY + '" class="basis-line"/>' +
      '<polyline points="' + line + '" class="trend-line"/>' +
      dots +
      '</svg>';
  }

  function update() {
    var goal = goalEl.value;
    var scheme = GOAL_SCHEMES[goal];
    var equipment = equipEl.value;
    var increment = EQUIPMENT_INCREMENTS[equipment];
    var days = parseInt(daysEl.value, 10);
    var k = EPLEY_CONSTANT;

    var target = freshTarget(scheme);

    // Rows are laid out oldest-first on screen, because that is how a training
    // log reads. Everything downstream wants newest-first.
    var sessions = rows.map(readRow);
    var newestFirst = sessions.slice().reverse();

    var estimates = newestFirst.map(function (s) {
      return boundedEstimate(s.weight, s.reps, rpeFromRir(s.rir), k);
    });

    var basis = smoothedBasis(estimates.map(function (e) { return e.value; }));
    var reduction = layoffReduction(days);
    var adjustedBasis = Math.round(basis * (1 - reduction) * 10) / 10;

    // Grades are computed oldest-first, because computeTrend reads the last
    // element of its window as "most recent".
    var grades = sessions.map(function (s) {
      return classifyOneSet(rpeFromRir(s.rir), s.reps, target.targetRpe, target.reps);
    });
    var trend = computeTrend(grades);

    var result = prescribe(adjustedBasis, scheme, target, trend, increment, k);

    /* Outputs */

    // No basis, no weight. The app draws the same line — getPrefillForExercise
    // guards on progressionBasis > 0 — and showing "0 kg" instead would be
    // claiming a prescription the engine has no grounds for.
    if (adjustedBasis <= 0) {
      out.prescription.textContent = '— · ' + target.sets + ' × ' + target.reps;
      out.why.textContent = 'Nothing logged to price this off yet. Put a weight against a session ' +
        'and the estimate — and the prescription with it — has something to work from.';
      out.basis.textContent = '—';
      out.trend.textContent = '—';
      out.trend.dataset.trend = '';
      out.warmup.textContent = '—';
      out.chart.innerHTML = '';
      out.steps.innerHTML = '';
      daysOut.textContent = days === 0 ? 'trained recently' : days + (days === 1 ? ' day' : ' days');
      return;
    }

    out.prescription.textContent = fmt(result.weight) + ' kg · ' + target.sets + ' × ' + target.reps;

    var why = [];
    if (reduction > 0) {
      why.push(layoffReasonText(days));
    } else {
      why.push(TREND_REASON[trend]);
    }
    why.push(
      'Priced off a ' + fmt(adjustedBasis) + ' kg estimated max at ' +
      Math.round(result.clampedPct * 100) + '% — rounded to the nearest ' +
      fmt(increment) + ' kg you can actually load.'
    );
    if (result.clampedEnd === 'high') {
      why.push('Clamped at the top of what this goal treats as sustainable.');
    } else if (result.clampedEnd === 'low') {
      why.push('Held at this goal’s lightest percentage.');
    }
    if (result.nudged) {
      why.push('The ' + fmt(increment) + ' kg step is coarse enough to swallow the increase, so it moves one notch instead.');
    }
    out.why.textContent = why.join(' ');

    out.basis.textContent = fmt(adjustedBasis) + ' kg';
    out.trend.textContent = TREND_LABEL[trend];
    out.trend.dataset.trend = trend;

    var warmups = warmupPlan(result.weight, increment);
    out.warmup.textContent = warmups.length
      ? warmups.map(function (s) { return fmt(s.weight) + ' × ' + s.reps; }).join('  ·  ')
      : 'Light enough that the working set is its own warm-up.';

    out.chart.innerHTML = renderChart(estimates, basis, adjustedBasis);

    // The working, session by session. Oldest first to match the rows.
    var stepsHtml = estimates.slice().reverse().map(function (e, i) {
      var s = sessions[i];
      return '<li><span class="step-in">' + fmt(s.weight) + ' × ' + s.reps +
        ' @ ' + s.rir + ' in reserve</span>' +
        '<span class="step-out">' + fmt(e.value) + ' kg' +
        (e.floored ? ' <em>lower bound</em>' : '') + '</span>' +
        '<span class="step-grade" data-grade="' + grades[i] + '">' + GRADE_LABEL[grades[i]] + '</span></li>';
    }).join('');
    out.steps.innerHTML = stepsHtml;

    daysOut.textContent = days === 0
      ? 'trained recently'
      : days + (days === 1 ? ' day' : ' days') +
        (reduction > 0 ? ' · −' + Math.round(reduction * 100) + '%' : ' · no reduction yet');
  }

  root.addEventListener('input', update);
  root.addEventListener('change', update);

  // Reveal the controls only now that the engine is live — with JS off the
  // static card stands on its own and no dead inputs are shown.
  Array.prototype.forEach.call(root.querySelectorAll('[data-js-only]'), function (el) {
    el.hidden = false;
  });
  root.classList.add('demo-live');

  update();
})();
