/* Locked CKM model inference. No dependencies, networking, storage or training. */
(function (root) {
  'use strict';
  const labels = ['碳酸氢盐', '呼吸频率', '卒中', '白细胞计数', '血尿素氮', '房颤', '平均动脉压', '年龄', 'SHR'];
  function validate(input, model) {
    return model.variables.map((key, i) => {
      const v = input[key];
      if (v === null && model.missing_indices.includes(i)) return null;
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`请填写有效的${labels[i]}。`);
      if ((i === 2 || i === 5) && v !== 0 && v !== 1) throw new Error('卒中和房颤须明确选择有或无，未知不能填无。');
      if (i === 7 && (v < 18 || v > 120)) throw new Error('年龄须为 18–120 岁。');
      if ([0,1,3,6,8].includes(i) && v <= 0) throw new Error(`${labels[i]}必须大于 0，请核对单位。`);
      if (i === 4 && v < 0) throw new Error('血尿素氮不能小于 0。');
      if (!Number.isFinite(Math.fround(v))) throw new Error(`${labels[i]}超出模型数值范围。`);
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
    if (!model) throw new Error('模型尚未加载，请刷新页面。');
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
    if (!Number.isFinite(risk) || risk < 0 || risk > 1) throw new Error('计算失败，请检查输入。');
    return { risk, imputed: x.filter(v => v === null).length, probabilities };
  }
  root.CKMEngine = { predict, validate };
  if (typeof module !== 'undefined') module.exports = root.CKMEngine;
})(globalThis);
