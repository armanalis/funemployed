import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { t, qualText, jobText } from './i18n.js';

export const LangContext = createContext({ lang: 'en', T: (key, vars) => t('en', key, vars) });
export const useLang = () => useContext(LangContext);

export function navigate(path) {
  history.pushState(null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}

export function storage(kind) {
  const store = () => (kind === 'session' ? sessionStorage : localStorage);
  return {
    get(key) {
      try {
        return store().getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        if (value == null) store().removeItem(key);
        else store().setItem(key, value);
      } catch {}
    },
  };
}

// The manila folder that holds the job opening.
export function JobCard({ job, employerName = '', size = '' }) {
  const { lang, T } = useLang();
  return html`
    <div class="job-card ${size}">
      <span class="job-tab">${T('jobOpening')}</span>
      <p class="job-title">${jobText(lang, job, employerName)}</p>
    </div>
  `;
}

// A qualification index card. `id === null` means face down.
// With onClick it becomes a button; `pending` marks a card only its owner can see yet.
export function QualCard({ id, onClick, selected = false, pending = false, label, tilt = 0 }) {
  const { lang } = useLang();
  const faceDown = id == null;
  const className = [
    'qcard',
    faceDown && 'is-down',
    selected && 'is-selected',
    pending && 'is-pending',
    onClick && 'is-clickable',
  ]
    .filter(Boolean)
    .join(' ');
  const style = tilt ? `--tilt:${tilt}deg` : '';
  const faces = html`
    <span class="qcard-inner">
      <span class="qcard-face qcard-front">
        <span class="qcard-text">${faceDown ? '' : qualText(lang, id)}</span>
        ${label && html`<span class="qcard-hint">${label}</span>`}
      </span>
      <span class="qcard-face qcard-back" aria-hidden="true"><span>F</span></span>
    </span>
  `;
  if (onClick) {
    return html`<button type="button" class=${className} style=${style} onClick=${onClick} aria-pressed=${selected}>
      ${faces}
    </button>`;
  }
  return html`<div class=${className} style=${style}>${faces}</div>`;
}

export function Countdown({ startedAt, seconds, offset }) {
  const { T } = useLang();
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(timer);
  }, []);
  if (!seconds || !startedAt) return null;
  const left = Math.max(0, Math.ceil((startedAt + seconds * 1000 - (Date.now() + offset)) / 1000));
  const text = left === 0 ? T('timeUp') : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return html`<p class="timer ${left === 0 ? 'is-up' : left <= 10 ? 'is-low' : ''}" role="timer">${text}</p>`;
}

export function CopyLinkButton({ className = 'btn' }) {
  const { T } = useLang();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
    } catch {
      // The async clipboard API is missing on plain http (e.g. a LAN address).
      const field = Object.assign(document.createElement('textarea'), { value: location.href });
      document.body.append(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return html`<button type="button" class=${className} onClick=${copy}>
    ${copied ? T('copied') : T('copyLink')}
  </button>`;
}

export function Toast({ message }) {
  if (!message) return null;
  return html`<p class="toast" role="alert">${message}</p>`;
}
