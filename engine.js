/* Locked CKM model inference. No dependencies, networking, storage or training. */
(function (root) {
  'use strict';
  const labels = ['bicarbonate', 'respiratory rate', 'stroke status', 'white blood cell count', 'blood urea nitrogen', 'atrial fibrillation status', 'mean arterial pressure', 'age', 'SHR'];
  function validate(input, model) {
    return model.variables.map((key, i) => {
      const v = input[key];
      if (v === null && model.missing_indices.includes(i)) return null;
      if (i === 8 && (v === null || v === undefined)) throw new Error('SHR is required. The locked model has no SHR imputer; enter the calculated SHR.');
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Enter a valid value for ${labels[i]}.`);
      if ((i === 2 || i === 5) && v !== 0 && v !== 1) throw new Error('Select Yes or No for stroke and atrial fibrillation. Unknown status must not be entered as No.');
      if (i === 7 && (v < 18 || v > 120)) throw new Error('Age must be between 18 and 120 years.');
      if ([0,1,3,6,8].includes(i) && v <= 0) throw new Error(`The value for ${labels[i]} must be greater than 0. Check the units.`);
      if (i === 4 && v < 0) throw new Error('Blood urea nitrogen must not be negative.');
      if (!Number.isFinite(Math.fround(v))) throw new Error(`The value for ${labels[i]} exceeds the model’s numeric range.`);
      return v;
    });
  }
  function matchDonor(b, prediction, rank) {
    const d = b.prediction;
    let lo = 0, hi = d.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (d[mid] < prediction) lo = mid + 1; else hi = mid; }
    let l = lo - 1, r = lo, selected;
    for (let k = 0; k < rank; k++) {
      if (l >= 0 && (r === d.length || prediction - d[l] < d[r] - prediction)) selected = l--;
      else selected = r++;
    }
    return b.value[selected];
  }
  function predict(input, model = root.CKM_MODEL) {
    if (!model) throw new Error('The model has not loaded. Refresh the page.');
    const x = validate(input, model);
    const mask = model.missing_indices.reduce((m, i, j) => m | (x[i] === null ? 1 << j : 0), 0);
    let draw = 0;
    const probabilities = model.models.map((booster, i) => {
      const z = x.map((v,j) => v === null ? model.initial[j] : v);
      if (mask) for (let it = 0; it < model.iterations; it++) {
        model.missing_indices.forEach((idx, j) => {
          if (x[idx] !== null) return;
          const b = model.systems[i][j];
          let p = b.beta[0];
          for (let k = 0; k < b.other.length; k++) p += ((z[b.other[k]] - b.mean[k]) / b.sd[k]) * b.beta[k + 1];
          z[idx] = matchDonor(b, p, model.draws[mask][draw++]);
        });
      }
      const values = z.map(Math.fround);
      let margin = Math.fround(Math.log(booster.base_score / (1 - booster.base_score)));
      for (const tree of booster.trees) {
        let n = 0;
        while (tree.left[n] >= 0) n = values[tree.feature[n]] < Math.fround(tree.value[n]) ? tree.left[n] : tree.right[n];
        margin = Math.fround(margin + Math.fround(tree.value[n]));
      }
      // XGBoost's CPU predictor uses float32 throughout the logistic transform.
      return Math.fround(1 / Math.fround(1 + Math.fround(Math.exp(-margin))));
    });
    const risk = probabilities.reduce((a,b) => a+b,0) / probabilities.length;
    if (!Number.isFinite(risk) || risk < 0 || risk > 1) throw new Error('Calculation failed. Check the inputs.');
    return { risk, imputed: x.filter(v => v === null).length, probabilities };
  }
  root.CKMEngine = { predict, validate };
  if (typeof module !== 'undefined') module.exports = root.CKMEngine;
})(globalThis);
