const assert = require('node:assert/strict');
const fs = require('node:fs');
require('./model-data.js');
const {predict} = require('./engine.js');
const cases = require('./reference-cases.json');
const results = cases.map(c => {
  const actual = predict(c.input).risk;
  const error = Math.abs(actual-c.expected);
  assert.ok(error < 1e-7, `${c.id}: ${actual} vs ${c.expected} (error ${error})`);
  assert.equal(predict(c.input).risk,actual,'Repeatability');
  return {id:c.id,expected:c.expected,actual,absolute_error:error};
});
const base = cases[0].input;
for (const patch of [{age:17},{age:121},{stroke:null},{stroke:2},{af:null},{af:NaN},{SHR:null},{SHR:0},{SHR:Infinity},{wbc:undefined},{wbc:0},{'bun_mg.dL_min':-1},{resp_rate_mean:0},{mbp_mean:undefined},{age:'67'}]) {
  assert.throws(() => predict({...base,...patch}),JSON.stringify(patch));
}
assert.equal(predict({...base,outcome:1,name:'ignored'}).risk,predict(base).risk);
const allowed = globalThis.CKM_MODEL.missing_indices.map(i => globalThis.CKM_MODEL.variables[i]);
assert.deepEqual(allowed,['bicarbonate_mEq.L_min','resp_rate_mean','wbc','bun_mg.dL_min','mbp_mean','age']);
for (let mask=0;mask<64;mask++) {
  const c = cases.find(c=>c.id===`expanded_missing_${mask}_0`);
  assert.ok(c,`Missing reference pattern ${mask}`);
  assert.equal(predict(c.input).imputed,allowed.filter((_,i)=>mask & (1<<i)).length);
}
const report = {status:'passed',model:globalThis.CKM_MODEL.id,cases:results.length,tolerance:1e-7,
  allowed_missing:allowed,required:['stroke','af','SHR'],missing_patterns:64,
  max_absolute_error:Math.max(...results.map(r=>r.absolute_error)),
  deterministic:true,invalid_inputs_rejected:true,outcome_ignored:true,results};
fs.writeFileSync('verification-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,results:undefined},null,2));
