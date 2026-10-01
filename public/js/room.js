import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { errorText } from './i18n.js';
import { QUALS, JOBS, setCustomCards } from './cards.js';
import { socket, call } from './net.js';
import { useLang, navigate, storage, CopyLinkButton, Toast } from './ui.js';
import { Table, Roster } from './table.js';

// Seats are kept by a token on this device, so closing the tab or the browser doesn't lose yours.
const local = storage('local');

export function RoomScreen({ code }) {
  const { lang, T } = useLang();
  const tokenKey = `fe:token:${code}`;
  // checking → (missing | name) → joined → (closed, if the room goes away)
  const [status, setStatus] = useState('checking');
  const [view, setView] = useState(null);
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState('');
  const offset = useRef(0);
  const joined = useRef(false);
  const toastTimer = useRef();

  function flash(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }

  async function join(name) {
    const res = await call('room:join', { code, token: local.get(tokenKey), name });
    if (res.token) {
      local.set(tokenKey, res.token);
      joined.current = true;
      setStatus('joined');
      return null;
    }
    if (res.error === 'room_not_found') {
      // Having a seat here means the room existed and has since closed (server restart or idle timeout).
      const hadSeat = joined.current || Boolean(local.get(tokenKey));
      joined.current = false;
      local.set(tokenKey, null);
      setStatus(hadSeat ? 'closed' : 'missing');
    }
    return res.error;
  }

  async function newRoom() {
    const res = await call('room:create');
    if (res.code) navigate(`/${res.code}`);
    else flash(errorText(lang, res.error));
  }

  useEffect(() => {
    const onState = (state) => {
      offset.current = state.serverNow - Date.now();
      setCustomCards(state.custom);
      setView(state);
    };
    const onConnect = () => {
      setOnline(true);
      if (joined.current) join();
    };
    const onDisconnect = () => setOnline(false);
    socket.on('state', onState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    (async () => {
      if (local.get(tokenKey)) {
        const error = await join();
        if (!error) return;
        local.set(tokenKey, null);
        if (error === 'room_not_found') return;
      }
      const peek = await call('room:peek', { code });
      setStatus(peek.exists ? 'name' : 'missing');
    })();

    return () => {
      socket.off('state', onState);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      if (joined.current) call('room:leave');
      joined.current = false;
    };
  }, [code]);

  // The host removed us from the lobby.
  useEffect(() => {
    if (status === 'joined' && view && !view.players.some((p) => p.id === view.me)) {
      joined.current = false;
      local.set(tokenKey, null);
      call('room:leave');
      setView(null);
      setStatus('name');
    }
  }, [view, status]);

  async function act(event, payload) {
    const res = await call(event, payload);
    if (res.error) flash(errorText(lang, res.error));
    return res;
  }

  let body;
  if (status === 'checking' || (status === 'joined' && !view)) {
    body = html`<p class="status-line">${T('connecting')}</p>`;
  } else if (status === 'missing') {
    body = html`<div class="panel narrow">
      <p>${errorText(lang, 'room_not_found', { code })}</p>
      <button type="button" class="btn btn-primary" onClick=${() => navigate('/')}>${T('backHome')}</button>
    </div>`;
  } else if (status === 'closed') {
    body = html`<div class="panel narrow">
      <p>${T('roomClosed', { code })}</p>
      <button type="button" class="btn btn-primary" onClick=${newRoom}>${T('createRoom')}</button>
      <button type="button" class="btn btn-ghost" onClick=${() => navigate('/')}>${T('backHome')}</button>
    </div>`;
  } else if (status === 'name') {
    body = html`<${NameForm} code=${code} onJoin=${join} />`;
  } else if (view.phase === 'lobby') {
    body = html`<${Lobby} view=${view} act=${act} />`;
  } else {
    body = html`<${Table} view=${view} act=${act} flash=${flash} offset=${offset.current} />`;
  }

  return html`
    <main class="room">
      ${!online && html`<p class="banner" role="status">${T('reconnecting')}</p>`}
      ${body}
      <${Toast} message=${toast} />
    </main>
  `;
}

function NameForm({ code, onJoin }) {
  const { lang, T } = useLang();
  const [name, setName] = useState(() => local.get('fe:name') ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return setError(errorText(lang, 'name_required'));
    setBusy(true);
    local.set('fe:name', clean);
    const err = await onJoin(clean);
    setBusy(false);
    if (err) setError(errorText(lang, err, { code }));
  }

  return html`
    <form class="panel narrow name-form" onSubmit=${submit}>
      <p class="room-code-big" aria-label=${T('roomLabel', { code })}>${code}</p>
      <label for="player-name">${T('yourName')}</label>
      <input
        id="player-name"
        value=${name}
        onInput=${(e) => setName(e.currentTarget.value)}
        maxlength="20"
        autocomplete="nickname"
        autofocus
        required
      />
      ${error && html`<p class="form-error" role="alert">${error}</p>`}
      <button type="submit" class="btn btn-primary btn-lg" disabled=${busy}>${T('joinRoom')}</button>
    </form>
  `;
}

const LAPS = [0, 1, 2, 3];
const PREP = [0, 30, 60, 90, 120];
const PITCH = [0, 45, 60, 90, 120];
const ADULT_COUNT = QUALS.filter((c) => c.adult).length + JOBS.filter((c) => c.adult).length;
const CUSTOM_MAX_LENGTH = 50;

function Lobby({ view, act }) {
  const { T } = useLang();
  const isHost = view.hostId === view.me;
  const host = view.players.find((p) => p.id === view.hostId);
  const connected = view.players.filter((p) => p.connected).length;
  const missing = Math.max(0, 3 - connected);
  const s = view.settings;
  const set = (patch) => act('game:settings', patch);
  const timerLabel = (n) => (n === 0 ? T('noTimer') : T('seconds', { n }));

  return html`
    <div class="lobby">
      <div class="lobby-main">
        <section class="panel lobby-invite">
          <h1 class="lobby-title">${T('lobbyTitle')}</h1>
          <p class="room-code-big">${view.code}</p>
          <p>${T('inviteHint')}</p>
          <div class="invite">
            <input class="invite-link" readonly value=${location.href} onFocus=${(e) => e.currentTarget.select()} />
            <${CopyLinkButton} />
          </div>

          <fieldset class="settings" disabled=${!isHost}>
            <legend>${T('settings')}</legend>
            <label>
              <span>${T('gameLength')}</span>
              <select value=${s.laps} onChange=${(e) => set({ laps: Number(e.currentTarget.value) })}>
                ${LAPS.map((n) => html`<option value=${n}>${n === 0 ? T('lapsAuto') : T('lapsN', { n })}</option>`)}
              </select>
            </label>
            <div class="settings-row">
              <label>
                <span>${T('prepTimer')}</span>
                <select value=${s.prepSeconds} onChange=${(e) => set({ prepSeconds: Number(e.currentTarget.value) })}>
                  ${PREP.map((n) => html`<option value=${n}>${timerLabel(n)}</option>`)}
                </select>
              </label>
              <label>
                <span>${T('pitchTimer')}</span>
                <select value=${s.pitchSeconds} onChange=${(e) => set({ pitchSeconds: Number(e.currentTarget.value) })}>
                  ${PITCH.map((n) => html`<option value=${n}>${timerLabel(n)}</option>`)}
                </select>
              </label>
            </div>
            <p class="settings-note">${T('timerNote')}</p>
            <label class="check">
              <input type="checkbox" checked=${s.family} onChange=${(e) => set({ family: e.currentTarget.checked })} />
              <span>${T('familyMode', { n: ADULT_COUNT })}</span>
            </label>
            <label class="check">
              <input type="checkbox" checked=${s.votes} onChange=${(e) => set({ votes: e.currentTarget.checked })} />
              <span>${T('votesMode')}</span>
            </label>
            <label class="check">
              <input type="checkbox" checked=${s.myJob} onChange=${(e) => set({ myJob: e.currentTarget.checked })} />
              <span>${T('myJobMode')}</span>
            </label>
            <label class="check">
              <input type="checkbox" checked=${s.blind} onChange=${(e) => set({ blind: e.currentTarget.checked })} />
              <span>${T('blindMode')}</span>
            </label>
          </fieldset>

          <div class="lobby-start">
            ${missing > 0 && html`<p>${T('needMore', { n: missing })}</p>`}
            ${isHost
              ? html`<button type="button" class="btn btn-primary btn-lg" disabled=${missing > 0} onClick=${() => act('game:start')}>
                  ${T('startGame')}
                </button>`
              : html`<p class="status-line">${T('waitingHost', { name: host?.name ?? '' })}</p>`}
          </div>
        </section>

        <${CustomCards} view=${view} act=${act} />
      </div>

      <${Roster} view=${view} act=${act} />
    </div>
  `;
}

function CustomCards({ view, act }) {
  const { T } = useLang();
  const [kind, setKind] = useState('qual');
  const [text, setText] = useState('');
  const isHost = view.hostId === view.me;
  const cards = [
    ...view.custom.jobs.map((c) => ({ ...c, kind: 'job' })),
    ...view.custom.quals.map((c) => ({ ...c, kind: 'qual' })),
  ].sort((a, b) => b.id - a.id);

  async function add(e) {
    e.preventDefault();
    const res = await act('game:customAdd', { kind, text });
    if (!res.error) setText('');
  }

  return html`
    <section class="panel custom-cards" aria-labelledby="custom-title">
      <h2 id="custom-title" class="custom-title">${T('customTitle')}</h2>
      <p class="custom-help">${T('customHelp')}</p>
      <form class="custom-form" onSubmit=${add}>
        <div class="kind-switch" role="radiogroup" aria-label=${T('customKind')}>
          ${['qual', 'job'].map(
            (k) => html`<label class="kind-option">
              <input type="radio" name="custom-kind" value=${k} checked=${kind === k} onChange=${() => setKind(k)} />
              <span>${k === 'job' ? T('customJob') : T('customQual')}</span>
            </label>`,
          )}
        </div>
        <div class="custom-input-row">
          <label class="visually-hidden" for="custom-text">${T('customPlaceholder')}</label>
          <input
            id="custom-text"
            value=${text}
            onInput=${(e) => setText(e.currentTarget.value)}
            maxlength=${CUSTOM_MAX_LENGTH}
            placeholder=${kind === 'job' ? T('customJobExample') : T('customQualExample')}
            autocomplete="off"
          />
          <button type="submit" class="btn" disabled=${!text.trim()}>${T('addCard')}</button>
        </div>
      </form>
      ${cards.length > 0 &&
      html`<p class="status-line">${T('customCount', { jobs: view.custom.jobs.length, quals: view.custom.quals.length })}</p>
        <ul class="custom-list">
          ${cards.map(
            (c) => html`<li class=${c.kind === 'job' ? 'is-job' : 'is-qual'}>
              <span class="custom-text">${c.text}</span>
              <span class="custom-by">${c.kind === 'job' ? T('customJob') : T('customQual')}, ${T('byName', { name: c.by })}</span>
              ${(isHost || c.byId === view.me) &&
              html`<button
                type="button"
                class="btn btn-ghost btn-sm"
                aria-label=${T('removeCard', { text: c.text })}
                onClick=${() => act('game:customRemove', { kind: c.kind, id: c.id })}
              >
                ${T('remove')}
              </button>`}
            </li>`,
          )}
        </ul>`}
    </section>
  `;
}
