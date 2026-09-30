# Funemployed (prototype)

Online party game: real jobs, ridiculous résumés. English + Turkish, no sign-up.

## Run

```sh
npm install
npm start            # http://localhost:3000
```

- Test alone: create a room, then `npm run bots -- ROOMCODE 3` adds 3 bots that play automatically.
- Same Wi-Fi: friends open `http://<your-computer-ip>:3000`.
- Tests: `npm test`

## Where things live

| What | File |
|---|---|
| Buy Me a Coffee link | `public/js/config.js` |
| Cards (EN/TR pairs, append only) | `public/shared/cards.js` |
| UI text (EN/TR) | `public/js/i18n.js` |
| Game rules | `server/game.js` |
| Socket server | `server/index.js` |

## Deploying

Rooms live in server memory and players connect over WebSockets, so it needs one long-running
Node process (Render, Railway, Fly.io). Serverless hosting won't keep rooms alive.
