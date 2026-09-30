import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { jobText } from './i18n.js';
import { useLang, JobCard, QualCard, Countdown, CopyLinkButton } from './ui.js';

function derive(view) {
  const byId = Object.fromEntries(view.players.map((p) => [p.id, p]));
  const r = view.round;
  return {
    byId,
    r,
    isHost: view.hostId === view.me,
    employer: r ? byId[r.employerId] : null,
    isEmployer: r?.employerId === view.me,
    isApplicant: Boolean(r?.applicants.includes(view.me)),
    nameOf: (id) => byId[id]?.name ?? '',
  };
}

export function Table({ view, act, offset }) {
  const d = derive(view);
  let board;
  if (view.phase === 'over') board = html`<${GameOver} view=${view} d=${d} act=${act} />`;
  else if (view.phase === 'prep') board = html`<${Prep} view=${view} d=${d} act=${act} offset=${offset} />`;
  else if (view.phase === 'interview') board = html`<${Interview} view=${view} d=${d} act=${act} offset=${offset} />`;
  else if (view.phase === 'decision') board = html`<${Decision} view=${view} d=${d} act=${act} />`;
  else board = html`<${Result} view=${view} d=${d} act=${act} />`;

  return html`
    <div class="table">
      <section class="board">
        ${view.phase !== 'over' && html`<${RoundHeader} view=${view} d=${d} />`}
        ${board}
      </section>
      <${Roster} view=${view} act=${act} />
    </div>
  `;
}

function RoundHeader({ view, d }) {
  const { T } = useLang();
  return html`
    <div class="round-head">
      <${JobCard} job=${d.r.job} employerName=${d.employer?.name} />
      <div class="round-meta">
        <p class="round-no">${T('roundOf', { n: view.roundNumber, total: view.totalRounds })}</p>
        <p class="round-employer">
          <span class="tag tag-employer">${T('employer')}</span> ${d.employer?.name}
        </p>
        ${d.r.job === -1 && html`<p class="round-note">${T('myJobHint', { name: d.employer?.name })}</p>`}
      </div>
    </div>
  `;
}

// ---------- résumé building ----------

function Prep({ view, d, act, offset }) {
  const { T } = useLang();
  const r = d.r;
  // { from: 'hand' | 'pool', idx }
  const [selected, setSelected] = useState(null);
  const me = d.byId[view.me];
  const locked = me?.ready;

  useEffect(() => {
    if (locked) setSelected(null);
  }, [locked]);

  function tap(from, idx) {
    if (!d.isApplicant || locked) return;
    if (!selected || selected.from === from) {
      setSelected(selected?.from === from && selected.idx === idx ? null : { from, idx });
      return;
    }
    const handIdx = from === 'hand' ? idx : selected.idx;
    const poolIdx = from === 'pool' ? idx : selected.idx;
    setSelected(null);
    act('game:swap', { handIdx, poolIdx, card: r.pool[poolIdx] });
  }

  const applicants = r.applicants.map((id) => d.byId[id]);
  const readyCount = applicants.filter((p) => p.ready).length;
  const canStart = d.isEmployer || (d.isHost && !d.employer?.connected);
  const clickable = d.isApplicant && !locked;

  let title = T('prepWaitTitle');
  let help = '';
  if (d.isApplicant) [title, help] = [T('prepTitle'), T('prepHelp')];
  else if (d.isEmployer) [title, help] = [T('prepEmployerTitle'), T('prepEmployerHelp')];
  else help = T('spectating');

  return html`
    <div class="phase">
      <div class="phase-head">
        <div>
          <h2 class="phase-title">${title}</h2>
          ${help && html`<p class="phase-help">${help}</p>`}
        </div>
        <${Countdown} startedAt=${r.prepStartedAt} seconds=${view.prepSeconds} offset=${offset} />
      </div>

      <h3 class="zone-title">${T('pool')}</h3>
      <div class="card-grid pool">
        ${r.pool.map(
          (id, i) => html`<${QualCard}
            key=${id}
            id=${id}
            selected=${selected?.from === 'pool' && selected.idx === i}
            onClick=${clickable ? () => tap('pool', i) : null}
          />`,
        )}
      </div>

      ${d.isApplicant &&
      html`
        <div class="hand-zone ${locked ? 'is-locked' : ''}">
          <h3 class="zone-title">${T('yourResume')}</h3>
          <div class="card-grid hand">
            ${r.hand.map(
              (id, i) => html`<${QualCard}
                key=${id}
                id=${id}
                selected=${selected?.from === 'hand' && selected.idx === i}
                onClick=${clickable ? () => tap('hand', i) : null}
              />`,
            )}
          </div>
          <div class="actions">
            <button
              type="button"
              class="btn ${locked ? '' : 'btn-primary'}"
              onClick=${() => act('game:ready', { ready: !locked })}
            >
              ${locked ? T('notReady') : T('imReady')}
            </button>
            ${locked && html`<p class="status-line">${T('lockedHint')}</p>`}
          </div>
        </div>
      `}

      <div class="actions">
        <p class="status-line">${T('readyCount', { n: readyCount, total: applicants.length })}</p>
        ${canStart &&
        html`<button type="button" class="btn ${d.isEmployer ? 'btn-primary' : ''}" onClick=${() => act('game:startInterviews')}>
          ${T('startInterviews')}
        </button>`}
      </div>
    </div>
  `;
}

// ---------- interviews ----------

function Resume({ view, d, id, act, children, stamp = false, compact = false }) {
  const { T } = useLang();
  const r = d.r;
  const isMine = id === view.me;
  const isCurrent = r.currentId === id;
  const shown = r.resumes[id] ?? [];
  const p = d.byId[id];
  return html`
    <article class="resume ${compact ? 'is-compact' : ''} ${isCurrent ? 'is-current' : ''} ${p?.connected ? '' : 'is-offline'}">
      <header class="resume-head">
        <h3 class="resume-name">${p?.name}${isMine && html` <span class="tag">${T('you')}</span>`}</h3>
        ${children}
      </header>
      <div class="card-grid resume-cards">
        ${shown.map((card, i) => {
          // I can see my own unrevealed cards (except in "running late" mode, where r.hand is masked).
          const mineHidden = isMine && card == null;
          const ownCard = mineHidden ? r.hand[i] : card;
          const canReveal = mineHidden && isCurrent && view.phase === 'interview';
          return html`<${QualCard}
            key=${i}
            id=${ownCard ?? null}
            pending=${mineHidden && ownCard != null}
            label=${canReveal ? T('tapToReveal') : ''}
            onClick=${canReveal ? () => act('game:reveal', { handIdx: i }) : null}
          />`;
        })}
      </div>
      ${stamp && html`<p class="stamp" aria-live="polite">${T('stamp')}</p>`}
    </article>
  `;
}

function Interview({ view, d, act, offset }) {
  const { T } = useLang();
  const r = d.r;
  const current = r.currentId;
  const isMe = current === view.me;
  const canAdvance = d.isEmployer || (d.isHost && !d.employer?.connected);
  const idx = r.applicants.indexOf(current);
  const done = r.applicants.slice(0, idx);
  const upcoming = r.applicants.slice(idx + 1);

  let help = '';
  if (isMe) help = T('yourTurnHelp');
  else if (d.isEmployer) help = T('employerAsk');
  else if (!d.isApplicant) help = T('spectating');

  return html`
    <div class="phase">
      <div class="phase-head">
        <div>
          <h2 class="phase-title">${isMe ? T('yourTurnTitle') : T('nowPitching', { name: d.nameOf(current) })}</h2>
          ${help && html`<p class="phase-help">${help}</p>`}
        </div>
        <${Countdown} key=${current} startedAt=${r.turnStartedAt} seconds=${view.settings.pitchSeconds} offset=${offset} />
      </div>

      <${Resume} view=${view} d=${d} id=${current} act=${act} />

      <div class="actions">
        ${isMe &&
        html`<button type="button" class="btn btn-primary" onClick=${() => act('game:finishPitch')}>${T('finishPitch')}</button>`}
        ${!isMe &&
        canAdvance &&
        html`<button type="button" class="btn ${d.isEmployer ? 'btn-primary' : ''}" onClick=${() => act('game:finishPitch')}>
          ${T('nextApplicant')}
        </button>`}
      </div>

      ${upcoming.length > 0 &&
      html`<h3 class="zone-title">${T('upNext')}</h3>
        <div class="resume-list">
          ${upcoming.map((id) => html`<${Resume} key=${id} view=${view} d=${d} id=${id} act=${act} compact />`)}
        </div>`}
      ${done.length > 0 &&
      html`<h3 class="zone-title">${T('pitched')}</h3>
        <div class="resume-list">
        ${done.map((id) => html`<${Resume} key=${id} view=${view} d=${d} id=${id} act=${act} compact />`)}
      </div>`}
    </div>
  `;
}

// ---------- hiring ----------

function Decision({ view, d, act }) {
  const { T } = useLang();
  const decider = d.employer?.connected ? d.employer.id : view.hostId;
  const canHire = view.me === decider;
  return html`
    <div class="phase">
      <div class="phase-head">
        <div>
          <h2 class="phase-title">${T('decisionTitle')}</h2>
          <p class="phase-help">${canHire ? T('decisionHelp') : T('deciding', { name: d.nameOf(decider) })}</p>
        </div>
      </div>
      <div class="resume-list">
        ${d.r.applicants.map(
          (id) => html`<${Resume} key=${id} view=${view} d=${d} id=${id} act=${act}>
            ${canHire &&
            html`<button type="button" class="btn btn-primary btn-sm" onClick=${() => act('game:hire', { playerId: id })}>
              ${T('hire')}
            </button>`}
          <//>`,
        )}
      </div>
    </div>
  `;
}

function Result({ view, d, act }) {
  const { T } = useLang();
  const winner = d.r.winnerId;
  const canContinue = d.isEmployer || (d.isHost && !d.employer?.connected);
  const isLast = view.roundNumber >= view.totalRounds;
  const others = d.r.applicants.filter((id) => id !== winner);
  return html`
    <div class="phase">
      <div class="phase-head">
        <h2 class="phase-title">${winner ? T('gotTheJob', { name: d.nameOf(winner) }) : T('nobodyHired')}</h2>
      </div>
      ${winner && html`<${Resume} view=${view} d=${d} id=${winner} act=${act} stamp />`}
      <div class="actions">
        ${canContinue
          ? html`<button type="button" class="btn btn-primary btn-lg" onClick=${() => act('game:nextRound')}>
              ${isLast ? T('seeResults') : T('nextRound')}
            </button>`
          : html`<p class="status-line">${T('waitNext', { name: d.employer?.connected ? d.employer.name : d.nameOf(view.hostId) })}</p>`}
      </div>
      ${winner &&
      others.length > 0 &&
      html`<div class="resume-list">
        ${others.map((id) => html`<${Resume} key=${id} view=${view} d=${d} id=${id} act=${act} compact />`)}
      </div>`}
    </div>
  `;
}

// ---------- end of game ----------

function GameOver({ view, d, act }) {
  const { lang, T } = useLang();
  const ranked = [...view.players].sort((a, b) => b.jobs.length - a.jobs.length);
  const best = ranked[0]?.jobs.length ?? 0;
  const winners = best > 0 ? ranked.filter((p) => p.jobs.length === best) : [];
  const jobCount = (n) => (n === 0 ? T('noJobs') : n === 1 ? T('job') : T('jobs', { n }));

  return html`
    <div class="phase game-over">
      ${winners.length > 0 &&
      html`<div class="plaque">
        <p class="plaque-title">${winners.length > 1 ? T('overTitleMany') : T('overTitle')}</p>
        <p class="plaque-name">${winners.map((p) => p.name).join(' & ')}</p>
        <p class="plaque-count">${jobCount(best)}</p>
      </div>`}
      <ol class="ranking">
        ${ranked.map(
          (p) => html`<li>
            <p class="ranking-name">${p.name} <span class="ranking-count">${jobCount(p.jobs.length)}</span></p>
            <ul class="job-tags">
              ${p.jobs.map((j) => html`<li class="job-tag">${jobText(lang, j.job, j.employer)}</li>`)}
            </ul>
          </li>`,
        )}
      </ol>
      <div class="actions">
        ${d.isHost
          ? html`<button type="button" class="btn btn-primary btn-lg" onClick=${() => act('game:lobby')}>${T('playAgain')}</button>`
          : html`<p class="status-line">${T('waitAgain', { name: d.nameOf(view.hostId) })}</p>`}
      </div>
    </div>
  `;
}

// ---------- players sidebar ----------

export function Roster({ view, act }) {
  const { T } = useLang();
  const d = view.round ? derive(view) : null;
  const isHost = view.hostId === view.me;
  const inGame = ['prep', 'interview', 'decision', 'result'].includes(view.phase);
  const [confirming, setConfirming] = useState(false);

  return html`
    <aside class="roster" aria-label=${T('players')}>
      <div class="roster-head">
        <h2 class="roster-title">${T('players')} <span class="count">${view.players.length}</span></h2>
        ${view.phase !== 'lobby' &&
        html`<p class="roster-room">${T('roomLabel', { code: view.code })} <${CopyLinkButton} className="btn btn-ghost btn-sm" /></p>`}
      </div>
      <ul class="roster-list">
        ${view.players.map((p) => {
          const employer = inGame && d?.r.employerId === p.id;
          const ready = view.phase === 'prep' && p.ready;
          return html`<li class="player ${p.connected ? '' : 'is-offline'} ${p.id === view.me ? 'is-me' : ''}">
            <span class="player-name">${p.name}</span>
            <span class="player-tags">
              ${p.id === view.me && html`<span class="tag">${T('you')}</span>`}
              ${p.id === view.hostId && html`<span class="tag">${T('host')}</span>`}
              ${employer && html`<span class="tag tag-employer">${T('employer')}</span>`}
              ${ready && html`<span class="tag tag-ready">${T('readyTag')}</span>`}
              ${!p.connected && html`<span class="tag">${T('offline')}</span>`}
            </span>
            ${view.phase !== 'lobby' &&
            html`<span class="player-score" title=${p.jobs.length}>
              ${p.jobs.map(() => html`<span class="folder-pip" aria-hidden="true"></span>`)}
              <span class="visually-hidden">${p.jobs.length}</span>
            </span>`}
            ${view.phase === 'lobby' &&
            isHost &&
            p.id !== view.me &&
            html`<button type="button" class="btn btn-ghost btn-sm" onClick=${() => act('game:kick', { playerId: p.id })}>
              ${T('remove')}
            </button>`}
          </li>`;
        })}
      </ul>

      ${isHost &&
      inGame &&
      html`<div class="host-tools">
        <h3 class="zone-title">${T('hostTools')}</h3>
        ${view.phase !== 'result' &&
        html`<button type="button" class="btn btn-ghost btn-sm" onClick=${() => act('game:skipRound')}>${T('skipRound')}</button>`}
        ${confirming
          ? html`<span class="confirm">
              <button type="button" class="btn btn-danger btn-sm" onClick=${() => { setConfirming(false); act('game:end'); }}>
                ${T('confirmEnd')}
              </button>
              <button type="button" class="btn btn-ghost btn-sm" onClick=${() => setConfirming(false)}>${T('cancel')}</button>
            </span>`
          : html`<button type="button" class="btn btn-ghost btn-sm" onClick=${() => setConfirming(true)}>${T('endGame')}</button>`}
      </div>`}
    </aside>
  `;
}
