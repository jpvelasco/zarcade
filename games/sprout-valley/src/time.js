// Calendar and clock. A year is four seven-day seasons; every season starts
// on a Monday, so Saturday (market day) is always day 6.
import { SEASONS } from './data.js';
import { rngFor } from './rng.js';

export const DAYS_PER_SEASON = 7;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS.length;
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_START = 6 * 60; // 6:00 am
export const DAY_END = 26 * 60; // 2:00 am: bedtime at the latest
export const MARKET_DAY = 6; // Saturday
// Real seconds per game minute at each speed setting.
export const SPEEDS = { relaxed: 0.75, normal: 0.5, brisk: 0.3 };

export function dateOf(dayIndex) {
  const year = Math.floor(dayIndex / DAYS_PER_YEAR) + 1;
  const inYear = dayIndex % DAYS_PER_YEAR;
  const seasonIndex = Math.floor(inYear / DAYS_PER_SEASON);
  const day = (inYear % DAYS_PER_SEASON) + 1;
  return { year, seasonIndex, season: SEASONS[seasonIndex], day, weekday: WEEKDAYS[day - 1] };
}

// Minutes of game time that pass in `dt` real seconds.
export function minutesFor(dt, speed = 'normal') {
  return dt / (SPEEDS[speed] || SPEEDS.normal);
}

export function formatTime(minutes) {
  const m = Math.floor(minutes) % (24 * 60);
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h < 12 ? 'am' : 'pm';
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${String(mm - (mm % 10)).padStart(2, '0')} ${ampm}`;
}

// Darkness from 0 (noon) to 1 (deep night), easing in from late afternoon.
export function darkness(minutes) {
  const dusk = 17 * 60, night = 20 * 60 + 30;
  if (minutes < 6 * 60 + 40) return 0.55 * (1 - (minutes - DAY_START) / 40);
  if (minutes < dusk) return 0;
  if (minutes < night) return (minutes - dusk) / (night - dusk) * 0.85;
  return 0.85;
}

// Weather for a day. Day 0 is always sunny and festival days stay clear.
export function weatherFor(seed, dayIndex, festivalDay = false) {
  if (dayIndex === 0 || festivalDay) return 'sunny';
  const { season } = dateOf(dayIndex);
  const r = rngFor(seed, dayIndex, 'weather')();
  const wet = { spring: 0.3, summer: 0.18, autumn: 0.28, winter: 0.4 }[season];
  if (r < wet) return season === 'winter' ? 'snow' : 'rain';
  if (r < wet + 0.2) return 'cloudy';
  return 'sunny';
}

export const isWet = (weather) => weather === 'rain' || weather === 'snow';
