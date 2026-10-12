// XP, levels and coins: what a match pays and what a level is worth. One
// place for every number, so the result screen can show the breakdown and
// the shop's coin prices (skins.ts) stay in proportion.
//
// - A vs-AI run pays for every guy bonked; an online duel pays more for a
//   win, something for a loss.
// - The first match of each local day adds a daily bonus.
// - Each level reached pays a coin bonus that grows with the level.
// Rewards are cosmetic currency only: nothing bought with coins changes a shot.

export type MatchOutcome = 'run' | 'win' | 'lose' | 'left';

export type MatchStats = {
  online: boolean;
  outcome: MatchOutcome;
  kills: number; // vs AI: guys bonked this run
  headshots: number;
};

// XP needed to go from `level` to the next: 100, 150, 200, …
export const xpForLevel = (level: number) => 100 + (level - 1) * 50;

// Level and progress inside it for a lifetime XP total.
export function levelOf(xp: number) {
  let level = 1;
  let left = Math.max(0, xp);
  while (left >= xpForLevel(level)) {
    left -= xpForLevel(level);
    level += 1;
  }
  return { level, into: left, need: xpForLevel(level) };
}

// Coins for reaching `level` (2 → 100, 5 → 175, 10 → 300).
export const levelUpCoins = (level: number) => 50 + level * 25;

export const DAILY_BONUS = 50;

// What the match itself pays, before bonuses.
export function matchRewards(m: MatchStats) {
  if (!m.online) {
    return {
      xp: 20 + m.kills * 25 + m.headshots * 5,
      coins: 10 + m.kills * 20 + m.headshots * 5,
    };
  }
  const won = m.outcome !== 'lose';
  return {
    xp: (won ? 80 : 30) + m.headshots * 5,
    coins: (won ? 60 : 20) + m.headshots * 5,
  };
}

export type RewardSummary = {
  xp: number;
  matchCoins: number;
  dailyBonus: number;
  levelBonus: number;
  coins: number; // total coins added
  prevXp: number;
  levelsGained: number;
};

// Everything a finished match adds, given the player's XP before it and
// whether today's bonus is still unclaimed.
export function summarize(m: MatchStats, prevXp: number, dailyAvailable: boolean): RewardSummary {
  const r = matchRewards(m);
  const before = levelOf(prevXp).level;
  const after = levelOf(prevXp + r.xp).level;
  let levelBonus = 0;
  for (let l = before + 1; l <= after; l++) levelBonus += levelUpCoins(l);
  const dailyBonus = dailyAvailable ? DAILY_BONUS : 0;
  return {
    xp: r.xp,
    matchCoins: r.coins,
    dailyBonus,
    levelBonus,
    coins: r.coins + dailyBonus + levelBonus,
    prevXp,
    levelsGained: after - before,
  };
}

// Player names: what you call yourself on the home screen, the match plates
// and (online) on your opponent's screen. Untrusted when it comes off the
// network, so both sides clean it the same way.
export const NAME_MAX = 16;
export const NAME_MIN = 2;
// Control, zero-width and bidi-override characters are dropped.
const hidden = (c: number) => c < 0x20 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069);
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return Array.from(raw)
    .filter((ch) => !hidden(ch.codePointAt(0) ?? 0))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}
