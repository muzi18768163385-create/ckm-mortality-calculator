const assert = require('node:assert/strict');
const fs = require('node:fs');
require('./model-data.js');
require('./shr-policy.js');
const {predict, predictWithShrMedian} = require('./engine.js');
const reference = require('./scenario-reference-cases.json');
const median = globalThis.CKM_SHR_POLICY.trainingMedian;
assert.equal(median, reference.shr_training_median);
assert.ok(globalThis.CKM_SHR_POLICY.source.trim());
assert.equal(reference.cases.length,130);
const results = reference.cases.map(c => {
  const before = JSON.stringify(c.input);
  const actual = predictWithShrMedian(c.input,median);
  const error = Math.abs(actual.risk-c.expected);
  assert.ok(error<1e-7,`${c.id}: error ${error}`);
  assert.equal(actual.mode,'shr_training_median_scenario');
  assert.equal(actual.shrMedian,median);
  assert.equal(actual.clinicallyValidated,false);
  assert.equal(actual.imputed,Object.entries(c.input).filter(([k,v])=>k!=='SHR' && v===null).length);
  assert.equal(actual.risk,predict({...c.input,SHR:median}).risk);
  assert.equal(actual.risk,predictWithShrMedian(c.input,median).risk);
  assert.equal(JSON.stringify(c.input),before,'Input must not be mutated');
  return {id:c.id,expected:c.expected,actual:actual.risk,absolute_error:error};
});
const base = reference.cases.find(c=>c.id==='shr_median_expanded_missing_0_0').input;
for (const value of [undefined,null,0,-1,NaN,Infinity,Number.MAX_VALUE,'1.088619']) {
  assert.throws(()=>predictWithShrMedian(base,value));
}
for (const patch of [{SHR:undefined},{SHR:1.1},{stroke:null},{af:2},{age:17},{wbc:0},{'bun_mg.dL_min':-1}]) {
  assert.throws(()=>predictWithShrMedian({...base,...patch},median));
}
assert.throws(()=>predict(base),'Standard mode must still require SHR');
const report = {status:'passed',method:reference.method,clinical_validation:false,
  shr_training_median:median,median_source:globalThis.CKM_SHR_POLICY.source,
  cases:results.length,other_missing_patterns:64,tolerance:1e-7,
  max_absolute_error:Math.max(...results.map(r=>r.absolute_error)),
  explicit_missing_required:true,input_not_mutated:true,deterministic:true,
  invalid_inputs_rejected:true,results};
fs.writeFileSync('scenario-verification-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,results:undefined},null,2));
