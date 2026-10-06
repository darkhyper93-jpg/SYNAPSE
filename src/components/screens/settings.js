import { h } from '../../utils/dom.js';
import { t, setLang } from '../../game/i18n.js';
import { go, confirmDialog, toast, pushLayer } from '../ui.js';
import { settings, applySettings } from '../../game/settings.js';
import { profile } from '../../game/playerProfile.js';
import { sfx } from '../../game/audio.js';

const APP_VERSION = '1.0.0';

/** Shows the bundled privacy policy inside the app (Back / tap ✕ closes it). */
async function openPrivacy() {
  let html = '';
  try {
    const doc = new DOMParser().parseFromString(await (await fetch('privacy.html')).text(), 'text/html');
    doc.querySelector('.back')?.remove();
    html = doc.querySelector('main')?.innerHTML || '';
  } catch {
    location.href = 'privacy.html';
    return;
  }
  let unregister = () => {};
  const close = () => {
    unregister();
    layer.classList.add('is-out');
    setTimeout(() => layer.remove(), 200);
  };
  const layer = h('div.modal-overlay.doc-overlay', { role: 'dialog', 'aria-modal': 'true' }, h('div.doc-sheet', h('button.icon-btn.doc-close', { type: 'button', 'aria-label': t('ui.cancel'), onclick: close }, '✕'), h('div.doc-body', { html })));
  unregister = pushLayer(close);
  document.body.append(layer);
}

export function settingsScreen() {
  const s = settings.get();

  const update = (patch, rerender = false) => {
    settings.set(patch);
    applySettings(settings.get());
    if ('lang' in patch) setLang(patch.lang);
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
      toggle('haptics', t('set.haptics'), t('set.hapticsDesc')),
      h('div.set-row', h('div.set-text', h('b', t('set.volume'))), volume),
    ),
    h('section.set-group', h('h3', t('set.visual')),
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
    h('section.set-group', h('h3', t('set.help')),
      h('div.set-row', h('div.set-text', h('b', t('set.tutorial')), h('small', t('set.tutorialDesc'))), h('button.btn.btn-ghost', { type: 'button', onclick: () => go('onboarding') }, t('set.tutorialBtn'))),
    ),
    h('section.set-group', h('h3', t('set.data')),
      h('p.set-help', t('set.dataDesc')),
      h('button.btn.btn-danger', { type: 'button', onclick: reset }, t('set.reset')),
    ),
    h('section.set-group.about', h('h3', t('set.about')), h('p', { html: t('set.aboutBody') }),
      h('div.set-row', h('div.set-text', h('b', t('set.privacy')), h('small', t('set.privacyDesc'))), h('button.btn.btn-ghost', { type: 'button', onclick: () => openPrivacy() }, t('set.privacyBtn'))),
      h('p.set-help', `SYNAPSE v${APP_VERSION}`),
    ),
  );

  const onKey = (e) => {
    if (e.key === 'Escape' && !document.querySelector('.modal-overlay')) go('home');
  };
  document.addEventListener('keydown', onKey);
  return { el, cleanup: () => document.removeEventListener('keydown', onKey) };
}
