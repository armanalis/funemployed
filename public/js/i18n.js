import { JOBS, QUALS, MY_JOB } from '/shared/cards.js';

export const LANGS = ['en', 'tr'];

const STRINGS = {
  en: {
    tagline: 'Real jobs. Ridiculous résumés.',
    lede: 'A party game for 3 to 12 friends. One of you is hiring. Everyone else talks their way into the job with four absurd qualifications.',
    createRoom: 'Create a room',
    roomCode: 'Room code',
    join: 'Join',
    noSignup: 'Free, no sign-up. Share the room link and play.',
    dealAnother: 'Deal another',
    howTitle: 'How to play',
    how1: 'One player is the employer and turns over a job opening.',
    how2: 'Everyone else gets four qualification cards and can swap them with the cards in the middle.',
    how3: 'Applicants take turns pitching, revealing their cards one at a time.',
    how4: 'The employer hires the best pitch. Whoever has the most jobs at the end wins.',
    howTip: 'Play in the same room or on a video call. The site deals the cards; you do the talking.',
    coffee: 'Buy me a coffee',
    fanProject: 'An unofficial fan project inspired by the card game Funemployed.',
    language: 'Language',

    roomLabel: 'Room {code}',
    copyLink: 'Copy link',
    copied: 'Link copied',
    yourName: 'Your name',
    joinRoom: 'Join the game',
    connecting: 'Connecting…',
    reconnecting: 'Connection lost. Reconnecting…',
    backHome: 'Back to home',
    leave: 'Leave',

    lobbyTitle: 'Waiting room',
    inviteHint: 'Send this link to your friends:',
    players: 'Players',
    needMore: 'You need at least 3 players. Waiting for {n} more.',
    startGame: 'Start game',
    waitingHost: '{name} will start the game.',
    settings: 'Settings',
    gameLength: 'Game length',
    lapsAuto: 'Standard (everyone hires twice, once with 7+ players)',
    lapsN: 'Everyone hires {n}×',
    pitchTimer: 'Pitch timer',
    noTimer: 'No timer',
    seconds: '{n} seconds',
    blindMode: 'Running late: applicants see their cards only while pitching',
    myJobMode: "Final round: applicants compete for the employer's real job",
    remove: 'Remove',
    you: 'you',
    host: 'host',
    employer: 'employer',
    offline: 'offline',
    readyTag: 'ready',

    roundOf: 'Round {n} of {total}',
    jobOpening: 'Job opening',
    myJobTitle: "{name}'s real job",
    myJobHint: 'Final round! {name}, tell everyone what you actually do for a living.',
    spectating: "You joined mid-round. You'll be dealt in next round.",

    prepTitle: 'Build your résumé',
    prepHelp: 'Tap one of your cards, then a card from the middle, to swap them. Every card in your hand has to be used in your pitch.',
    prepEmployerTitle: 'Applicants are preparing',
    prepEmployerHelp: 'They are swapping cards to build their résumés. Start the interviews when they are ready.',
    prepWaitTitle: 'Applicants are preparing',
    pool: 'Up for grabs',
    yourResume: 'Your résumé',
    imReady: "I'm ready",
    notReady: 'Wait, not yet',
    lockedHint: 'Your résumé is locked in.',
    readyCount: '{n} of {total} ready',
    startInterviews: 'Start interviews',
    cardTaken: 'Someone grabbed that card first.',

    interviewTitle: 'Interviews',
    nowPitching: 'Now pitching: {name}',
    yourTurnTitle: 'Your turn to pitch',
    yourTurnHelp: 'Reveal your cards one at a time and explain why they make you perfect for this job.',
    employerAsk: 'Listen, ask awkward questions, move on when you have heard enough.',
    finishPitch: 'Finish my pitch',
    nextApplicant: 'Next applicant',
    upNext: 'Up next',
    pitched: 'Already pitched',
    timeUp: "Time's up",
    tapToReveal: 'Tap to reveal',

    decisionTitle: 'Who gets the job?',
    decisionHelp: 'Compare the résumés and hire one applicant.',
    deciding: '{name} is choosing who to hire.',
    hire: 'Hire',

    stamp: 'Hired',
    gotTheJob: '{name} got the job!',
    nobodyHired: 'Nobody got this job.',
    nextRound: 'Next round',
    seeResults: 'See final results',
    waitNext: 'Waiting for {name} to start the next round.',

    overTitle: 'Employee of the month',
    overTitleMany: 'Employees of the month',
    jobs: '{n} jobs',
    job: '1 job',
    noJobs: 'no jobs',
    playAgain: 'Play again',
    waitAgain: '{name} can start a new game.',

    hostTools: 'Host tools',
    skipRound: 'Skip this round',
    endGame: 'End game',
    confirmEnd: 'Yes, end the game',
    cancel: 'Cancel',

    err_room_not_found: 'There is no room with the code {code}. Check the code or create a new room.',
    err_room_full: 'This room is full (12 players).',
    err_name_required: 'Enter a name to join.',
    err_not_enough_players: 'You need at least 3 connected players.',
    err_card_taken: 'Someone grabbed that card first.',
    err_timeout: 'The server did not answer. Check your connection and try again.',
    err_generic: 'That did not work. Try again.',
  },
  tr: {
    tagline: 'Gerçek işler. Saçma özgeçmişler.',
    lede: '3 ila 12 kişilik bir parti oyunu. Biriniz işe alım yapıyor, diğerleri ellerindeki dört saçma nitelikle o işe girmek için dil döküyor.',
    createRoom: 'Oda kur',
    roomCode: 'Oda kodu',
    join: 'Katıl',
    noSignup: 'Ücretsiz, üyelik yok. Oda bağlantısını paylaş ve oyna.',
    dealAnother: 'Başka dağıt',
    howTitle: 'Nasıl oynanır',
    how1: 'Bir oyuncu işveren olur ve bir iş ilanı açar.',
    how2: 'Diğer herkes dört nitelik kartı alır ve bunları ortadaki kartlarla değiştirebilir.',
    how3: 'Adaylar sırayla, kartlarını tek tek açarak kendilerini anlatır.',
    how4: 'İşveren en iyi konuşmayı yapanı işe alır. Oyun sonunda en çok işi olan kazanır.',
    howTip: 'Aynı ortamda ya da görüntülü aramada oynayın. Kartları site dağıtır, konuşmayı siz yaparsınız.',
    coffee: 'Bana bir kahve ısmarla',
    fanProject: 'Funemployed kart oyunundan esinlenen, resmî olmayan bir hayran projesi.',
    language: 'Dil',

    roomLabel: 'Oda {code}',
    copyLink: 'Bağlantıyı kopyala',
    copied: 'Bağlantı kopyalandı',
    yourName: 'Adın',
    joinRoom: 'Oyuna katıl',
    connecting: 'Bağlanıyor…',
    reconnecting: 'Bağlantı koptu. Yeniden bağlanılıyor…',
    backHome: 'Ana sayfaya dön',
    leave: 'Çık',

    lobbyTitle: 'Bekleme salonu',
    inviteHint: 'Bu bağlantıyı arkadaşlarına gönder:',
    players: 'Oyuncular',
    needMore: 'En az 3 oyuncu gerekiyor. {n} kişi daha bekleniyor.',
    startGame: 'Oyunu başlat',
    waitingHost: 'Oyunu {name} başlatacak.',
    settings: 'Ayarlar',
    gameLength: 'Oyun uzunluğu',
    lapsAuto: 'Standart (herkes iki kez işveren olur, 7+ oyuncuda bir kez)',
    lapsN: 'Herkes {n} kez işveren olur',
    pitchTimer: 'Konuşma süresi',
    noTimer: 'Süresiz',
    seconds: '{n} saniye',
    blindMode: 'Geç kaldım modu: adaylar kartlarını ancak konuşurken görür',
    myJobMode: 'Son tur: adaylar işverenin gerçek işi için yarışır',
    remove: 'Çıkar',
    you: 'sen',
    host: 'kurucu',
    employer: 'işveren',
    offline: 'bağlantı yok',
    readyTag: 'hazır',

    roundOf: 'Tur {n}/{total}',
    jobOpening: 'İş ilanı',
    myJobTitle: '{gen} gerçek işi',
    myJobHint: 'Son tur! {name}, gerçekte ne iş yaptığını herkese anlat.',
    spectating: 'Oyuna tur ortasında katıldın. Sonraki turda sana da kart dağıtılacak.',

    prepTitle: 'Özgeçmişini hazırla',
    prepHelp: 'Önce kendi kartına, sonra ortadaki bir karta dokunarak yerlerini değiştir. Elindeki her kartı konuşmanda kullanmak zorundasın.',
    prepEmployerTitle: 'Adaylar hazırlanıyor',
    prepEmployerHelp: 'Özgeçmişlerini hazırlamak için kart değiştiriyorlar. Hazır olduklarında mülakatları başlat.',
    prepWaitTitle: 'Adaylar hazırlanıyor',
    pool: 'Ortadaki kartlar',
    yourResume: 'Özgeçmişin',
    imReady: 'Hazırım',
    notReady: 'Dur, hazır değilim',
    lockedHint: 'Özgeçmişin kilitlendi.',
    readyCount: '{n}/{total} hazır',
    startInterviews: 'Mülakatları başlat',
    cardTaken: 'O kartı başkası senden önce aldı.',

    interviewTitle: 'Mülakatlar',
    nowPitching: 'Konuşan: {name}',
    yourTurnTitle: 'Sıra sende',
    yourTurnHelp: 'Kartlarını tek tek aç ve bu iş için neden biçilmiş kaftan olduğunu anlat.',
    employerAsk: 'Dinle, zor sorular sor, yeterince duyduğunda sıradakine geç.',
    finishPitch: 'Konuşmamı bitir',
    nextApplicant: 'Sıradaki aday',
    upNext: 'Sıradakiler',
    pitched: 'Konuşmasını yapanlar',
    timeUp: 'Süre doldu',
    tapToReveal: 'Açmak için dokun',

    decisionTitle: 'İşi kim alıyor?',
    decisionHelp: 'Özgeçmişleri karşılaştır ve bir adayı işe al.',
    deciding: '{name} kimi işe alacağına karar veriyor.',
    hire: 'İşe al',

    stamp: 'İşe alındı',
    gotTheJob: 'İşi {name} kaptı!',
    nobodyHired: 'Bu işi kimse alamadı.',
    nextRound: 'Sonraki tur',
    seeResults: 'Sonuçları gör',
    waitNext: 'Sonraki turu {name} başlatacak.',

    overTitle: 'Ayın çalışanı',
    overTitleMany: 'Ayın çalışanları',
    jobs: '{n} iş',
    job: '1 iş',
    noJobs: 'iş yok',
    playAgain: 'Tekrar oyna',
    waitAgain: 'Yeni oyunu {name} başlatabilir.',

    hostTools: 'Kurucu araçları',
    skipRound: 'Bu turu atla',
    endGame: 'Oyunu bitir',
    confirmEnd: 'Evet, oyunu bitir',
    cancel: 'Vazgeç',

    err_room_not_found: '{code} kodlu bir oda yok. Kodu kontrol et ya da yeni bir oda kur.',
    err_room_full: 'Bu oda dolu (12 oyuncu).',
    err_name_required: 'Katılmak için bir ad yaz.',
    err_not_enough_players: 'En az 3 bağlı oyuncu gerekiyor.',
    err_card_taken: 'O kartı başkası senden önce aldı.',
    err_timeout: 'Sunucu yanıt vermedi. Bağlantını kontrol edip tekrar dene.',
    err_generic: 'Olmadı. Tekrar dene.',
  },
};

export function t(lang, key, vars = {}) {
  const template = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

export function errorText(lang, code, vars) {
  const key = `err_${code}`;
  return STRINGS.en[key] ? t(lang, key, vars) : t(lang, 'err_generic');
}

// Turkish genitive suffix with vowel harmony: Ali'nin, Mert'in, Oğuz'un, Ayşe'nin.
export function trGenitive(name) {
  const vowels = 'aıoueiöü';
  const lower = name.toLocaleLowerCase('tr');
  const last = [...lower].reverse().find((ch) => vowels.includes(ch)) ?? 'e';
  const harmony = { a: 'ı', ı: 'ı', o: 'u', u: 'u', e: 'i', i: 'i', ö: 'ü', ü: 'ü' }[last];
  const buffer = vowels.includes(lower.at(-1)) ? 'n' : '';
  return `${name}'${buffer}${harmony}n`;
}

const col = (lang) => (lang === 'tr' ? 1 : 0);

export const qualText = (lang, id) => QUALS[id]?.[col(lang)] ?? '';

export function jobText(lang, id, employerName = '') {
  if (id === MY_JOB) return t(lang, 'myJobTitle', { name: employerName, gen: trGenitive(employerName) });
  return JOBS[id]?.[col(lang)] ?? '';
}

export function detectLang() {
  try {
    const saved = localStorage.getItem('fe:lang');
    if (LANGS.includes(saved)) return saved;
  } catch {}
  return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}
