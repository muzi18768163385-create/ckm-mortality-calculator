(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('risk-form');
  const missing = [...document.querySelectorAll('[data-missing]')];
  let calculated = false;
  function clearResult(message = '填写左侧指标，查看预测的住院死亡概率。') {
    calculated = false;
    $('risk-number').innerHTML = '—<small>%</small>';
    $('risk-caption').textContent = '等待计算';
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
  form.addEventListener('input', () => {
    syncMissing();
    clearResult('输入已更新，请完成填写后重新计算。');
    $('example-note').hidden = true;
  });
  form.addEventListener('reset', () => {
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
      if (!$('eligible').checked) throw new Error('请先确认研究人群及入 ICU 满 24 小时的适用条件。');
      const input = Object.fromEntries(globalThis.CKM_MODEL.variables.map(key => [key,
        $(key).disabled ? null : ($(key).value.trim() === '' ? undefined : Number($(key).value))]));
      const {risk,imputed} = globalThis.CKMEngine.predict(input);
      const pct = risk * 100;
      const display = pct > 0 && pct < .1 ? '< 0.1' : pct < 100 && pct > 99.9 ? '> 99.9' : pct.toFixed(1);
      $('risk-number').textContent = display;
      const unit = document.createElement('small'); unit.textContent = '%'; $('risk-number').append(unit);
      $('risk-caption').textContent = '预测住院死亡概率';
      $('gauge').style.setProperty('--risk-angle',`${risk*360}deg`);
      $('result-description').textContent = '入 ICU 满 24 小时后，同一次住院期间的模型预测死亡概率。';
      $('imputed-count').textContent = `${imputed} / 9 项`;
      $('result-timestamp').textContent = `本次计算：${new Date().toLocaleString('zh-CN',{hour12:false})}`;
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
    if (Math.abs(globalThis.CKMEngine.predict(reference).risk-.034412096254527569)>1e-7) throw new Error('模型校验失败');
    reference['bicarbonate_mEq.L_min'] = null;
    if (Math.abs(globalThis.CKMEngine.predict(reference).risk-.044328317325562236)>1e-7) throw new Error('插补校验失败');
    $('model-status').textContent = '模型已就绪';
    $('model-status').classList.add('ready');
    $('calculate').disabled = false;
  } catch(error) {
    $('model-status').textContent = '模型加载失败';
    $('model-status').classList.add('failed');
    $('example').disabled = true;
    $('form-error').textContent = '模型加载或校验失败，请刷新重试，并确认 model-data.js 和 engine.js 文件完整。';
    $('form-error').hidden = false;
  }
})();
