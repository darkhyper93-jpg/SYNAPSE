import { h } from '../../utils/dom.js';
import { t } from '../../game/i18n.js';
import { go, logo } from '../ui.js';
import { profile } from '../../game/playerProfile.js';
import { SKILLS, SKILL_IDS } from '../../data/skills.js';
import { radarChart } from '../charts.js';
import { dailyInfo, msToNextDaily } from '../../engine/daily.js';
import { storage } from '../../game/storage.js';
import { sfx } from '../../game/audio.js';

const MODES = ['quick', 'standard', 'challenge'];

export function homeScreen() {
  let mode = storage.load('lastMode', 'quick');
  if (!MODES.includes(mode)) mode = 'quick';
  const daily = dailyInfo();
  const dailyDone = profile.state.daily[daily.number];
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
          sfx('tap');
        },
      },
      h('b', t(`mode.${m}`)),
      h('small', t(`mode.${m}.sub`)),
    ),
  );

  const play = () => {
    sfx('go');
    go('play', { mode });
  };

  const playBtn = h(
    'button.play-btn',
    { type: 'button', onclick: play, 'data-autofocus': true },
    h('span.play-ring'),
    h('span.play-ring.r2'),
    h('span.play-label', t('home.play')),
    h('kbd.key-hint', 'ENTER'),
  );

  const countdown = h('span.daily-timer');
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const tick = () => (countdown.textContent = t('home.nextDaily', { time: fmt(msToNextDaily()) }));
  tick();
  const timer = setInterval(tick, 1000);

  const dailyCard = h(
    'button.daily-card',
    { type: 'button', onclick: () => go('play', { mode: 'daily' }) },
    h('div.daily-head', h('span.daily-tag', t('home.daily')), h('span.daily-num', `#${daily.number}`)),
    h('div.daily-dots', daily.plan.map((p, i) => h('i', { '--c': p.skill === 'mixed' ? '#ffffff' : SKILLS[p.skill].color, '--i': i }))),
    h('div.daily-sub', dailyDone ? t('home.dailyDone', { score: dailyDone.score.toLocaleString() }) : t('home.dailySub')),
    countdown,
  );

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
      h('div.snap-row', h('span', t('home.best')), h('b', (profile.state.best[mode] || 0).toLocaleString())),
    ),
  );

  const el = h(
    'main.home',
    h('div.home-hero', logo('lg'), h('p.tagline', t('home.tagline'))),
    h('div.home-play', playBtn, h('div.mode-chips', { role: 'group', 'aria-label': t('home.mode') }, modeBtns)),
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

  return {
    el,
    cleanup: () => {
      clearInterval(timer);
      document.removeEventListener('keydown', onKey);
    },
  };
}
