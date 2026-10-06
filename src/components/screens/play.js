// Play screen: runs a session (intro → challenge → feedback → summary → … → results).
import { h, now, countUp } from '../../utils/dom.js';
import { t } from '../../game/i18n.js';
import { go, app, toast } from '../ui.js';
import { profile } from '../../game/playerProfile.js';
import { settings } from '../../game/settings.js';
import { SessionManager } from '../../engine/sessionManager.js';
import { SKILLS, masteryFor } from '../../data/skills.js';
import { sfx } from '../../game/audio.js';

const STREAK_MILESTONES = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

export function playScreen({ mode = 'quick', typeId, difficulty } = {}) {
  const s = settings.get();
  const session = new SessionManager({ mode, profile, settings: s, typeId, difficulty }).startSession();
  let alive = true;
  let active = null; // running challenge
  let abort = null; // resolves the current wait when pausing
  let waitingReady = null; // resolve fn for intro / summary
  let paused = false;
  let challengeStart = 0;

  // ---------- layout ----------
  const scoreEl = h('b.hud-score-val', '0');
  const streakEl = h('b', '0');
  const bestEl = h('small', `${t('hud.best')} ${profile.state.stats.bestStreak}`);
  const sessionFill = h('i');
  const sessionLabel = h('span.hud-progress-label');
  const quitBtn = h('button.icon-btn', { type: 'button', 'aria-label': t('hud.pause'), onclick: () => pause() }, '❚❚');
  const hud = h(
    'header.hud',
    quitBtn,
    h('div.hud-mode', t(`mode.${mode}`)),
    h('div.hud-progress', h('div.hud-bar', sessionFill), sessionLabel),
    h('div.hud-streak', h('span.flame', { html: flameSVG() }), h('div', streakEl, bestEl)),
    h('div.hud-score', h('small', t('hud.score')), scoreEl),
  );
  const skillChip = h('span.skill-chip');
  const chName = h('span.ch-name');
  const dots = h('div.trial-dots');
  const head = h('div.ch-head', skillChip, chName, dots);
  const prompt = h('div.prompt', { 'aria-live': 'polite' });
  const stage = h('div.stage');
  const fx = h('div.fx-layer');
  const overlay = h('div.play-overlay');
  const el = h('main.play', hud, h('section.arena', head, prompt, stage, fx), overlay);
  el.dataset.mode = mode;

  // ---------- HUD ----------
  const updateProgress = () => {
    if (session.mode.count) {
      sessionFill.style.width = `${(session.index / session.mode.count) * 100}%`;
      sessionLabel.textContent = `${Math.min(session.index + 1, session.mode.count)}/${session.mode.count}`;
    } else {
      const live = active && challengeStart ? now() - challengeStart : 0;
      const p = Math.min(1, (session.activeMs + live) / session.mode.duration);
      sessionFill.style.width = `${p * 100}%`;
      const left = Math.max(0, session.mode.duration - session.activeMs - live);
      sessionLabel.textContent = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
    }
  };
  const progressTimer = setInterval(updateProgress, 500);
  updateProgress();

  let shownScore = 0;
  const setScore = () => {
    countUp(scoreEl, session.score, { from: shownScore, duration: 450 });
    shownScore = session.score;
  };
  const setStreak = () => {
    streakEl.textContent = String(session.streak);
    hud.classList.toggle('is-hot', session.streak >= 5);
    bestEl.textContent = `${t('hud.best')} ${Math.max(profile.state.stats.bestStreak, session.bestStreak)}`;
  };

  // ---------- feedback ----------
  let fbTimer = null;
  const showFeedback = (trial, pts) => {
    if (trial.feedback === 'none') return;
    const color = SKILLS[active?.skill]?.color || '#2ee6ff';
    if (trial.feedback === 'mini') {
      const chip = h(`div.mini-fb${trial.correct ? '.is-ok' : '.is-bad'}${trial.forgiving ? '.is-soft' : ''}`, trial.correct ? `+${pts}` : '✕');
      fx.append(chip);
      setTimeout(() => chip.remove(), 900);
      stage.classList.remove('flash-ok', 'flash-bad');
      void stage.offsetWidth;
      stage.classList.add(trial.correct ? 'flash-ok' : 'flash-bad');
      return;
    }
    clearTimeout(fbTimer);
    fx.querySelectorAll('.feedback').forEach((n) => n.remove());
    const rt = trial.rt != null ? `${(trial.rt / 1000).toFixed(2)}s` : '';
    const card = trial.correct
      ? h('div.feedback.is-ok', h('div.fb-title', h('span.fb-icon', '✓'), t('fb.correct')), h('div.fb-meta', h('b.fb-pts', `+${pts}`), rt ? h('span', rt) : null))
      : h(
          'div.feedback.is-bad',
          h('div.fb-title', h('span.fb-icon', trial.timedOut ? '⏱' : '✕'), trial.timedOut ? t('fb.timeout') : t('fb.wrong')),
          trial.answerLabel ? h('div.fb-answer', t('fb.answer', { a: trial.answerLabel })) : null,
          rt ? h('div.fb-meta', h('span', rt)) : null,
        );
    if (trial.explanation) card.append(h('div.fb-explain', trial.explanation));
    fx.append(card);
    fbTimer = setTimeout(() => {
      card.classList.add('is-out');
      setTimeout(() => card.remove(), 300);
    }, trial.explanation ? 2000 : 1300);
    if (trial.correct) {
      const r = stage.getBoundingClientRect();
      app.background?.burst(r.left + r.width / 2, r.top + Math.min(r.height / 2, 260), color, 30);
    } else if (!s.reducedMotion) {
      stage.classList.remove('shake');
      void stage.offsetWidth;
      stage.classList.add('shake');
    }
  };

  const hooks = {
    onTrial: (trial, ch) => {
      const prevStreak = session.streak;
      const pts = session.onTrial(trial, ch);
      if (trial.feedback !== 'none') sfx(trial.correct ? (trial.feedback === 'mini' ? 'tap' : 'correct') : 'wrong');
      showFeedback(trial, pts);
      setScore();
      setStreak();
      if (session.streak > prevStreak && STREAK_MILESTONES.includes(session.streak)) {
        toast(t('fb.streak', { n: session.streak }), { color: '#ffb02e', icon: '🔥', duration: 1600 });
        app.background?.surge('#ffb02e');
      }
      return pts;
    },
    setPrompt: (html) => {
      prompt.innerHTML = `<span>${html}</span>`;
      // A new phase begins: never let old feedback cover the next stimulus.
      fx.querySelectorAll('.feedback').forEach((n) => {
        n.classList.add('is-out');
        setTimeout(() => n.remove(), 250);
      });
    },
    setProgress: (i, n) => {
      if (dots.childElementCount !== n) {
        dots.innerHTML = '';
        for (let k = 0; k < n && n <= 30; k++) dots.append(h('i'));
        if (n > 30) dots.append(h('div.dots-bar', h('i')));
      }
      if (n > 30) dots.querySelector('.dots-bar i').style.width = `${(i / n) * 100}%`;
      else [...dots.children].forEach((d, k) => d.classList.toggle('is-done', k < i));
    },
    sound: (name) => sfx(name),
  };

  // ---------- input ----------
  const onKey = (e) => {
    if (!alive) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (paused) resume();
      else pause();
      return;
    }
    if (paused) return;
    if (waitingReady && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      const fn = waitingReady;
      waitingReady = null;
      fn(true);
      return;
    }
    const tag = document.activeElement?.tagName;
    if ((e.code === 'Space' || e.key.startsWith('Arrow')) && tag !== 'BUTTON') e.preventDefault();
    if (e.repeat) return;
    active?.challenge.handleInput({ type: 'key', key: e.key, code: e.code });
  };
  document.addEventListener('keydown', onKey);

  const onVisibility = () => {
    if (document.hidden && active && !paused) pause();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // ---------- overlays ----------
  const clearOverlay = () => {
    overlay.innerHTML = '';
    overlay.className = 'play-overlay';
  };

  const waitReady = (autoMs = 0) =>
    new Promise((resolve) => {
      let timer = null;
      waitingReady = (v) => {
        clearTimeout(timer);
        waitingReady = null;
        resolve(v);
      };
      if (autoMs) timer = setTimeout(() => waitingReady?.(true), autoMs);
      abort = () => {
        clearTimeout(timer);
        waitingReady = null;
        resolve(false);
      };
    });

  async function intro(plan) {
    const meta = plan.challenge.meta;
    const skill = SKILLS[plan.skill];
    const seen = profile.state.types[meta.id]?.plays || 0;
    const compact = seen >= 3 && mode !== 'daily' && mode !== 'practice';
    const lvl = masteryFor(profile.rating(plan.skill));
    clearOverlay();
    stage.innerHTML = '';
    prompt.innerHTML = '';
    dots.innerHTML = '';
    skillChip.textContent = t(`skill.${plan.skill}`);
    skillChip.style.setProperty('--c', skill.color);
    chName.textContent = t(`ch.${meta.id}.name`);
    el.style.setProperty('--skill', skill.color);
    el.style.setProperty('--skill-glow', skill.glow);

    const readyBtn = h('button.btn.btn-primary.ready-btn', { type: 'button', onclick: () => waitingReady?.(true) }, h('span', t('play.ready')), h('kbd.key-hint', 'SPACE'));
    const card = h(
      `div.intro-card${compact ? '.is-compact' : ''}`,
      h('div.intro-skill', h('i'), t(`skill.${plan.skill}`), meta.secondary ? h('span.intro-plus', `+ ${t(`skill.${meta.secondary}`)}`) : null),
      h('h2.intro-name', { 'data-text': t(`ch.${meta.id}.name`) }, t(`ch.${meta.id}.name`)),
      h('p.intro-tag', t(`ch.${meta.id}.tag`)),
      compact ? null : h('p.intro-how', { html: t(`ch.${meta.id}.how`) }),
      compact ? null : h('p.intro-controls', { html: t(`ch.${meta.id}.controls`) }),
      h(
        'div.intro-level',
        h('span', mode === 'daily' ? t('play.dailyStep', { n: session.index + 1, total: session.mode.count }) : `${t(`mastery.${lvl.key}`)} · ${t('play.intensity')}`),
        h('div.intensity', h('i', { style: { width: `${Math.round(plan.difficulty * 100)}%` } })),
        h('b', String(Math.round(plan.difficulty * 100))),
      ),
      readyBtn,
      compact ? h('div.auto-bar', h('i')) : null,
    );
    overlay.append(card);
    overlay.classList.add('is-on');
    setTimeout(() => readyBtn.focus({ preventScroll: true }), 50);
    const ok = await waitReady(compact ? 2600 : 0);
    if (!ok) return false;
    clearOverlay();
    sfx('go');
    return true;
  }

  async function summaryCard(sum) {
    const skill = SKILLS[sum.skill];
    const acc = Math.round(sum.accuracy * 100);
    const dDiff = Math.round((sum.diffAfter - sum.diffBefore) * 100);
    const arrow = dDiff > 0 ? '▲' : dDiff < 0 ? '▼' : '◆';
    const card = h(
      'div.summary-card',
      { '--c': skill.color },
      h('div.sum-title', t(`ch.${sum.type}.name`), h('span', t('play.complete'))),
      h(
        'div.sum-row',
        h('div.sum-ring', { '--p': acc, html: `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" class="ring-bg"/><circle cx="18" cy="18" r="15.9" class="ring-fg" style="stroke-dasharray:${acc} 100"/></svg><b>${acc}%</b>` }),
        h(
          'div.sum-info',
          h('div.sum-pts', `+${sum.points.toLocaleString()}`),
          sum.perfect ? h('div.badge.badge-perfect', t('play.perfect', { bonus: sum.bonus })) : sum.bonus ? h('div.badge', t('play.bonus', { bonus: sum.bonus })) : null,
          session.mode.adapt !== 'none'
            ? h('div.sum-diff', h('span', t(`skill.${sum.skill}`)), h('b', { class: dDiff > 0 ? 'up' : dDiff < 0 ? 'down' : '' }, `${arrow} ${Math.round(sum.diffAfter * 100)}`))
            : null,
          sum.eased ? h('div.sum-note', t('play.eased')) : null,
        ),
      ),
      h('button.btn.btn-ghost.next-btn', { type: 'button', onclick: () => waitingReady?.(true) }, h('span', session.isFinished() ? t('play.results') : t('play.next')), h('kbd.key-hint', 'SPACE')),
      h('div.auto-bar', h('i')),
    );
    overlay.append(card);
    overlay.classList.add('is-on');
    if (sum.perfect) sfx('perfect');
    for (const ev of sum.newEvents) {
      if (ev.type === 'levelup') {
        toast(t('play.levelUp', { skill: t(`skill.${ev.skill}`), level: t(`mastery.${masteryFor(profile.rating(ev.skill)).key}`) }), { color: SKILLS[ev.skill].color, icon: '▲', duration: 3200 });
        sfx('levelup');
        app.background?.surge(SKILLS[ev.skill].color);
      } else if (ev.type === 'unlock') {
        toast(t('play.unlocked', { name: t(`ch.${ev.typeId}.name`) }), { color: '#ffffff', icon: '✦', duration: 3600 });
      }
    }
    const ok = await waitReady(2800);
    clearOverlay();
    return ok;
  }

  // ---------- pause ----------
  function pause() {
    if (!alive || paused) return;
    paused = true;
    if (active) {
      active.challenge.destroy();
      active = null;
    }
    abort?.();
    abort = null;
    app.background?.setMode(s.background === 'off' ? 'off' : 'calm');
    clearOverlay();
    const canEnd = session.history.length > 0;
    const menu = h(
      'div.pause-card',
      h('h2', t('pause.title')),
      h('p', t('pause.body')),
      h('button.btn.btn-primary', { type: 'button', onclick: resume, 'data-autofocus': true }, t('pause.resume')),
      canEnd ? h('button.btn.btn-ghost', { type: 'button', onclick: () => endSession() }, t('pause.end')) : null,
      h('button.btn.btn-ghost.btn-danger-text', { type: 'button', onclick: () => quit() }, t('pause.quit')),
    );
    overlay.append(menu);
    overlay.classList.add('is-on', 'is-pause');
    setTimeout(() => menu.querySelector('button')?.focus(), 40);
  }

  let loopResume = null;
  function resume() {
    if (!paused) return;
    paused = false;
    clearOverlay();
    loopResume?.();
  }

  function quit() {
    alive = false;
    go('home');
  }

  function endSession() {
    alive = false;
    finish();
  }

  // ---------- main loop ----------
  async function runChallenge(plan) {
    stage.innerHTML = '';
    document.activeElement?.blur?.();
    app.background?.setMode(s.background === 'off' ? 'off' : 'calm');
    el.classList.add('is-running');
    challengeStart = now();
    const abortP = new Promise((r) => (abort = () => r(null)));
    const result = await Promise.race([plan.challenge.start(stage, hooks), abortP]);
    el.classList.remove('is-running');
    challengeStart = 0;
    return result;
  }

  async function loop() {
    while (alive) {
      const plan = session.next();
      if (!plan) break;
      active = plan;
      app.background?.setMode(s.background === 'off' ? 'off' : s.background === 'calm' ? 'calm' : 'full');
      const ok = await intro(plan);
      if (!alive) return;
      if (!ok) {
        await new Promise((r) => (loopResume = r));
        if (!alive) return;
        continue;
      }
      const result = await runChallenge(plan);
      if (!alive) return;
      if (!result) {
        // paused mid-challenge: discard it, wait for resume, then generate a fresh one
        await new Promise((r) => (loopResume = r));
        if (!alive) return;
        continue;
      }
      active = null;
      plan.challenge.destroy();
      const sum = session.completeChallenge(plan.challenge, result);
      updateProgress();
      setScore();
      app.background?.setMode(s.background === 'off' ? 'off' : s.background === 'calm' ? 'calm' : 'full');
      const okSum = await summaryCard(sum);
      if (!alive) return;
      if (!okSum) {
        await new Promise((r) => (loopResume = r));
        if (!alive) return;
      }
    }
    if (alive) finish();
  }

  function finish() {
    alive = false;
    const summary = session.finish();
    sfx('end');
    go('results', { summary });
  }

  return {
    el,
    onShow: () => {
      setTimeout(loop, 250);
    },
    cleanup: () => {
      alive = false;
      active?.challenge.destroy();
      abort?.();
      clearInterval(progressTimer);
      clearTimeout(fbTimer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      app.background?.setMode(s.background || 'full');
    },
  };
}

export function flameSVG() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff4d6d"/><stop offset=".55" stop-color="#ffb02e"/><stop offset="1" stop-color="#ffe14d"/></linearGradient></defs><path fill="url(#fl)" d="M12 2c1 3.5 5 5.6 5 10.5A5 5 0 0 1 12 18a5 5 0 0 1-5-5.5c0-2.2 1.2-3.6 2.2-4.6.2 1.6.9 2.7 2 3.2C10.8 8.4 11 5 12 2z"/><path fill="#fff6" d="M12 11c.6 1.6 2.4 2.4 2.4 4.4A2.4 2.4 0 0 1 12 18a2.4 2.4 0 0 1-2.4-2.4c0-1.3.8-2 1.4-2.6.1.6.4 1 .8 1.2-.2-1.2 0-2.2.2-3.2z"/></svg>`;
}
