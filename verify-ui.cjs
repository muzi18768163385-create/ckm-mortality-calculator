// Event/controller tests using a minimal DOM; no browser automation or dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('./model-data.js');
require('./shr-policy.js');
const engine = require('./engine.js');
const html = fs.readFileSync('index.html','utf8');
const attrs = text => Object.fromEntries([...text.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(m=>[m[1],m[2]??true]));
function element(tag, a={}) {
  let value = '';
  return {id:a.id,tagName:tag.toUpperCase(),dataset:{missing:a['data-missing']},
    get value(){return value;},set value(v){value=String(v);},
    checked:false,disabled:'disabled' in a,required:'required' in a,hidden:'hidden' in a,
    textContent:'',innerHTML:'',listeners:{},classList:{add(){}},style:{setProperty(){}},
    addEventListener(type,fn){this.listeners[type]=fn;},setCustomValidity(message){this.validationMessage=message;},
    append(child){this.textContent+=child.textContent;},focus(){},scrollIntoView(){}};
}
function boot(policy=globalThis.CKM_SHR_POLICY) {
  const entries = [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].map(m=>element(m[1],attrs(m[2])));
  const byId = Object.fromEntries(entries.filter(e=>e.id).map(e=>[e.id,e]));
  const missing = entries.filter(e=>e.dataset.missing);
  const medianLabels = [...html.matchAll(/<[^>]*data-shr-median[^>]*>/g)].map(()=>element('b'));
  const $ = id=>{assert.ok(byId[id],`Missing HTML id ${id}`);return byId[id];};
  const form = $('risk-form');
  form.elements=entries.filter(e=>['INPUT','SELECT','BUTTON'].includes(e.tagName));
  form.reset=()=>{form.listeners.reset();form.elements.forEach(e=>{e.value='';e.checked=false;});};
  let prints=0;
  const context=vm.createContext({CKM_MODEL:globalThis.CKM_MODEL,CKM_SHR_POLICY:policy,CKMEngine:engine,
    document:{getElementById:$,createElement:tag=>element(tag),querySelectorAll:selector=>{
      if(selector==='[data-missing]')return missing;
      if(selector==='[data-shr-median]')return medianLabels;
      throw Error(`Unexpected selector ${selector}`);
    }},window:{matchMedia:()=>({matches:false}),print:()=>{prints++;}}});
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  const input = el=>form.listeners.input({target:el});
  const submit=()=>form.listeners.submit({preventDefault(){}});
  const example=()=>{$('example').listeners.click();$('eligible').checked=true;};
  return {$,missing,form,input,submit,example,medianLabels,prints:()=>prints};
}
const t=boot();const $=t.$;
assert.equal($('calculate').disabled,false);
assert.equal($('shr-unavailable').disabled,false);
assert.ok(t.medianLabels.every(e=>e.textContent==='1.088619'));
t.example();t.submit();
assert.equal($('risk-number').textContent,'3.4%');
assert.equal($('scenario-result-note').hidden,true);
assert.equal($('result-heading').textContent,'Predicted risk');
$('SHR').value='';t.input($('SHR'));t.submit();
assert.equal($('form-error').hidden,false,'Unselected missing SHR must fail');
assert.equal($('print').hidden,true);
$('shr-unavailable').checked=true;t.input($('shr-unavailable'));
assert.equal($('SHR').disabled,true);assert.equal($('SHR').required,false);
assert.equal($('scenario-input-note').hidden,false);t.submit();
assert.equal($('form-error').hidden,true);
assert.equal($('result-heading').textContent,'Median-SHR scenario');
assert.equal($('result-eyebrow').textContent,'UNVALIDATED SCENARIO');
assert.equal($('shr-median-value').textContent,'1.088619 (substituted)');
assert.equal($('scenario-result-note').hidden,false);
assert.match($('result-description').textContent,/1\.088619/);
assert.equal($('imputed-count').textContent,'0 / 6 eligible inputs');
$('print').listeners.click();assert.equal(t.prints(),1);
for(const box of t.missing){box.checked=true;t.input(box);}
t.submit();assert.equal($('form-error').hidden,true);
assert.equal($('imputed-count').textContent,'6 / 6 eligible inputs');
assert.equal($('scenario-result-note').hidden,false);
$('shr-unavailable').checked=false;t.input($('shr-unavailable'));
assert.equal($('SHR').disabled,false);assert.equal($('SHR').required,true);
assert.equal($('scenario-result-note').hidden,true);assert.equal($('shr-median-row').hidden,true);
assert.equal($('print').hidden,true);$('print').listeners.click();assert.equal(t.prints(),1);
t.example();t.submit();assert.equal($('risk-number').textContent,'3.4%');
assert.equal($('scenario-result-note').hidden,true);
$('shr-unavailable').checked=true;t.input($('shr-unavailable'));t.submit();t.form.reset();
assert.equal($('shr-unavailable').checked,false);assert.equal($('SHR').disabled,false);
assert.equal($('SHR').required,true);assert.equal($('scenario-input-note').hidden,true);
assert.equal($('scenario-result-note').hidden,true);assert.equal($('print').hidden,true);
for(const policy of [undefined,{trainingMedian:null,source:'missing'},{trainingMedian:1.088619,source:''}]) {
  const b=boot(policy===undefined?null:policy);
  assert.equal(b.$('calculate').disabled,false,'Standard mode stays available');
  assert.equal(b.$('shr-unavailable').disabled,true);
  b.example();b.$('shr-unavailable').checked=true;b.submit();
  assert.equal(b.$('form-error').hidden,false,'Cannot bypass absent configuration');
}
assert.match(html,/This missing-SHR approach has not been clinically validated/);
assert.ok(!/<details[^>]*>[\s\S]*?id="scenario-result-note"/.test(html.slice(html.indexOf('<aside'))), 'Result warning must not be collapsed in details');
console.log('Passed form-event tests: explicit opt-in, displayed median, six other missing inputs, clearing, reset, printing, and missing-policy rejection.');
