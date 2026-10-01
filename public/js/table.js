import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { jobText } from './i18n.js';
import { MY_JOB } from './cards.js';
import { useLang, JobCard, QualCard, Countdown, CopyLinkButton } from './ui.js';

const IN_GAME = ['prep', 'interview', 'decision', 'tiebreak', 'result'];
const VOTING_PHASES = ['decision', 'tiebreak'];

function derive(view) {
  const byId = Object.fromEntries(view.players.map((p) => [p.id, p]));
  const r = view.round;
  const employer = r ? byId[r.employerId] : null;
  return {
    byId,
    r,
    isHost: view.hostId === view.me,
    employer,
    isEmployer: r?.employerId === view.me,
    isApplicant: Boolean(r?.applicants.includes(view.me)),
    // The employer decides; if they dropped out, the host decides for them.
    decider: employer?.connected ? employer.id : view.hostId,
    canVote: Boolean(r?.voting && VOTING_PHASES.includes(view.phase) && r.employerId !== view.me),
    nameOf: (id) => byId[id]?.name ?? '',
  };
}

export function Table({ view, act, flash, offset }) {
  const d = derive(view);
  let board;
  if (view.phase === 'over') board = html`<${GameOver} view=${view} d=${d} act=${act} />`;
  else if (view.phase === 'prep') board = html`<${Prep} view=${view} d=${d} act=${act} flash=${flash} offset=${offset} />`;
  else if (view.phase === 'interview') board = html`<${Interview} view=${view} d=${d} act=${act} offset=${offset} />`;
  else if (view.phase === 'decision') board = html`<${Decision} view=${view} d=${d} act=${act} />`;
  else if (view.phase === 'tiebreak') board = html`<${Tiebreak} view=${view} d=${d} act=${act} />`;
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
        ${d.r.job === MY_JOB && html`<p class="round-note">${T('myJobHint', { name: d.employer?.name })}</p>`}
      </div>
    </div>
  `;
}

function PhaseHead({ title, help, children }) {
  return html`
    <div class="phase-head">
      <div>
        <h2 class="phase-title">${title}</h2>
        ${help && html`<p class="phase-help">${help}</p>`}
      </div>
      ${children}
    </div>
  `;
}

// For players who joined mid-round. Nobody gets dealt in after the final round.
const spectatingText = (view, T) => T(view.roundNumber >= view.totalRounds ? 'spectatingFinal' : 'spectating');

// ---------- résumé building ----------

function Prep({ view, d, act, flash, offset }) {
  const { T } = useLang();
  const r = d.r;
  const zones = { hand: r.hand, pool: r.pool };
  // { from: 'hand' | 'pool', card }. Kept by card, not position: other applicants swap
  // with the pool too, and the selection must not jump to whatever card lands in that spot.
  const [selected, setSelected] = useState(null);
  const me = d.byId[view.me];
  const locked = me?.ready;
  const selectedGone = Boolean(selected) && !zones[selected.from].includes(selected.card);

  useEffect(() => {
    if (selectedGone && !locked) flash(T('cardTaken'));
    if (locked || selectedGone) setSelected(null);
  }, [locked, selectedGone]);

  function tap(from, idx) {
    if (!d.isApplicant || locked) return;
    const card = zones[from][idx];
    if (!selected || selected.from === from) {
      setSelected(selected?.from === from && selected.card === card ? null : { from, card });
      return;
    }
    const otherIdx = zones[selected.from].indexOf(selected.card);
    setSelected(null);
    if (otherIdx === -1) return;
    const handIdx = from === 'hand' ? idx : otherIdx;
    const poolIdx = from === 'pool' ? idx : otherIdx;
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
  else help = spectatingText(view, T);

  return html`
    <div class="phase">
      <${PhaseHead} title=${title} help=${help}>
        <${Countdown} startedAt=${r.prepStartedAt} seconds=${view.settings.prepSeconds} offset=${offset} />
      <//>

      <h3 class="zone-title">${T('pool')}</h3>
      <div class="card-grid pool">
        ${r.pool.map(
          (id, i) => html`<${QualCard}
            key=${id}
            id=${id}
            selected=${selected?.from === 'pool' && selected.card === id}
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
                selected=${selected?.from === 'hand' && selected.card === id}
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

// ---------- one applicant's résumé ----------

function VoteButton({ view, d, id, act }) {
  const { T } = useLang();
  if (!d.canVote || id === view.me || d.r.skipped) return null;
  const mine = d.r.myVote === id;
  return html`<button
    type="button"
    class="btn btn-sm vote-btn ${mine ? 'is-voted' : 'btn-ghost'}"
    aria-pressed=${mine}
    onClick=${() => act('game:vote', { playerId: id })}
  >
    <span aria-hidden="true">★</span> ${mine ? T('voted') : T('vote')}
  </button>`;
}

// The tiebreaker card under a finalist's résumé: two to choose from for the finalist,
// face down for everyone else until it's picked.
function BonusRow({ view, d, id, act }) {
  const { T } = useLang();
  const r = d.r;
  if (!r.finalists.includes(id)) return null;
  const picked = r.bonusPicks[id];
  const choosing = id === view.me && picked == null && view.phase === 'tiebreak';
  let cards;
  if (picked != null) cards = html`<${QualCard} id=${picked} bonus label=${T('bonusTag')} />`;
  else if (choosing) {
    cards = r.bonusHand.map(
      (card, i) => html`<${QualCard} key=${card} id=${card} bonus label=${T('pickThis')} onClick=${() => act('game:pickBonus', { idx: i })} />`,
    );
  } else cards = html`<${QualCard} id=${null} />`;
  return html`<div class="card-grid bonus-row ${choosing ? 'is-choosing' : ''}">${cards}</div>`;
}

function Resume({ view, d, id, act, children, stamp = false, compact = false }) {
  const { T } = useLang();
  const r = d.r;
  const isMine = id === view.me;
  const isCurrent = r.currentId === id;
  const shown = r.resumes[id] ?? [];
  const p = d.byId[id];
  const votes = r.voteCounts[id] ?? 0;
  const showVotes = view.phase === 'result' && r.voting && !r.skipped;
  return html`
    <article class="resume ${compact ? 'is-compact' : ''} ${isCurrent ? 'is-current' : ''} ${p?.connected ? '' : 'is-offline'}">
      <header class="resume-head">
        <h3 class="resume-name">
          ${p?.name}${isMine && html` <span class="tag">${T('you')}</span>`}
          ${showVotes && votes > 0 && html` <span class="tag tag-votes">★ ${votes}</span>`}
          ${r.fanFavoriteId === id && html` <span class="tag tag-favorite">${T('fanFavoriteTag')}</span>`}
        </h3>
        <div class="resume-actions">
          <${VoteButton} view=${view} d=${d} id=${id} act=${act} />
          ${children}
        </div>
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
      <${BonusRow} view=${view} d=${d} id=${id} act=${act} />
      ${stamp && html`<p class="stamp" aria-live="polite">${T('stamp')}</p>`}
    </article>
  `;
}

// `actions(id)` renders extra buttons in each résumé's header.
function ResumeList({ view, d, act, ids, compact = false, actions }) {
  if (ids.length === 0) return null;
  return html`<div class="resume-list">
    ${ids.map(
      (id) => html`<${Resume} key=${id} view=${view} d=${d} id=${id} act=${act} compact=${compact}>
        ${actions?.(id)}
      <//>`,
    )}
  </div>`;
}

function VoteStatus({ view, d }) {
  const { T } = useLang();
  const r = d.r;
  if (!r.voting || r.skipped) return null;
  let hint = '';
  if (d.canVote && !r.myVote) hint = T('voteHelp');
  else if (view.me === d.decider && r.notVoted.length > 0) hint = T('votesMissing', { names: r.notVoted.map(d.nameOf).join(', ') });
  return html`<p class="status-line">${T('votesCast', { n: r.votesCast, total: r.voters })}${hint && ` ${hint}`}</p>`;
}

// ---------- interviews ----------

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
  else if (!d.isApplicant) help = spectatingText(view, T);

  return html`
    <div class="phase">
      <${PhaseHead} title=${isMe ? T('yourTurnTitle') : T('nowPitching', { name: d.nameOf(current) })} help=${help}>
        <${Countdown} key=${current} startedAt=${r.turnStartedAt} seconds=${view.settings.pitchSeconds} offset=${offset} />
      <//>

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

      ${upcoming.length > 0 && html`<h3 class="zone-title">${T('upNext')}</h3>`}
      <${ResumeList} view=${view} d=${d} act=${act} ids=${upcoming} compact />
      ${done.length > 0 && html`<h3 class="zone-title">${T('pitched')}</h3>`}
      <${ResumeList} view=${view} d=${d} act=${act} ids=${done} compact />
    </div>
  `;
}

// ---------- hiring ----------

// Hiring closes the vote, so with votes still missing the first tap only asks to confirm.
function HireButton({ act, d, id }) {
  const { T } = useLang();
  const [asking, setAsking] = useState(false);
  const votesMissing = d.r.voting && !d.r.skipped && d.r.notVoted.length > 0;
  const confirm = asking && votesMissing;
  function hire() {
    if (votesMissing && !asking) return setAsking(true);
    act('game:hire', { playerId: id });
  }
  return html`<button type="button" class="btn btn-sm ${confirm ? 'btn-danger' : 'btn-primary'}" onClick=${hire}>
    ${confirm ? T('hireAnyway') : T('hire')}
  </button>`;
}

function Decision({ view, d, act }) {
  const { T } = useLang();
  const r = d.r;
  const canHire = view.me === d.decider;
  const [finalists, setFinalists] = useState([]);
  const candidates = r.applicants.filter((id) => d.byId[id]?.connected);
  // With only two applicants there is nothing to choose: both are finalists.
  const pickFinalists = candidates.length > 2;
  const chosen = pickFinalists ? finalists.filter((id) => candidates.includes(id)) : candidates;
  const toggle = (id) => setFinalists((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  let help = T('deciding', { name: d.nameOf(d.decider) });
  if (canHire) help = T('decisionHelp');

  return html`
    <div class="phase">
      <${PhaseHead} title=${T('decisionTitle')} help=${help} />
      <${VoteStatus} view=${view} d=${d} />
      <${ResumeList}
        view=${view}
        d=${d}
        act=${act}
        ids=${r.applicants}
        actions=${(id) =>
          canHire &&
          html`
            ${pickFinalists &&
            candidates.includes(id) &&
            html`<button
              type="button"
              class="btn btn-ghost btn-sm"
              aria-pressed=${chosen.includes(id)}
              onClick=${() => toggle(id)}
            >
              ${chosen.includes(id) ? '✓ ' : ''}${T('finalist')}
            </button>`}
            <${HireButton} act=${act} d=${d} id=${id} />
          `}
      />
      ${canHire &&
      candidates.length >= 2 &&
      html`<div class="tiebreak-bar">
        <p>${pickFinalists ? T('tiebreakOffer') : T('tiebreakOfferTwo')}</p>
        <button
          type="button"
          class="btn"
          disabled=${chosen.length < 2}
          onClick=${() => act('game:tiebreak', { finalists: chosen })}
        >
          ${T('tiebreakStart', { n: chosen.length })}
        </button>
      </div>`}
    </div>
  `;
}

function Tiebreak({ view, d, act }) {
  const { T } = useLang();
  const r = d.r;
  const canHire = view.me === d.decider;
  const isFinalist = r.finalists.includes(view.me);
  const waiting = r.finalists.filter((id) => r.bonusPicks[id] == null);
  const others = r.applicants.filter((id) => !r.finalists.includes(id));

  let help = T('tiebreakHelpOthers');
  if (isFinalist && r.bonusPicks[view.me] == null) help = T('tiebreakHelpFinalist');
  else if (canHire) help = T('tiebreakHelpEmployer');

  return html`
    <div class="phase">
      <${PhaseHead} title=${T('tiebreakTitle')} help=${help} />
      ${waiting.length > 0 &&
      html`<p class="status-line">${T('tiebreakWaiting', { names: waiting.map(d.nameOf).join(', ') })}</p>`}
      <${VoteStatus} view=${view} d=${d} />
      <${ResumeList}
        view=${view}
        d=${d}
        act=${act}
        ids=${r.finalists}
        actions=${(id) => canHire && html`<${HireButton} act=${act} d=${d} id=${id} />`}
      />
      <${ResumeList} view=${view} d=${d} act=${act} ids=${others} compact />
    </div>
  `;
}

function Result({ view, d, act }) {
  const { T } = useLang();
  const r = d.r;
  const winner = r.winnerId;
  const canContinue = d.isEmployer || (d.isHost && !d.employer?.connected);
  const isLast = view.roundNumber >= view.totalRounds;
  const others = r.applicants.filter((id) => id !== winner);

  let favorite = '';
  if (r.voting && !r.skipped) {
    if (r.fanFavoriteId) favorite = T('fanFavorite', { name: d.nameOf(r.fanFavoriteId) });
    else favorite = r.votesCast > 0 ? T('voteTie') : T('votesNone');
  }

  return html`
    <div class="phase">
      <${PhaseHead} title=${winner ? T('gotTheJob', { name: d.nameOf(winner) }) : T('nobodyHired')} />
      ${winner && html`<${Resume} view=${view} d=${d} id=${winner} act=${act} stamp />`}
      ${favorite && html`<p class="favorite-line"><span aria-hidden="true">★</span> ${favorite}</p>`}
      <div class="actions">
        ${canContinue
          ? html`<button type="button" class="btn btn-primary btn-lg" onClick=${() => act('game:nextRound')}>
              ${isLast ? T('seeResults') : T('nextRound')}
            </button>`
          : html`<p class="status-line">${T('waitNext', { name: d.employer?.connected ? d.employer.name : d.nameOf(view.hostId) })}</p>`}
      </div>
      ${winner && html`<${ResumeList} view=${view} d=${d} act=${act} ids=${others} compact />`}
    </div>
  `;
}

// ---------- end of game ----------

const score = (p) => p.jobs.length + p.stars;

function GameOver({ view, d, act }) {
  const { lang, T } = useLang();
  const ranked = [...view.players].sort((a, b) => score(b) - score(a) || b.jobs.length - a.jobs.length);
  const best = ranked[0] ? score(ranked[0]) : 0;
  const winners = best > 0 ? ranked.filter((p) => score(p) === best) : [];
  const jobCount = (n) => (n === 0 ? T('noJobs') : n === 1 ? T('job') : T('jobs', { n }));
  const tally = (p) => (p.stars > 0 ? T('jobsAndStars', { jobs: jobCount(p.jobs.length), stars: T(p.stars === 1 ? 'star' : 'stars', { n: p.stars }) }) : jobCount(p.jobs.length));

  return html`
    <div class="phase game-over">
      ${winners.length > 0 &&
      html`<div class="plaque">
        <p class="plaque-title">${winners.length > 1 ? T('overTitleMany') : T('overTitle')}</p>
        <p class="plaque-name">${winners.map((p) => p.name).join(' & ')}</p>
        <p class="plaque-count">${tally(winners[0])}</p>
      </div>`}
      <ol class="ranking">
        ${ranked.map(
          (p) => html`<li>
            <p class="ranking-name">${p.name} <span class="ranking-count">${tally(p)}</span></p>
            <ul class="job-tags">
              ${p.jobs.map((j) => html`<li class="job-tag">${jobText(lang, j.job, j.employer)}</li>`)}
            </ul>
          </li>`,
        )}
      </ol>
      ${view.settings.votes && html`<p class="status-line">${T('scoringNote')}</p>`}
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
  const inGame = IN_GAME.includes(view.phase);
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
            html`<span class="player-score">
              ${p.jobs.map(() => html`<span class="folder-pip" aria-hidden="true"></span>`)}
              ${Array.from({ length: p.stars }, () => html`<span class="star-pip" aria-hidden="true">★</span>`)}
              <span class="visually-hidden">${T('jobsAndStars', { jobs: p.jobs.length, stars: p.stars })}</span>
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
