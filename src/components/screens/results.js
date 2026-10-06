import { h, countUp } from '../../utils/dom.js';
import { t } from '../../game/i18n.js';
import { go, app } from '../ui.js';
import { SKILLS } from '../../data/skills.js';
import { profile } from '../../game/playerProfile.js';
import { sfx } from '../../game/audio.js';

export function resultsScreen({ summary }) {
  const sm = summary;
  const scoreEl = h('b.res-score', '0');
  const acc = Math.round(sm.accuracy * 100);

  const stat = (label, value, cls = '') => h(`div.res-stat${cls ? '.' + cls : ''}`, h('small', label), h('b', value));

  const skills = sm.skills.map((s, i) => {
    const sk = SKILLS[s.skill];
    const d0 = Math.round(s.diffStart * 100);
    const d1 = Math.round(s.diffEnd * 100);
    const delta = d1 - d0;
    return h(
      'div.res-skill',
      { '--c': sk.color, '--i': i },
      h('span.res-skill-name', t(`skill.${s.skill}`)),
      h('div.res-skill-bar', h('i', { style: { width: `${Math.max(4, Math.round(s.accuracy * 100))}%` } })),
      h('span.res-skill-acc', `${Math.round(s.accuracy * 100)}%`),
      sm.mode === 'daily'
        ? h('span.res-skill-diff', `×${s.challenges}`)
        : h('span.res-skill-diff', { class: delta > 0 ? 'up' : delta < 0 ? 'down' : '' }, `${delta > 0 ? '▲' : delta < 0 ? '▼' : '◆'} ${d1}`),
    );
  });

  const timeline = h(
    'div.res-timeline',
    sm.history.map((x, i) =>
      h('div.tl-item', { '--c': SKILLS[x.skill].color, '--i': i, title: `${t(`ch.${x.type}.name`)} · ${Math.round(x.accuracy * 100)}%` },
        h('i', { style: { height: `${Math.max(10, Math.round(x.accuracy * 100))}%` } }),
        h('span', t(`ch.${x.type}.name`).slice(0, 3)),
      ),
    ),
  );

  const isDaily = sm.mode === 'daily';
  const el = h(
    'main.results',
    h('div.res-head', h('p.res-kicker', isDaily ? t('res.dailyKicker', { n: sm.dailyNumber }) : sm.typeId ? `${t('mode.practice')} · ${t(`ch.${sm.typeId}.name`)}` : t(`mode.${sm.mode}`)), h('h1.res-title', t('res.title'))),
    h(
      'div.res-hero',
      h('small', isDaily ? t('res.dailyScore') : t('res.score')),
      scoreEl,
      sm.isRecord ? h('div.badge.badge-record', t('res.record')) : sm.prevBest ? h('div.res-prev', t('res.prevBest', { n: sm.prevBest.toLocaleString() })) : null,
    ),
    h(
      'div.res-stats',
      stat(t('res.accuracy'), `${acc}%`),
      stat(t('res.challenges'), String(sm.challenges)),
      stat(t('res.bestStreak'), String(sm.bestStreak)),
      stat(t('res.reaction'), sm.avgReactionRt ? `${(sm.avgReactionRt / 1000).toFixed(2)}s` : '—'),
      stat(t('res.perfects'), String(sm.perfects)),
      stat(t('res.index'), String(profile.globalIndex())),
    ),
    h('section.res-section', h('h3', t('res.bySkill')), h('div.res-skills', skills)),
    sm.history.length ? h('section.res-section', h('h3', t('res.timeline')), timeline) : null,
    sm.recommendBreak ? h('div.break-note', h('b', t('res.breakTitle')), h('span', t('res.breakBody'))) : h('p.res-note', t('res.note')),
    h(
      'div.res-actions',
      h('button.btn.btn-primary', { type: 'button', onclick: () => go('play', { mode: isDaily ? 'quick' : sm.mode, typeId: sm.typeId }), 'data-autofocus': true }, isDaily ? t('res.playQuick') : t('res.again')),
      h('button.btn.btn-ghost', { type: 'button', onclick: () => go('profile') }, t('nav.profile')),
      h('button.btn.btn-ghost', { type: 'button', onclick: () => go('home') }, t('nav.home')),
    ),
  );

  return {
    el,
    onShow: () => {
      countUp(scoreEl, sm.score, { duration: 1400 });
      if (sm.isRecord) {
        setTimeout(() => {
          sfx('perfect');
          const r = scoreEl.getBoundingClientRect();
          app.background?.burst(r.left + r.width / 2, r.top + r.height / 2, '#ffc53d', 70);
          app.background?.surge('#ff4fd8');
        }, 1300);
      }
    },
  };
}
