import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { JOBS, QUALS } from './cards.js';
import { BUY_ME_A_COFFEE_URL } from './config.js';
import { LANGS, t, errorText, detectLang } from './i18n.js';
import { call } from './net.js';
import { LangContext, useLang, navigate, JobCard, QualCard, Toast } from './ui.js';
import { RoomScreen } from './room.js';

const parseRoute = () => {
  const match = location.pathname.match(/^\/([A-Za-z]{4})\/?$/);
  return { room: match ? match[1].toUpperCase() : null };
};

function App() {
  const [lang, setLang] = useState(detectLang);
  const [route, setRoute] = useState(parseRoute);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = route.room ? `${route.room} | Funemployed` : `Funemployed | ${t(lang, 'tagline')}`;
  }, [lang, route.room]);

  const chooseLang = (next) => {
    setLang(next);
    try {
      localStorage.setItem('fe:lang', next);
    } catch {}
  };

  const ctx = useMemo(() => ({ lang, T: (key, vars) => t(lang, key, vars) }), [lang]);

  return html`
    <${LangContext.Provider} value=${ctx}>
      <${Header} lang=${lang} onLang=${chooseLang} />
      ${route.room ? html`<${RoomScreen} key=${route.room} code=${route.room} />` : html`<${Home} />`}
    <//>
  `;
}

function Header({ lang, onLang }) {
  const { T } = useLang();
  const goHome = (e) => {
    e.preventDefault();
    navigate('/');
  };
  return html`
    <header class="topbar">
      <a class="wordmark" href="/" onClick=${goHome}>Funemployed</a>
      <div class="topbar-end">
        <div class="lang-switch" role="group" aria-label=${T('language')}>
          ${LANGS.map(
            (l) => html`<button type="button" aria-pressed=${l === lang} onClick=${() => onLang(l)}>${l.toUpperCase()}</button>`,
          )}
        </div>
        <${CoffeeLink} />
      </div>
    </header>
  `;
}

function CoffeeLink({ className = 'coffee' }) {
  const { T } = useLang();
  return html`<a class=${className} href=${BUY_ME_A_COFFEE_URL} target="_blank" rel="noopener">
    <span aria-hidden="true">☕</span> <span class="coffee-label">${T('coffee')}</span>
  </a>`;
}

const pick = (n, max) => {
  const chosen = new Set();
  while (chosen.size < n) chosen.add(Math.floor(Math.random() * max));
  return [...chosen];
};
const dealDemo = () => ({ job: pick(1, JOBS.length)[0], quals: pick(4, QUALS.length) });
const DEMO_TILTS = [-3, 2, -1.5, 3.5];

function Home() {
  const { lang, T } = useLang();
  const [demo, setDemo] = useState(dealDemo);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function createRoom() {
    setBusy(true);
    setError('');
    const res = await call('room:create');
    setBusy(false);
    if (res.code) navigate(`/${res.code}`);
    else setError(errorText(lang, res.error));
  }

  function joinRoom(e) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (/^[A-Z]{4}$/.test(clean)) navigate(`/${clean}`);
  }

  return html`
    <main class="home">
      <section class="hero">
        <div class="hero-copy">
          <h1 class="hero-title">${T('tagline')}</h1>
          <p class="lede">${T('lede')}</p>
          <div class="cta-row">
            <button type="button" class="btn btn-primary btn-lg" onClick=${createRoom} disabled=${busy}>
              ${T('createRoom')}
            </button>
            <form class="join-form" onSubmit=${joinRoom}>
              <label class="visually-hidden" for="join-code">${T('roomCode')}</label>
              <input
                id="join-code"
                class="code-input"
                value=${code}
                onInput=${(e) => setCode(e.currentTarget.value.replace(/[^a-z]/gi, '').toUpperCase())}
                maxlength="4"
                placeholder=${T('roomCode')}
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
              />
              <button type="submit" class="btn" disabled=${code.length !== 4}>${T('join')}</button>
            </form>
          </div>
          <${Toast} message=${error} />
          <p class="fineprint">${T('noSignup')}</p>
        </div>

        <div class="hero-demo">
          <${JobCard} job=${demo.job} size="is-hero" />
          <div class="demo-hand">
            ${demo.quals.map((id, i) => html`<${QualCard} key=${id} id=${id} tilt=${DEMO_TILTS[i]} />`)}
          </div>
          <button type="button" class="btn btn-ghost" onClick=${() => setDemo(dealDemo())}>${T('dealAnother')}</button>
        </div>
      </section>

      <section class="how" aria-labelledby="how-title">
        <h2 id="how-title">${T('howTitle')}</h2>
        <ol class="how-steps">
          ${['how1', 'how2', 'how3', 'how4'].map((key) => html`<li>${T(key)}</li>`)}
        </ol>
        <p class="how-tip">${T('howTip')}</p>
      </section>

      <footer class="site-footer">
        <p>${T('fanProject')}</p>
        <${CoffeeLink} className="coffee coffee-footer" />
      </footer>
    </main>
  `;
}

render(html`<${App} />`, document.getElementById('app'));
