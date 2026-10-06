import { h } from '../../utils/dom.js';
import { t, setLang } from '../../game/i18n.js';
import { go, confirmDialog, toast, app } from '../ui.js';
import { settings, applySettings } from '../../game/settings.js';
import { profile } from '../../game/playerProfile.js';
import { sfx } from '../../game/audio.js';

export function settingsScreen() {
  const s = settings.get();

  const update = (patch, rerender = false) => {
    settings.set(patch);
    applySettings(settings.get());
    if ('lang' in patch) setLang(patch.lang);
    if ('background' in patch) app.background?.setMode(patch.background);
    if (rerender) go('settings');
  };

  const toggle = (key, label, desc) => {
    const input = h('input', { type: 'checkbox', role: 'switch', checked: !!s[key], onchange: (e) => { update({ [key]: e.target.checked }); sfx('tap'); } });
    return h('label.set-row', h('div.set-text', h('b', label), desc ? h('small', desc) : null), h('span.switch', input, h('i')));
  };

  const segmented = (key, label, options, rerender = false) =>
    h(
      'div.set-row',
      h('div.set-text', h('b', label)),
      h(
        'div.segmented',
        { role: 'radiogroup', 'aria-label': label },
        options.map(([value, text]) =>
          h(
            `button${s[key] === value ? '.is-active' : ''}`,
            {
              type: 'button',
              role: 'radio',
              'aria-checked': String(s[key] === value),
              onclick: (e) => {
                update({ [key]: value }, rerender);
                sfx('tap');
                if (!rerender) {
                  [...e.currentTarget.parentElement.children].forEach((b) => {
                    b.classList.toggle('is-active', b === e.currentTarget);
                    b.setAttribute('aria-checked', String(b === e.currentTarget));
                  });
                }
              },
            },
            text,
          ),
        ),
      ),
    );

  const volume = h('input.range', {
    type: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    value: s.volume,
    'aria-label': t('set.volume'),
    oninput: (e) => update({ volume: Number(e.target.value) }),
    onchange: () => sfx('correct'),
  });

  const reset = async () => {
    const ok = await confirmDialog({ title: t('set.resetTitle'), body: t('set.resetBody'), confirm: t('set.resetConfirm'), danger: true });
    if (!ok) return;
    profile.reset();
    toast(t('set.resetDone'), { color: '#ff4d6d', icon: '↺' });
    go('home');
  };

  const el = h(
    'main.settings',
    h('header.page-head', h('button.icon-btn', { type: 'button', 'aria-label': t('nav.back'), onclick: () => go('home') }, '←'), h('h1', t('set.title'))),
    h('section.set-group', h('h3', t('set.general')),
      segmented('lang', t('set.lang'), [['es', 'Español'], ['en', 'English']], true),
      toggle('sound', t('set.sound'), t('set.soundDesc')),
      h('div.set-row', h('div.set-text', h('b', t('set.volume'))), volume),
    ),
    h('section.set-group', h('h3', t('set.visual')),
      segmented('background', t('set.background'), [['full', t('set.bgFull')], ['calm', t('set.bgCalm')], ['off', t('set.bgOff')]]),
      toggle('reducedMotion', t('set.motion'), t('set.motionDesc')),
      segmented('textScale', t('set.text'), [[0.9, 'S'], [1, 'M'], [1.15, 'L'], [1.3, 'XL']]),
      toggle('highContrast', t('set.contrast'), t('set.contrastDesc')),
      toggle('colorAssist', t('set.colorAssist'), t('set.colorAssistDesc')),
      toggle('showKeyHints', t('set.keys'), t('set.keysDesc')),
    ),
    h('section.set-group', h('h3', t('set.training')),
      segmented('adaptMix', t('set.mix'), [['balanced', t('set.mixBalanced')], ['weakness', t('set.mixWeak')], ['strength', t('set.mixStrong')]]),
      h('p.set-help', t('set.mixDesc')),
    ),
    h('section.set-group', h('h3', t('set.data')),
      h('p.set-help', t('set.dataDesc')),
      h('button.btn.btn-danger', { type: 'button', onclick: reset }, t('set.reset')),
    ),
    h('section.set-group.about', h('h3', t('set.about')), h('p', { html: t('set.aboutBody') })),
  );

  const onKey = (e) => {
    if (e.key === 'Escape' && !document.querySelector('.modal-overlay')) go('home');
  };
  document.addEventListener('keydown', onKey);
  return { el, cleanup: () => document.removeEventListener('keydown', onKey) };
}
