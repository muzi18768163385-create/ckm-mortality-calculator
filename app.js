(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('risk-form');
  const missing = [...document.querySelectorAll('[data-missing]')];
  let calculated = false;
  function clearResult(message = 'Enter the patient parameters to view the predicted mortality probability.') {
    calculated = false;
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
      const input = Object.fromEntries(globalThis.CKM_MODEL.variables.map(key => [key,
        $(key).disabled ? null : ($(key).value.trim() === '' ? undefined : Number($(key).value))]));
      const {risk,imputed} = globalThis.CKMEngine.predict(input);
      const pct = risk * 100;
      const display = pct > 0 && pct < .1 ? '< 0.1' : pct < 100 && pct > 99.9 ? '> 99.9' : pct.toFixed(1);
      $('risk-number').textContent = display;
      const unit = document.createElement('small'); unit.textContent = '%'; $('risk-number').append(unit);
      $('risk-caption').textContent = 'Predicted mortality probability';
      $('gauge').style.setProperty('--risk-angle',`${risk*360}deg`);
      $('result-description').textContent = 'Model-predicted probability of subsequent death during the same hospitalization, at the 24-hour ICU landmark.';
      $('imputed-count').textContent = `${imputed} / 9`;
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
    const reference = Object.fromEntries(globalThis.CKM_MODEL.variables.map((k,i) => [k,[23,21,0,10,25,0,80,67,1.1][i]]));
    if (Math.abs(globalThis.CKMEngine.predict(reference).risk-.034412096254527569)>1e-7) throw new Error('Model verification failed');
    reference['bicarbonate_mEq.L_min'] = null;
    if (Math.abs(globalThis.CKMEngine.predict(reference).risk-.044328317325562236)>1e-7) throw new Error('Imputation verification failed');
    $('model-status').textContent = 'Model ready';
    $('model-status').classList.add('ready');
    $('calculate').disabled = false;
  } catch(error) {
    $('model-status').textContent = 'Model unavailable';
    $('model-status').classList.add('failed');
    $('example').disabled = true;
    $('form-error').textContent = 'The model could not be loaded or verified. Refresh the page and try again. If the problem persists, contact the site administrator.';
    $('form-error').hidden = false;
  }
})();
