// Node tests for profile.js (no DOM needed). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
let blocked = false;
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  get() {
    if (blocked) throw new Error('SecurityError: storage blocked');
    return { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  },
});

await import('../profile.js');
const P = globalThis.Profile;
let clock = new Date(2026, 9, 27, 15, 0);
const LEVELS = [{ id: 'beginner', name: 'Beginner', rating: 800 }, { id: 'medium', name: 'Medium', rating: 1500 }, { id: 'perfect', name: 'Perfect', rating: 2100 }];
const ACH = [
  { id: 'first', title: 'First win', test: c => c.stats.wins >= 1 },
  { id: 'beatP', title: 'Beat Perfect', test: c => !!(c.last && c.last.won && c.last.level === 'perfect') },
  { id: 'boom', title: 'Throws', test: () => { throw new Error('bad test'); } },
  { id: 'd3', title: 'Three days', test: c => c.daily.streak >= 3 },
];
const fresh = (extra) => { mem.clear(); blocked = false; clock = new Date(2026, 9, 27, 15, 0); return P.init(Object.assign({ game: 'demo', levels: LEVELS, achievements: ACH, daily: true, toast: false, now: () => clock }, extra)); };
const nextDay = (n = 1) => { clock = new Date(clock.getFullYear(), clock.getMonth(), clock.getDate() + n, 15, 0); };

test('Elo: expected score and one step', () => {
  assert.equal(P._.expected(1200, 1200), 0.5);
  assert.ok(Math.abs(P._.expected(1600, 1200) - 0.909) < 0.001);
  assert.equal(P._.eloStep(1200, 1200, 1, 0), 1220);   // new player, K = 40
  assert.equal(P._.eloStep(1200, 1200, 1, 20), 1212);  // settled, K = 24
  assert.equal(P._.eloStep(100, 2100, 0, 50), 100);    // never below the floor
});

test('results count per mode and per computer level, Elo moves the right way', () => {
  fresh();
  const a = P.recordResult({ mode: 'computer', level: 'perfect', won: true });
  assert.ok(a.elo.change > 30, 'beating a 2100 from 1200 is a big gain');
  P.recordResult({ mode: 'computer', level: 'beginner', won: false });
  P.recordResult({ mode: 'computer', level: 'medium', draw: true });
  P.recordResult({ mode: 'friends', won: null });
  const s = P.stats();
  assert.equal(s.games, 4); assert.equal(s.wins, 1); assert.equal(s.losses, 1); assert.equal(s.draws, 1);
  assert.deepEqual(s.byLevel.perfect, { g: 1, w: 1, l: 0, d: 0 });
  assert.deepEqual(s.byLevel.beginner, { g: 1, w: 0, l: 1, d: 0 });
  assert.deepEqual(s.byMode.friends, { g: 1, w: 0, l: 0, d: 0 });
  assert.equal(s.elo.games, 3, 'friends games are not rated');
  assert.ok(s.elo.peak >= s.elo.rating);
});

test('win streak and best streak', () => {
  fresh();
  for (let i = 0; i < 3; i++) P.recordResult({ level: 'beginner', won: true });
  P.recordResult({ level: 'beginner', won: false });
  P.recordResult({ level: 'beginner', won: true });
  const s = P.stats();
  assert.equal(s.streak, 1); assert.equal(s.bestStreak, 3);
});

test('achievements unlock once, a throwing test is ignored', () => {
  fresh();
  let r = P.recordResult({ level: 'medium', won: true });
  assert.deepEqual(r.unlocked.map(a => a.id), ['first']);
  r = P.recordResult({ level: 'perfect', won: true });
  assert.deepEqual(r.unlocked.map(a => a.id), ['beatP']);
  r = P.recordResult({ level: 'perfect', won: true });
  assert.deepEqual(r.unlocked, []);
  assert.equal(P.stats().ach.first, '2026-10-27');
  assert.equal(P.stats().ach.boom, undefined);
});

test('daily: same seed for everyone on a day, different next day, rng is repeatable', () => {
  fresh();
  const d = P.daily.date();
  assert.equal(d, '2026-10-27');
  assert.equal(P.daily.seed(d), P.daily.seed('2026-10-27'));
  assert.notEqual(P.daily.seed('2026-10-27'), P.daily.seed('2026-10-28'));
  const a = P.daily.rng(d), b = P.daily.rng(d);
  const xs = [a(), a(), a()], ys = [b(), b(), b()];
  assert.deepEqual(xs, ys);
  xs.forEach(x => assert.ok(x >= 0 && x < 1));
});

test('daily: played today, streak grows day by day, breaks after a missed day, only the first game counts', () => {
  fresh();
  assert.equal(P.daily.played(), false);
  P.recordResult({ level: 'medium', won: true, daily: true });
  assert.equal(P.daily.played(), true);
  const again = P.recordResult({ level: 'medium', won: false, daily: true });
  assert.equal(again.daily, null, 'second daily game the same day is a normal game');
  assert.equal(P.daily.result().r, 'w');
  nextDay(); P.recordResult({ level: 'medium', won: false, daily: true });
  nextDay(); const r = P.recordResult({ level: 'medium', draw: true, daily: true });
  assert.equal(P.daily.streak().cur, 3);
  assert.ok(r.unlocked.some(a => a.id === 'd3'));
  nextDay(2);
  assert.equal(P.daily.streak().cur, 0, 'missed a day');
  assert.equal(P.daily.streak().best, 3);
  P.recordResult({ level: 'medium', won: true, daily: true });
  assert.equal(P.daily.streak().cur, 1);
});

test('blocked storage: everything still works for the session', () => {
  fresh();
  blocked = true;
  P.init({ game: 'blocked', levels: LEVELS, achievements: ACH, toast: false, now: () => clock });
  assert.equal(P.storageBlocked, true);
  P.setName('Tim');
  const r = P.recordResult({ level: 'medium', won: true });
  assert.equal(r.unlocked[0].id, 'first');
  assert.equal(P.stats().wins, 1);
  assert.equal(P.name, 'Tim');
  assert.ok(P.export().includes('"blocked"'));
});

test('export then import restores the stats; junk files are refused and change nothing', () => {
  fresh();
  P.setName('Tim'); P.setAvatar('owl');
  P.recordResult({ level: 'perfect', won: true });
  const file = P.export();
  P.reset(); P.setName('Other');
  assert.equal(P.stats().games, 0);
  assert.equal(P.import('not json').ok, false);
  assert.equal(P.import('{"kit":"other"}').ok, false);
  assert.equal(P.stats().name, 'Other');
  const r = P.import(file);
  assert.equal(r.ok, true);
  assert.equal(P.stats().wins, 1); assert.equal(P.name, 'Tim'); assert.equal(P.avatar, 'owl');
});

test('garbage in storage or a hand-edited file becomes a valid record', () => {
  const c = P._.cleanStats({ games: -5, wins: 'x', streak: 7, elo: { rating: -40, peak: 'a' }, byLevel: { a: { g: 2.5, w: 1 } },
    ach: { ok: '2026-01-02', bad: 12 }, daily: { days: { '2026-01-01': { r: 'zz' }, nope: {} }, streak: 2 }, recent: [1, { r: 'w', t: '2026-01-01' }] });
  assert.equal(c.games, 0); assert.equal(c.wins, 0); assert.equal(c.bestStreak, 7);
  assert.equal(c.elo.rating, 100); assert.equal(c.elo.peak, 100);
  assert.deepEqual(c.byLevel.a, { g: 0, w: 1, l: 0, d: 0 });
  assert.deepEqual(Object.keys(c.ach), ['ok']);
  assert.deepEqual(Object.keys(c.daily.days), ['2026-01-01']);
  assert.equal(c.daily.days['2026-01-01'].r, 'p');
  assert.equal(c.recent.length, 1);
  mem.clear(); mem.set('profile:demo', '{broken'); mem.set('profile:me', '{"name":5,"avatar":"nope"}');
  P.init({ game: 'demo', levels: LEVELS, toast: false });
  assert.equal(P.stats().games, 0); assert.equal(P.avatar, 'fox'); assert.equal(P.name, '');
});

test('older games can be brought in with their date, quietly', () => {
  fresh();
  P.recordResult({ level: 'medium', won: true, date: '2026-10-01', quiet: true });
  assert.equal(P.stats().first, '2026-10-01');
  assert.equal(P.stats().recent[0].t, '2026-10-01');
  assert.equal(P.stats().ach.first, '2026-10-27', 'unlock date is the day it was noticed');
});

test('names are trimmed and capped, unknown avatars refused, each game keeps its own stats but shares the name', () => {
  fresh();
  P.setName('   A very very long name that keeps going  ');
  assert.ok(P.name.length <= 20);
  assert.equal(P.setAvatar('dragon'), false);
  P.recordResult({ level: 'medium', won: true });
  P.init({ game: 'other', levels: LEVELS, toast: false, now: () => clock });
  assert.equal(P.stats().games, 0);
  assert.ok(P.name.startsWith('A very'));
  P.init({ game: 'demo', levels: LEVELS, toast: false, now: () => clock });
  assert.equal(P.stats().games, 1);
});

test('level ratings: unknown level is not rated', () => {
  fresh();
  const r = P.recordResult({ mode: 'computer', level: 'godlike', won: true });
  assert.equal(r.elo, null);
  assert.equal(P.levelRating('perfect'), 2100);
  assert.equal(P.levelRating('godlike'), null);
});
