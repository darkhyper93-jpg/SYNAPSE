import { h } from '../../utils/dom.js';
import { t } from '../../game/i18n.js';
import { go } from '../ui.js';
import { profile } from '../../game/playerProfile.js';
import { SKILLS, SKILL_IDS } from '../../data/skills.js';
import { radarChart, lineChart, sparkline } from '../charts.js';
import { CHALLENGE_TYPES, isUnlocked } from '../../engine/challengeGenerator.js';
import { dailyNumber } from '../../engine/daily.js';

const MIN_FOR_PROFILE = 3; // challenges per skill before the value is "calibrated"

export function profileScreen() {
  const st = profile.state.stats;
  const hist = profile.state.history;
  const played = profile.playedSkills();

  const radarVals = SKILL_IDS.map((id) => ({ id, label: t(`skill.${id}.short`), value: profile.rating(id), color: SKILLS[id].color }));

  const skillCards = SKILL_IDS.map((id, i) => {
    const s = profile.skill(id);
    const m = profile.mastery(id);
    const calibrating = s.plays < MIN_FOR_PROFILE;
    const series = hist.map((x) => x.ratings?.[id]).filter((v) => v != null && v > 0).slice(-12);
    const acc = s.trials ? Math.round((s.correct / s.trials) * 100) : null;
    return h(
      'div.skill-card',
      { '--c': SKILLS[id].color, '--i': i },
      h('div.sc-top', h('span.sc-name', t(`skill.${id}`)), h('b.sc-val', s.plays ? String(Math.round(s.rating)) : '—')),
      h('div.sc-level', h('span', `${t('profile.level')} ${m.level} · ${t(`mastery.${m.key}`)}`), calibrating && s.plays ? h('em', t('profile.calibrating')) : null),
      h('div.sc-bar', h('i', { style: { width: `${Math.round(m.progress * 100)}%` } })),
      h('div.sc-spark', { html: sparkline(series, SKILLS[id].color) }),
      h(
        'div.sc-meta',
        h('span', t('profile.plays', { n: s.plays })),
        h('span', acc != null ? t('profile.acc', { n: acc }) : ''),
        h('span', t('profile.peak', { n: Math.round((s.bestDifficulty || 0) * 100) })),
      ),
      h('p.sc-desc', t(`skill.${id}.desc`)),
    );
  });

  const indexSeries = hist.map((x) => x.index).slice(-30);
  const rtSeries = hist.map((x) => (x.avgRt ? x.avgRt / 1000 : null)).slice(-30);
  const scoreSeries = hist.map((x) => x.score).slice(-30);

  const evo = hist.length >= 2
    ? h(
        'section.pf-section',
        h('h3', t('profile.evolution')),
        h('div.charts',
          h('div.chart-card', h('div.chart-title', t('profile.indexChart'), h('b', indexSeries.length ? `${indexSeries[0]} → ${indexSeries[indexSeries.length - 1]}` : '')), h('div', { html: lineChart([{ label: 'index', color: '#b07bff', values: indexSeries }], { min: 0, max: 100 }) })),
          rtSeries.filter((v) => v != null).length >= 2
            ? h('div.chart-card', h('div.chart-title', t('profile.rtChart'), h('b', rtSeries.filter((v) => v != null).map((v) => `${v.toFixed(2)}s`).slice(-4).join(' → '))), h('div', { html: lineChart([{ label: 'rt', color: '#ff5470', values: rtSeries }], { format: (v) => `${v.toFixed(2)}s` }) }))
            : null,
          h('div.chart-card', h('div.chart-title', t('profile.scoreChart')), h('div', { html: lineChart([{ label: 'score', color: '#2ee6ff', values: scoreSeries }], { min: 0, format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)) }) })),
          h('div.chart-card.is-wide', h('div.chart-title', t('profile.skillsChart')), h('div', { html: lineChart(SKILL_IDS.filter((id) => profile.skill(id).plays).map((id) => ({ label: id, color: SKILLS[id].color, values: hist.map((x) => x.ratings?.[id] || null).slice(-30) })), { min: 0, max: 100 }) })),
        ),
      )
    : h('section.pf-section', h('h3', t('profile.evolution')), h('p.empty', t('profile.needMore')));

  const challenges = h(
    'div.ch-list',
    CHALLENGE_TYPES.map((T) => {
      const m = T.meta;
      const unlocked = isUnlocked(T, profile);
      const ts = profile.state.types[m.id];
      return h(
        `${unlocked ? 'button' : 'div'}.ch-item${unlocked ? '' : '.is-locked'}`,
        { '--c': SKILLS[m.skill].color, type: unlocked ? 'button' : null, title: unlocked ? t('profile.practice') : null, onclick: unlocked ? () => go('play', { mode: 'practice', typeId: m.id }) : null },
        h('b', t(`ch.${m.id}.name`)),
        h('span', t(`ch.${m.id}.tag`)),
        unlocked ? h('small', ts?.plays ? t('profile.played', { n: ts.plays }) : t('profile.new'), h('em', ` · ${t('profile.practice')} ▶`)) : h('small', t('profile.lockedReq', { skills: m.unlockSkills.map((s) => t(`skill.${s}`)).join(' + '), n: m.minRating })),
      );
    }),
  );

  const today = dailyNumber();
  const dailies = Object.entries(profile.state.daily).sort((a, b) => b[0] - a[0]).slice(0, 7);

  const fmtRt = (v) => (v ? `${(v / 1000).toFixed(2)}s` : '—');
  const el = h(
    'main.profile',
    h('header.page-head', h('button.icon-btn', { type: 'button', 'aria-label': t('nav.back'), onclick: () => go('home') }, '←'), h('h1', t('profile.title'))),
    h(
      'section.pf-hero',
      h('div.pf-radar', { html: radarChart(radarVals, { size: 340 }) }),
      h(
        'div.pf-summary',
        h('div.pf-index', h('small', t('profile.index')), h('b', played.length ? String(profile.globalIndex()) : '—'), h('span', t('profile.indexNote'))),
        h(
          'div.pf-stats',
          [
            [t('profile.sessions'), st.sessions],
            [t('profile.challenges'), st.challenges],
            [t('profile.accuracy'), st.trials ? `${Math.round(profile.accuracy() * 100)}%` : '—'],
            [t('profile.avgRt'), fmtRt(profile.avgReactionRt())],
            [t('profile.bestRt'), fmtRt(st.bestRt)],
            [t('profile.bestStreak'), st.bestStreak],
            [t('profile.totalScore'), st.totalScore.toLocaleString()],
            [t('profile.playTime'), `${Math.round(st.playMs / 60000)} min`],
          ].map(([k, v]) => h('div.pf-stat', h('small', k), h('b', String(v)))),
        ),
        h('div.pf-best', ['quick', 'standard', 'challenge', 'daily'].map((m) => h('div', h('small', t(`mode.${m}`)), h('b', (profile.state.best[m] || 0).toLocaleString())))),
      ),
    ),
    h('section.pf-section', h('h3', t('profile.skills')), h('div.skill-cards', skillCards)),
    evo,
    h('section.pf-section', h('h3', t('profile.challengesTitle')), h('p.set-help', t('profile.practiceHint')), challenges),
    h(
      'section.pf-section',
      h('h3', t('profile.dailyTitle')),
      dailies.length
        ? h('div.daily-list', dailies.map(([n, d]) => h(`div.daily-row${Number(n) === today ? '.is-today' : ''}`, h('span', `#${n}`), h('span', d.date), h('b', d.score.toLocaleString()))))
        : h('p.empty', t('profile.noDaily')),
    ),
    h('p.disclaimer', t('home.disclaimer')),
  );

  const onKey = (e) => {
    if (e.key === 'Escape' || e.key === 'Backspace') go('home');
  };
  document.addEventListener('keydown', onKey);
  return { el, cleanup: () => document.removeEventListener('keydown', onKey) };
}
