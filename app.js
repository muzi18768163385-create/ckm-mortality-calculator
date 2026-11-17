(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('risk-form');
  const missing = [...document.querySelectorAll('[data-missing]')];
  const shrUnavailable = $('shr-unavailable');
  const shrPolicy = globalThis.CKM_SHR_POLICY;
  const medianReady = Number.isFinite(shrPolicy?.trainingMedian) && shrPolicy.trainingMedian > 0 &&
    Number.isFinite(Math.fround(shrPolicy.trainingMedian)) && typeof shrPolicy.source === 'string' && shrPolicy.source.trim() !== '';
  let calculated = false;
  function clearResult(message = 'Enter the patient parameters to view the predicted mortality probability.') {
    calculated = false;
    $('result-heading').textContent = 'Predicted risk';
    $('result-eyebrow').textContent = 'PREDICTED PROBABILITY';
    $('scenario-result-note').hidden = true;
    $('shr-median-row').hidden = true;
    $('shr-median-value').textContent = '—';
    $('risk-number').innerHTML = '—<small>%</small>';
    $('risk-caption').textContent = 'Awaiting calculation';
    $('gauge').style.setProperty('--risk-angle','0deg');
    $('result-description').textContent = message;
    $('imputed-count').textContent = '—';
    $('result-timestamp').hidden = true;
    $('print').hidden = true;
    $('form-error').hidden = true;
  }
  function syncMissing() {
    missing.forEach(box => { const input = $(box.dataset.missing); input.disabled = box.checked; input.required = !box.checked; });
    shrUnavailable.disabled = !medianReady;
    if (!medianReady) shrUnavailable.checked = false;
    $('SHR').disabled = shrUnavailable.checked;
    $('SHR').required = !shrUnavailable.checked;
    $('SHR').placeholder = shrUnavailable.checked ? 'Unavailable' : 'Enter value';
    if (shrUnavailable.checked) $('SHR').value = '';
    $('scenario-input-note').hidden = !shrUnavailable.checked;
    $('calculate-label').textContent = shrUnavailable.checked ? 'Calculate SHR scenario' : 'Calculate mortality risk';
  }
  // Keep validation prompts in English regardless of the browser's UI language.
  form.addEventListener('invalid', event => {
    const input = event.target;
    input.setCustomValidity('');
    const label = input.labels?.[0]?.textContent.trim().replace(/\s+/g, ' ') || 'this field';
    if (input.id === 'eligible') {
      input.setCustomValidity('Confirm the study population and 24-hour ICU landmark eligibility before calculating.');
    } else if (input.validity.valueMissing) {
      input.setCustomValidity(input.tagName === 'SELECT' ? `Select Yes or No for ${label}.` : `Enter a value for ${label}.`);
    } else if (input.validity.rangeUnderflow || input.validity.rangeOverflow) {
      input.setCustomValidity(input.id === 'age' ? 'Age must be between 18 and 120 years.' : `Check the value and units for ${label}.`);
    } else {
      input.setCustomValidity(`Enter a valid number for ${label}.`);
    }
  }, true);
  form.addEventListener('input', event => {
    event.target.setCustomValidity?.('');
    syncMissing();
    clearResult('Inputs have changed. Complete the form and recalculate.');
    $('example-note').hidden = true;
  });
  form.addEventListener('reset', () => {
    [...form.elements].forEach(input => input.setCustomValidity?.(''));
    missing.forEach(box => {box.checked = false;});
    shrUnavailable.checked = false;
    syncMissing();
    clearResult();
    $('example-note').hidden = true;
  });
  $('example').addEventListener('click', () => {
    form.reset();
    const example = [23,21,0,10,25,0,80,67,1.1];
    globalThis.CKM_MODEL.variables.forEach((key,i) => { $(key).value = example[i]; });
    $('example-note').hidden = false;
    $('age').focus({preventScroll:true});
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    clearResult();
    try {
      if (!$('eligible').checked) throw new Error('Confirm the study population and 24-hour ICU landmark eligibility before calculating.');
      if (shrUnavailable.checked && !medianReady) throw new Error('The training-set SHR median has not been verified. Enter the calculated SHR.');
      const input = Object.fromEntries(globalThis.CKM_MODEL.variables.map(key => [key,
        $(key).disabled ? null : ($(key).value.trim() === '' ? undefined : Number($(key).value))]));
      const result = shrUnavailable.checked
        ? globalThis.CKMEngine.predictWithShrMedian(input, shrPolicy.trainingMedian)
        : globalThis.CKMEngine.predict(input);
      const {risk,imputed} = result;
      const scenario = result.mode === 'shr_training_median_scenario';
      const pct = risk * 100;
      const display = pct > 0 && pct < .1 ? '< 0.1' : pct < 100 && pct > 99.9 ? '> 99.9' : pct.toFixed(1);
      $('risk-number').textContent = display;
      const unit = document.createElement('small'); unit.textContent = '%'; $('risk-number').append(unit);
      $('result-heading').textContent = scenario ? 'Median-SHR scenario' : 'Predicted risk';
      $('result-eyebrow').textContent = scenario ? 'UNVALIDATED SCENARIO' : 'PREDICTED PROBABILITY';
      $('risk-caption').textContent = scenario ? 'Scenario mortality estimate' : 'Predicted mortality probability';
      $('gauge').style.setProperty('--risk-angle',`${risk*360}deg`);
      $('result-description').textContent = scenario
        ? `Model output assuming SHR = ${result.shrMedian} (training-set median) at the 24-hour ICU landmark. The patient’s SHR is unavailable.`
        : 'Model-predicted probability of subsequent death during the same hospitalization, at the 24-hour ICU landmark.';
      $('imputed-count').textContent = `${imputed} / 6 eligible inputs`;
      $('scenario-result-note').hidden = !scenario;
      $('shr-median-row').hidden = !scenario;
      if (scenario) $('shr-median-value').textContent = `${result.shrMedian} (substituted)`;
      $('result-timestamp').textContent = `Calculated: ${new Date().toLocaleString('en-GB',{hour12:false})}`;
      $('result-timestamp').hidden = false;
      $('print').hidden = false;
      calculated = true;
      if (window.matchMedia('(max-width:760px)').matches) $('result-heading').scrollIntoView({behavior:'smooth',block:'start'});
    } catch(error) {
      $('form-error').textContent = error.message;
      $('form-error').hidden = false;
    }
  });
  $('print').addEventListener('click',() => {if(calculated) window.print();});
  try {
    if (globalThis.CKM_MODEL.missing_indices.join(',') !== '0,1,3,4,6,7') throw new Error('Model imputation support does not match this calculator version.');
    document.querySelectorAll('[data-shr-median]').forEach(el => { el.textContent = medianReady ? String(shrPolicy.trainingMedian) : 'not yet verified'; });
    $('shr-median-unavailable').hidden = medianReady;
    const reference = Object.fromEntries(globalThis.CKM_MODEL.variables.map((k,i) => [k,[23,21,0,10,25,0,80,67,1.1][i]]));
    if (Math.abs(globalThis.CKMEngine.predict(reference).risk-.034412096254527569)>1e-7) throw new Error('Model verification failed');
    reference['bicarbonate_mEq.L_min'] = null;
    if (Math.abs(globalThis.CKMEngine.predict(reference).risk-.044328317325562236)>1e-7) throw new Error('Imputation verification failed');
    $('model-status').textContent = 'Model ready';
    $('model-status').classList.add('ready');
    $('calculate').disabled = false;
    syncMissing();
  } catch(error) {
    $('model-status').textContent = 'Model unavailable';
    $('model-status').classList.add('failed');
    $('example').disabled = true;
    $('form-error').textContent = 'The model could not be loaded or verified. Refresh the page and try again. If the problem persists, contact the site administrator.';
    $('form-error').hidden = false;
  }
})();
