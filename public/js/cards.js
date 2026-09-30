// The deck lives in /shared/cards.json (also read by the server).
// Each card has one text per language; a card's position in its list is its id in the game.
const deck = await fetch('/shared/cards.json').then((res) => res.json());

export const JOBS = deck.jobs;
export const QUALS = deck.qualifications;

// Job id for the final "My Job" round, where applicants compete for the employer's real job.
export const MY_JOB = -1;
