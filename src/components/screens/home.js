import { h } from '../../utils/dom.js';
import { t } from '../../game/i18n.js';
import { go, logo, toast } from '../ui.js';
import { profile } from '../../game/playerProfile.js';
import { SKILLS, SKILL_IDS } from '../../data/skills.js';
import { radarChart } from '../charts.js';
import { dailyInfo, dailyNumber, msToNextDaily } from '../../engine/daily.js';
import { storage } from '../../game/storage.js';
import { sfx } from '../../game/audio.js';
import { haptic } from '../../game/haptics.js';

const MODES = ['quick', 'standard', 'challenge'];

export function homeScreen() {
  let mode = storage.load('lastMode', 'quick');
  if (!MODES.includes(mode)) mode = 'quick';
  let daily = dailyInfo();
  const st = profile.state.stats;
  const played = profile.playedSkills().length > 0;

  const modeBtns = MODES.map((m) =>
    h(
      `button.mode-chip${m === mode ? '.is-active' : ''}`,
      {
        type: 'button',
        dataset: { mode: m },
        'aria-pressed': String(m === mode),
        onclick: () => {
          mode = m;
          storage.save('lastMode', m);
          modeBtns.forEach((b) => {
            const on = b.dataset.mode === m;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-pressed', String(on));
          });
          placeGlider();
          bestVal.textContent = (profile.state.best[m] || 0).toLocaleString();
          sfx('tap');
        },
      },
      h('b', t(`mode.${m}`)),
      h('small', t(`mode.${m}.sub`)),
    ),
  );

  // PLAY: charges while pressed, then launches with a burst.
  let launching = false;
  let launchTimer = 0;
  const play = () => {
    if (launching) return;
    launching = true;
    sfx('go');
    haptic('heavy');
    playBtn.classList.add('is-launch');
    launchTimer = setTimeout(() => go('play', { mode, warpColor: 'rgba(46,230,255,.5)' }), document.body.classList.contains('reduce-motion') ? 0 : 260);
  };

  const playBtn = h(
    'button.play-btn',
    { type: 'button', onclick: play, 'data-autofocus': true },
    h('span.play-glow'),
    h('span.play-glow.is-hover'),
    h('span.play-glow.is-hot'),
    h('span.play-spin'),
    h('span.play-orbit', h('span.play-orbit-boost', h('i'), h('i'), h('i'), h('i'))),
    h('span.play-ring'),
    h('span.play-ring.r2'),
    h('span.play-label', t('home.play')),
    h('kbd.key-hint', 'ENTER'),
  );
  playBtn.addEventListener('pointerdown', () => playBtn.classList.add('is-charging'));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => playBtn.addEventListener(ev, () => playBtn.classList.remove('is-charging')));

  const glider = h('span.chip-glider');
  const placeGlider = () => {
    const btn = modeBtns.find((b) => b.dataset.mode === mode);
    if (!btn || !btn.offsetWidth) return;
    glider.style.width = `${btn.offsetWidth}px`;
    glider.style.transform = `translateX(${btn.offsetLeft}px)`;
  };

  const countdown = h('span.daily-timer');
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  // ticks aligned to the wall-clock second, so the seconds never skip or repeat
  const dailyNum = h('span.daily-num');
  const dailyDots = h('div.daily-dots');
  const dailySub = h('div.daily-sub');
  const fillDaily = () => {
    const done = profile.state.daily[daily.number];
    dailyNum.textContent = `#${daily.number}`;
    dailyDots.replaceChildren(...daily.plan.map((p, i) => h('i', { '--c': p.skill === 'mixed' ? '#ffffff' : SKILLS[p.skill].color, '--i': i })));
    dailySub.textContent = done ? t('home.dailyDone', { score: done.score.toLocaleString() }) : t('home.dailySub');
  };
  fillDaily();
  let timer = 0;
  const tick = () => {
    // a new day began while the app sat open (or in the background): show the new daily
    if (dailyNumber() !== daily.number) {
      daily = dailyInfo();
      fillDaily();
    }
    countdown.textContent = t('home.nextDaily', { time: fmt(msToNextDaily()) });
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 8);
  };
  tick();

  const dailyCard = h(
    'button.daily-card',
    { type: 'button', onclick: () => go('play', { mode: 'daily' }) },
    h('span.card-ring'),
    h('div.daily-head', h('span.daily-tag', t('home.daily')), dailyNum),
    dailyDots,
    dailySub,
    countdown,
  );

  const bestVal = h('b', (profile.state.best[mode] || 0).toLocaleString());
  const radarVals = SKILL_IDS.map((id) => ({ id, label: t(`skill.${id}.short`), value: profile.rating(id), color: SKILLS[id].color }));
  const snapshot = h(
    'button.snapshot',
    { type: 'button', onclick: () => go('profile') },
    h('div.snapshot-radar', { html: radarChart(radarVals, { size: 200, showLabels: false }) }),
    h(
      'div.snapshot-stats',
      h('div.snap-index', h('small', t('home.index')), h('b', played ? String(profile.globalIndex()) : '—')),
      h('div.snap-row', h('span', t('home.sessions')), h('b', String(st.sessions))),
      h('div.snap-row', h('span', t('home.bestStreak')), h('b', String(st.bestStreak))),
      h('div.snap-row', h('span', t('home.best')), bestVal),
    ),
  );

  const el = h(
    'main.home',
    h('div.home-hero', logo('lg'), h('p.tagline', t('home.tagline'))),
    h('div.home-play', playBtn, h('div.mode-chips', { role: 'group', 'aria-label': t('home.mode') }, glider, modeBtns)),
    h('div.home-grid', dailyCard, snapshot),
    h(
      'nav.home-nav',
      h('button.btn.btn-ghost', { type: 'button', onclick: () => go('profile') }, h('span', t('nav.profile')), h('kbd.key-hint', 'P')),
      h('button.btn.btn-ghost', { type: 'button', onclick: () => go('settings') }, h('span', t('nav.settings')), h('kbd.key-hint', 'S')),
    ),
    h('p.disclaimer', t('home.disclaimer')),
  );

  const onKey = (e) => {
    if (e.target.closest?.('input, select, textarea')) return;
    if (e.key === 'Enter' && document.activeElement === document.body) play();
    else if (e.key.toLowerCase() === 'd') go('play', { mode: 'daily' });
    else if (e.key.toLowerCase() === 'p') go('profile');
    else if (e.key.toLowerCase() === 's') go('settings');
    else if (['1', '2', '3'].includes(e.key)) modeBtns[Number(e.key) - 1].click();
  };
  document.addEventListener('keydown', onKey);

  window.addEventListener('resize', placeGlider);
  let backArmed = 0;
  return {
    el,
    onShow: () => requestAnimationFrame(() => requestAnimationFrame(placeGlider)),
    // Android back on the home screen: press twice to exit.
    onBack: () => {
      if (launching) return true; // PLAY is already on its way
      if (Date.now() - backArmed < 2000) return false;
      backArmed = Date.now();
      toast(t('home.backExit'), { icon: '↩', duration: 1800 });
      return true;
    },
    cleanup: () => {
      window.removeEventListener('resize', placeGlider);
      clearTimeout(timer);
      clearTimeout(launchTimer); // another button won the race: PLAY must not start on top of it
      document.removeEventListener('keydown', onKey);
    },
  };
}
