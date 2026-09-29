import './style.css';
import type Phaser from 'phaser';
import type { MatchState } from '@squeaky/shared';
import { createGame } from './game/createGame';
import { LocalGameSession } from './game/LocalGameSession';
import { loadProfile, makeProfile, saveProfile, type Profile } from './profile';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing app root');
let profile = loadProfile();
let pending: { email: string; code: string } | undefined;
let game: Phaser.Game | undefined;

const shell = (content: string): void => {
  app.innerHTML = `<main class="shell"><div class="brand"><span class="mark">S</span><div><strong>SQUEAKY</strong><small>LAST ONE ROLLING</small></div></div>${content}</main>`;
};

const renderLogin = (): void => {
  shell(
    `<section class="card auth"><p class="eyebrow">LOCAL PROTOTYPE</p><h1>Roll in. Blow up.<br/><em>Be the last one.</em></h1><p class="lede">Enter an email to create a local profile. No message leaves this browser.</p><form id="email-form"><label>Email<input id="email" type="email" required placeholder="player@example.com" autocomplete="email"/></label><button>Generate development code</button></form><p class="fine">Mock authentication only — never use this flow for real accounts.</p></section>`,
  );
  document.querySelector('#email-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = (document.querySelector<HTMLInputElement>('#email')?.value ?? '').trim();
    pending = { email, code: String(Math.floor(100000 + Math.random() * 900000)) };
    renderCode();
  });
};
const renderCode = (): void => {
  if (!pending) return renderLogin();
  shell(
    `<section class="card auth"><p class="eyebrow">DEVELOPMENT CODE</p><h1>Check right here.</h1><p>This code is shown on screen because email delivery is intentionally mocked.</p><output class="code">${pending.code}</output><form id="code-form"><label>One-time code<input id="code" inputmode="numeric" pattern="[0-9]{6}" required autofocus/></label><button>Enter arena</button></form><button class="link" id="back">Use another email</button></section>`,
  );
  document.querySelector('#back')?.addEventListener('click', renderLogin);
  document.querySelector('#code-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const code = document.querySelector<HTMLInputElement>('#code')?.value;
    if (code !== pending?.code) {
      document.querySelector('#code')?.setCustomValidity('Use the development code shown above.');
      document.querySelector<HTMLInputElement>('#code')?.reportValidity();
      return;
    }
    profile = makeProfile(pending.email);
    saveProfile(profile);
    renderMenu();
  });
};
const renderMenu = (): void => {
  if (!profile) return renderLogin();
  shell(
    `<section class="hero"><div><p class="eyebrow">WELCOME BACK, ${profile.displayName.toUpperCase()}</p><h1>One arena.<br/><em>One survivor.</em></h1><p class="lede">A fast local proving ground for deterministic bomb combat.</p><button class="play" id="play">PLAY LOCAL MATCH <span>→</span></button><div class="notice"><b>● OFFLINE PROTOTYPE</b><span>Multiplayer networking is not active yet. Opponents are local bots.</span></div></div><aside class="card panel"><div class="profile-head"><div class="avatar">${profile.displayName[0]?.toUpperCase() ?? 'P'}</div><div><b>${profile.displayName}</b><small>${profile.email}</small></div></div><div class="stats"><div><b>${profile.score}</b><span>SCORE</span></div><div><b>${profile.coins}</b><span>COINS</span></div><div><b>${profile.wins}</b><span>WINS</span></div><div><b>${profile.matchesPlayed}</b><span>MATCHES</span></div></div><hr/><h3>CONTROLS</h3><ul><li><kbd>WASD</kbd> / arrows <span>Move</span></li><li><kbd>MOUSE</kbd> <span>Aim</span></li><li><kbd>CLICK</kbd> / <kbd>SPACE</kbd> <span>Throw bomb</span></li></ul><button class="link" id="logout">Sign out</button></aside></section>`,
  );
  document.querySelector('#play')?.addEventListener('click', startMatch);
  document.querySelector('#logout')?.addEventListener('click', () => {
    localStorage.clear();
    profile = undefined;
    renderLogin();
  });
};
const startMatch = (): void => {
  if (!profile) return;
  app.innerHTML = '<div id="game"></div>';
  const parent = document.querySelector<HTMLElement>('#game');
  if (!parent) return;
  const session = new LocalGameSession(profile.displayName);
  game = createGame(parent, session, finishMatch);
};
const finishMatch = (state: MatchState): void => {
  game?.destroy(true);
  game = undefined;
  if (!profile) return;
  const won = state.winnerId === 'local';
  profile = {
    ...profile,
    matchesPlayed: profile.matchesPlayed + 1,
    wins: profile.wins + Number(won),
    score: profile.score + (won ? 100 : 20),
    coins: profile.coins + (won ? 25 : 5),
  };
  saveProfile(profile);
  shell(
    `<section class="card result"><p class="eyebrow">MATCH COMPLETE</p><h1>${won ? 'Victory!' : 'Eliminated'}</h1><p>${won ? 'You were the last one rolling.' : state.winnerId ? `${state.players[state.winnerId]?.displayName ?? 'A bot'} survived the arena.` : 'Nobody survived the arena.'}</p><div class="actions"><button id="replay">PLAY AGAIN</button><button class="secondary" id="menu">BACK TO MENU</button></div></section>`,
  );
  document.querySelector('#replay')?.addEventListener('click', startMatch);
  document.querySelector('#menu')?.addEventListener('click', renderMenu);
};
profile ? renderMenu() : renderLogin();
