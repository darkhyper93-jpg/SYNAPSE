// Play screen: runs a session (intro → countdown → challenge → feedback → summary → … → results).
import { h, now, countUp, replay } from '../../utils/dom.js';
import { t } from '../../game/i18n.js';
import { go, app, holdFocus } from '../ui.js';
import { profile } from '../../game/playerProfile.js';
import { settings } from '../../game/settings.js';
import { storage } from '../../game/storage.js';
import { SessionManager } from '../../engine/sessionManager.js';
import { SKILLS, masteryFor } from '../../data/skills.js';
import { sfx } from '../../game/audio.js';
import { haptic } from '../../game/haptics.js';
import { flyPoints, comboText, countdown, celebrate, starRating, starsFor } from '../fx.js';
import { demoFor } from '../demos.js';

// Combo words appear when the streak crosses these values (discrete questions only).
const COMBOS = [
  [3, 'combo.nice'],
  [5, 'combo.great'],
  [8, 'combo.awesome'],
  [12, 'combo.amazing'],
  [16, 'combo.unstoppable'],
  [20, 'combo.legendary'],
];

export function playScreen({ mode = 'quick', typeId, difficulty } = {}) {
  const s = settings.get();
  const session = new SessionManager({ mode, profile, settings: s, typeId, difficulty }).startSession();
  const modeId = session.mode.id; // what actually runs (an unknown practice id falls back to quick)
  let alive = true;
  let active = null; // running challenge plan
  let abort = null; // resolves the current wait when pausing
  let waitingReady = null; // resolve fn for intro / summary
  let paused = false;
  let pauseSeq = 0; // bumped by every pause: a step that awaited across one must not carry on
  let challengeStart = 0;
  let firstRun = true;

  // ---------- layout ----------
  const scoreEl = h('b.hud-score-val', '0');
  const streakEl = h('b', '0');
  const multEl = h('em.hud-mult');
  const bestEl = h('small', `${t('hud.best')} ${profile.state.stats.bestStreak}`);
  const sessionFill = h('i');
  const sessionGlow = h('b.hud-bar-glow');
  const sessionLabel = h('span.hud-progress-label');
  const quitBtn = h('button.icon-btn.pause-btn', { type: 'button', 'aria-label': t('hud.pause'), onclick: () => pause() }, h('span', '❚❚'));
  const hud = h(
    'header.hud',
    quitBtn,
    h('div.hud-mode', t(`mode.${modeId}`)),
    h('div.hud-progress', h('div.hud-bar', sessionFill, sessionGlow), sessionLabel),
    h('div.hud-streak', h('span.flame', { html: flameSVG() }), h('div', h('div.hud-streak-row', streakEl, multEl), bestEl)),
    h('div.hud-score', h('small', t('hud.score')), scoreEl),
  );
  const skillChip = h('span.skill-chip');
  const chName = h('span.ch-name');
  const dots = h('div.trial-dots');
  const head = h('div.ch-head', skillChip, chName, dots);
  const prompt = h('div.prompt', { 'aria-live': 'polite' });
  const stage = h('div.stage');
  const stageWrap = h('div.stage-wrap', stage);
  const fx = h('div.fx-layer');
  const overlay = h('div.play-overlay');
  const el = h('main.play', hud, h('section.arena', head, prompt, stageWrap, fx), overlay);
  el.dataset.mode = modeId;

  // ---------- fit-to-screen: never scroll during a challenge ----------
  // Shrinks content on small phones, enlarges it on tablets (never canvases: they size themselves).
  // Uses a transform so the layout itself never changes (hit-testing follows transforms).
  const fit = () => {
    stage.style.transform = '';
    const availH = stageWrap.clientHeight;
    const availW = stageWrap.clientWidth;
    const needH = stage.scrollHeight;
    if (!availH || !needH || !stage.children.length) return;
    let needW = 0;
    for (const c of stage.children) needW = Math.max(needW, c.offsetWidth);
    const big = Math.min(window.innerWidth, window.innerHeight) >= 700;
    const maxZ = big && !stage.querySelector('canvas') ? 1.45 : 1;
    let z = (availH - 6) / needH;
    if (needW && needW < availW) z = Math.min(z, (availW - 24) / needW);
    else if (needW > availW) z = Math.min(z, (availW - 8) / needW); // wider than the screen (5-column boards at 320 px)
    z = Math.max(0.58, Math.min(maxZ, z));
    const dy = big ? Math.max(0, (availH - needH * z) / 2.4) : 0;
    if (Math.abs(z - 1) < 0.03 && dy < 4 && needW <= availW) return; // (overflowing content is always scaled)
    stage.style.transform = `translateY(${dy.toFixed(1)}px) scale(${z.toFixed(3)})`;
  };
  const fitObserver = new MutationObserver(fit);
  fitObserver.observe(stage, { childList: true });
  const onResize = () => {
    barW = 0;
    fit();
  };
  window.addEventListener('resize', onResize);

  // ---------- HUD ----------
  // the fill scales on the compositor; its glow rides separately so scaling never squashes it
  let barW = 0; // track width, re-read after a resize
  const setFill = (p) => {
    sessionFill.style.transform = `scaleX(${p.toFixed(4)})`;
    sessionGlow.style.transform = `translateX(${(p * 100).toFixed(2)}%)`;
    // a sliver of fill only casts a faint glow (none at 0): fade it in over the first ~12px
    if (!barW) barW = sessionGlow.clientWidth;
    sessionGlow.style.opacity = Math.min(1, (p * barW) / 12).toFixed(2);
  };
  const setLabel = (text) => {
    if (sessionLabel.textContent !== text) sessionLabel.textContent = text; // no relayout when unchanged
  };
  const updateProgress = () => {
    if (session.mode.count) {
      setFill(session.index / session.mode.count);
      setLabel(`${Math.min(session.index + 1, session.mode.count)}/${session.mode.count}`);
    } else {
      const live = active && challengeStart ? now() - challengeStart : 0;
      const p = Math.min(1, (session.activeMs + live) / session.mode.duration);
      setFill(p);
      const left = Math.max(0, session.mode.duration - session.activeMs - live);
      setLabel(`${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`);
    }
  };
  const progressTimer = setInterval(updateProgress, 500);
  updateProgress();

  let shownScore = 0;
  // bump: also when a flying "+pts" chip lands after the score was already updated
  const setScore = (bump = false) => {
    if (shownScore !== session.score) {
      countUp(scoreEl, session.score, { from: shownScore, duration: 450 });
      shownScore = session.score;
    } else if (!bump) return;
    replay(scoreEl, 'bump');
  };
  const setStreak = () => {
    const st = session.streak;
    streakEl.textContent = String(st);
    hud.classList.toggle('is-hot', st >= 3);
    hud.style.setProperty('--heat', Math.min(1, st / 20).toFixed(2));
    const m = session.multiplier();
    multEl.textContent = m >= 1.06 ? `×${m.toFixed(2)}` : '';
    bestEl.textContent = `${t('hud.best')} ${Math.max(profile.state.stats.bestStreak, session.bestStreak)}`;
    replay(streakEl, 'bump');
  };

  // ---------- feedback ----------
  let fbTimer = null;
  const originPoint = (trial) => {
    const o = trial.origin;
    const r = (o && o.getBoundingClientRect ? o.getBoundingClientRect() : null) || stage.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 260) };
  };
  // One-shot effects restarted with WAAPI: no class toggling + forced reflow on every answer.
  const FLASH_PSEUDO = 'pseudoElement' in (window.KeyframeEffect?.prototype || {});
  const flashStage = (ok) => {
    if (!FLASH_PSEUDO || s.reducedMotion) return;
    stage.dataset.flash = ok ? 'ok' : 'bad';
    stage._flash?.cancel();
    stage._flash = stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease', pseudoElement: '::after' });
  };
  // composite 'add' stacks the shake on top of fit()'s inline scale instead of replacing it
  const SHAKE = [0, -7, 6, -4, 2, 0].map((x) => ({ transform: `translateX(${x}px)`, easing: 'ease' }));
  const shakeStage = () => {
    stage._shake?.cancel();
    stage._shake = stage.animate(SHAKE, { duration: 400, composite: 'add' });
  };
  const showFeedback = (trial, pts) => {
    if (trial.feedback === 'none') return;
    const color = SKILLS[active?.skill]?.color || '#2ee6ff';
    if (trial.feedback === 'mini') {
      const chip = h(`div.mini-fb${trial.correct ? '.is-ok' : '.is-bad'}${trial.forgiving ? '.is-soft' : ''}`, trial.correct ? `+${pts}` : '✕');
      fx.append(chip);
      setTimeout(() => chip.remove(), 900);
      flashStage(trial.correct);
      haptic(trial.correct ? 'tick' : 'medium');
      setScore();
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
      const p = originPoint(trial);
      haptic('light');
      flyPoints(p, scoreEl, `+${pts}`, color).then(() => setScore(true));
    } else {
      haptic('error');
      if (!s.reducedMotion) shakeStage();
    }
  };

  const hooks = {
    onTrial: (trial, ch) => {
      const prevStreak = session.streak;
      const pts = session.onTrial(trial, ch);
      if (trial.feedback !== 'none') sfx(trial.correct ? (trial.feedback === 'mini' ? 'tap' : 'correct') : 'wrong');
      showFeedback(trial, pts);
      setStreak();
      if (trial.feedback === 'full' && session.streak > prevStreak) {
        const st = session.streak;
        const hit = COMBOS.find(([n]) => n === st) || (st > 20 && st % 5 === 0 ? [st, 'combo.legendary'] : null);
        if (hit) {
          setTimeout(() => {
            if (!alive) return;
            comboText(fx, t(hit[1]), st >= 12 ? '#ff4fd8' : st >= 8 ? '#ffc53d' : '#34f5c5');
            sfx('combo');
            haptic('medium');
          }, 250);
        }
      }
      return pts;
    },
    setPrompt: (html) => {
      prompt.innerHTML = `<span>${html}</span>`;
      // A new phase begins: never let old feedback cover the next stimulus.
      fx.querySelectorAll('.feedback, .combo-text').forEach((n) => {
        n.classList.add('is-out');
        setTimeout(() => n.remove(), 250);
      });
    },
    setProgress: (i, n) => {
      if (dots.dataset.n !== String(n)) {
        dots.dataset.n = n;
        dots.innerHTML = '';
        for (let k = 0; k < n && n <= 30; k++) dots.append(h('i'));
        if (n > 30) dots.append(h('div.dots-bar', h('i')));
      }
      if (n > 30) dots.querySelector('.dots-bar i').style.transform = `scaleX(${i / n})`;
      else [...dots.children].forEach((d, k) => d.classList.toggle('is-done', k < i));
    },
    sound: (name) => sfx(name),
    haptic: (kind) => haptic(kind),
    available: () => ({ w: stageWrap.clientWidth, h: stageWrap.clientHeight }),
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

  // The app went to background (home button, call, screen off): pause immediately.
  app.onAppPause = () => {
    if (alive && !paused) pause();
  };

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

  async function intro(plan, seq) {
    const meta = plan.challenge.meta;
    const skill = SKILLS[plan.skill];
    const seen = profile.state.types[meta.id]?.plays || 0;
    const compact = seen >= 3 && modeId !== 'daily' && modeId !== 'practice';
    const lvl = masteryFor(profile.rating(plan.skill));
    clearOverlay();
    stage.innerHTML = '';
    prompt.innerHTML = '';
    dots.innerHTML = '';
    delete dots.dataset.n;
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
      compact ? null : demoFor(meta.id),
      compact ? null : h('p.intro-how', { html: t(`ch.${meta.id}.how`) }),
      compact ? null : h('p.intro-controls', { html: t(`ch.${meta.id}.controls`) }),
      h(
        'div.intro-level',
        h('span', modeId === 'daily' ? t('play.dailyStep', { n: session.index + 1, total: session.mode.count }) : `${t(`mastery.${lvl.key}`)} · ${t('play.intensity')}`),
        h('div.intensity', h('i', { style: { width: `${Math.round(plan.difficulty * 100)}%` } })),
        h('b', String(Math.round(plan.difficulty * 100))),
      ),
      readyBtn,
      compact ? h('div.auto-bar', h('i')) : null,
    );
    overlay.append(card);
    overlay.classList.add('is-on');
    if (!document.body.classList.contains('is-touch')) setTimeout(() => readyBtn.focus({ preventScroll: true }), 50);
    const ok = await waitReady(compact ? 2600 : 0);
    if (!ok) return false;
    card.classList.add('is-out');
    sfx('whoosh');
    await new Promise((r) => setTimeout(r, 220));
    // paused while the card was leaving: the pause menu owns the overlay now
    if (!alive || seq !== pauseSeq) return false;
    clearOverlay();
    return true;
  }

  async function celebrations(sum) {
    for (const ev of sum.newEvents) {
      // an interruption only delays the rest (e.g. a new challenge's unlock), it never drops them
      while (alive && paused) await waitResume();
      if (!alive) return;
      if (ev.type === 'levelup') {
        const lvl = masteryFor(profile.rating(ev.skill));
        await celebrate({
          kicker: t('cel.levelUp'),
          title: t(`skill.${ev.skill}`),
          subtitle: t('cel.levelSub', { n: lvl.level, name: t(`mastery.${lvl.key}`) }),
          color: SKILLS[ev.skill].color,
          icon: '▲',
        });
      } else if (ev.type === 'unlock') {
        await celebrate({
          kicker: t('cel.unlock'),
          title: t(`ch.${ev.typeId}.name`),
          subtitle: t(`ch.${ev.typeId}.tag`),
          color: '#ffffff',
          icon: '✦',
          extra: demoFor(ev.typeId),
          duration: 3400,
          sound: 'perfect',
        });
      }
    }
  }

  async function summaryCard(sum) {
    const skill = SKILLS[sum.skill];
    const acc = Math.round(sum.accuracy * 100);
    const dDiff = Math.round((sum.diffAfter - sum.diffBefore) * 100);
    const arrow = dDiff > 0 ? '▲' : dDiff < 0 ? '▼' : '◆';
    const stars = starsFor(sum.accuracy);
    const ts = profile.typeStats(sum.type);
    const newBest = (ts.bestStars || 0) > 0 && stars > ts.bestStars;
    ts.bestStars = Math.max(ts.bestStars || 0, stars);
    profile.saveSoon();
    const rating = starRating(stars);
    const card = h(
      'div.summary-card',
      { '--c': skill.color },
      h('div.sum-title', t(`ch.${sum.type}.name`), h('span', t('play.complete'))),
      rating,
      h(
        'div.sum-row',
        h('div.sum-ring', { '--p': acc, html: `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" class="ring-bg"/><circle cx="18" cy="18" r="15.9" class="ring-fg" style="stroke-dasharray:${acc} 100"/></svg><b>${acc}%</b>` }),
        h(
          'div.sum-info',
          h('div.sum-pts', `+${sum.points.toLocaleString()}`),
          sum.perfect ? h('div.badge.badge-perfect', t('play.perfect', { bonus: sum.bonus })) : sum.bonus ? h('div.badge', t('play.bonus', { bonus: sum.bonus })) : null,
          newBest && stars ? h('div.badge.badge-new', t('play.newStars')) : null,
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
    rating.play();
    if (sum.perfect) {
      sfx('perfect');
      haptic('success');
    }
    const ok = await waitReady(3200);
    // If the game was paused meanwhile, the pause menu now owns the overlay.
    if (ok) clearOverlay();
    return ok;
  }

  // ---------- pause ----------
  function pause() {
    if (!alive || paused) return;
    paused = true;
    pauseSeq += 1;
    session.pauseClock();
    if (active) {
      // the interrupted challenge is thrown away together with everything it earned
      const elapsed = challengeStart ? now() - challengeStart : 0;
      active.challenge.destroy();
      active = null;
      session.discardCurrent({ elapsedMs: elapsed, seen: elapsed > 0 });
      shownScore = session.score;
      countUp(scoreEl, session.score, { duration: 0 });
      setStreak();
      updateProgress();
    }
    abort?.();
    abort = null;
    // in case Android kills the app while it waits in the background
    const pending = session.pendingRecord();
    if (pending) storage.save('session.pending', pending);
    el.classList.remove('is-running');
    clearOverlay();
    const canEnd = session.history.length > 0;
    const menu = h(
      'div.pause-card',
      { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pause-title' },
      h('h2#pause-title', t('pause.title')),
      h('p', t('pause.body')),
      h('button.btn.btn-primary', { type: 'button', onclick: resume }, t('pause.resume')),
      canEnd ? h('button.btn.btn-ghost', { type: 'button', onclick: () => endSession() }, t('pause.end')) : null,
      h('button.btn.btn-ghost.btn-danger-text', { type: 'button', onclick: () => quit() }, t('pause.quit')),
    );
    overlay.append(menu);
    overlay.classList.add('is-on', 'is-pause');
    haptic('medium');
    releaseFocus = holdFocus(menu);
  }

  let loopResume = null;
  let releaseFocus = () => {};
  function resume() {
    if (!paused) return;
    paused = false;
    releaseFocus();
    session.resumeClock();
    storage.remove('session.pending');
    clearOverlay();
    loopResume?.();
  }

  function quit() {
    alive = false;
    storage.remove('session.pending');
    session.abandon(); // "quit without saving": nothing from this session stays in the profile
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
    const ac = new window.AbortController();
    const abortP = new Promise(
      (r) =>
        (abort = () => {
          ac.abort();
          r(null);
        }),
    );
    const go321 = countdown(fx, { full: firstRun && !s.reducedMotion, signal: ac.signal });
    if (!(await Promise.race([go321, abortP]))) return null;
    // only a countdown that actually finished counts (a paused one is shown in full again)
    firstRun = false;
    el.classList.add('is-running');
    challengeStart = now();
    const result = await Promise.race([plan.challenge.start(stage, hooks), abortP]);
    el.classList.remove('is-running');
    challengeStart = 0;
    return result;
  }

  const waitResume = () => new Promise((r) => (loopResume = r));

  async function loop() {
    try {
      await runLoop();
    } catch (err) {
      // never leave the player on a frozen arena: keep what was played, or go home
      console.error(err);
      if (!alive) return;
      active?.challenge.destroy();
      active = null;
      if (session.history.length) finish();
      else quit();
    }
  }

  async function runLoop() {
    while (alive) {
      // paused between steps (or before the first one): nothing starts until resume
      if (paused) {
        await waitResume();
        continue;
      }
      const plan = session.next();
      if (!plan) break;
      active = plan;
      const seq = pauseSeq;
      const ok = await intro(plan, seq);
      if (!alive) return;
      // interrupted: pause() already discarded it; a fresh one comes after resume
      if (!ok || seq !== pauseSeq) continue;
      const result = await runChallenge(plan);
      if (!alive) return;
      if (!result || seq !== pauseSeq) continue;
      active = null;
      plan.challenge.destroy();
      const sum = session.completeChallenge(plan.challenge, result);
      stage.classList.add('is-clearing');
      setTimeout(() => {
        stage.innerHTML = '';
        stage.classList.remove('is-clearing');
        prompt.innerHTML = '';
      }, 250);
      updateProgress();
      setScore();
      await celebrations(sum);
      if (!alive) return;
      while (alive && paused) await waitResume();
      if (!alive) return;
      await summaryCard(sum); // a pause during the card is handled at the top of the loop
    }
    if (alive) finish();
  }

  function finish() {
    alive = false;
    storage.remove('session.pending');
    const summary = session.finish();
    sfx('end');
    go('results', { summary, warpColor: 'rgba(255,197,61,.45)' });
  }

  return {
    el,
    onShow: () => {
      setTimeout(loop, 250);
    },
    // Android back: pause the game, or resume if already paused.
    onBack: () => {
      if (paused) resume();
      else pause();
      return true;
    },
    cleanup: () => {
      alive = false;
      active?.challenge.destroy();
      abort?.();
      loopResume?.(); // let a loop parked on "wait for resume" see it's over and exit
      releaseFocus();
      app.onAppPause = null;
      fitObserver.disconnect();
      window.removeEventListener('resize', onResize);
      clearInterval(progressTimer);
      clearTimeout(fbTimer);
      document.removeEventListener('keydown', onKey);
    },
  };
}

export function flameSVG() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff4d6d"/><stop offset=".55" stop-color="#ffb02e"/><stop offset="1" stop-color="#ffe14d"/></linearGradient></defs><path fill="url(#fl)" d="M12 2c1 3.5 5 5.6 5 10.5A5 5 0 0 1 12 18a5 5 0 0 1-5-5.5c0-2.2 1.2-3.6 2.2-4.6.2 1.6.9 2.7 2 3.2C10.8 8.4 11 5 12 2z"/><path fill="#fff6" d="M12 11c.6 1.6 2.4 2.4 2.4 4.4A2.4 2.4 0 0 1 12 18a2.4 2.4 0 0 1-2.4-2.4c0-1.3.8-2 1.4-2.6.1.6.4 1 .8 1.2-.2-1.2 0-2.2.2-3.2z"/></svg>`;
}
