// Three rotating challenges. Finishing one pays tickets and brings in the
// next from a fixed cycle, so there is always something fresh to try.
//   scope 'total' adds the stat across rounds; 'round' needs it in one round.
export const MISSIONS = [
  { id: 'make10', text: 'Make 10 baskets', stat: 'makes', goal: 10, scope: 'total' },
  { id: 'swish5', text: 'Swish 5 shots', stat: 'swishes', goal: 5, scope: 'total' },
  { id: 'fire1', text: 'Get on fire (3 swishes in a row)', stat: 'fires', goal: 1, scope: 'total' },
  { id: 'bank3', text: 'Bank in 3 shots off the board', stat: 'banks', goal: 3, scope: 'total' },
  { id: 'money3', text: 'Sink 3 rainbow money balls', stat: 'money', goal: 3, scope: 'total' },
  { id: 'score30', text: 'Score 30 points in one round', stat: 'score', goal: 30, scope: 'round' },
  { id: 'win1', text: 'Beat a tournament rival', stat: 'won', goal: 1, scope: 'total' },
  { id: 'buzzer1', text: 'Make a buzzer beater', stat: 'buzzer', goal: 1, scope: 'total' },
  { id: 'stars2', text: 'Earn 2 stars on a trick shot', stat: 'stars', goal: 2, scope: 'round' },
  { id: 'daily1', text: 'Play the Daily Shootout', stat: 'daily', goal: 1, scope: 'total' },
  { id: 'tramp3', text: 'Bounce 3 shots in off a trampoline', stat: 'tramps', goal: 3, scope: 'total' },
  { id: 'round12', text: 'Make 12 baskets in one round', stat: 'makes', goal: 12, scope: 'round' },
  { id: 'swish15', text: 'Swish 15 shots', stat: 'swishes', goal: 15, scope: 'total' },
  { id: 'score50', text: 'Score 50 points in one round', stat: 'score', goal: 50, scope: 'round' },
  { id: 'fire3', text: 'Get on fire 3 times', stat: 'fires', goal: 3, scope: 'total' },
  { id: 'make40', text: 'Make 40 baskets', stat: 'makes', goal: 40, scope: 'total' },
];
export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
export const MISSION_REWARD = 40;

export function freshMissions() {
  return { active: MISSIONS.slice(0, 3).map((m) => ({ id: m.id, progress: 0 })), cursor: 3, done: 0 };
}

function nextId(state) {
  const taken = new Set(state.active.filter(Boolean).map((a) => a.id));
  for (let k = 0; k < MISSIONS.length; k++) {
    const m = MISSIONS[(state.cursor + k) % MISSIONS.length];
    if (!taken.has(m.id)) {
      state.cursor = (state.cursor + k + 1) % MISSIONS.length;
      return m.id;
    }
  }
  return MISSIONS[0].id;
}

// Apply a round summary; returns the missions completed (and replaced).
export function progressMissions(state, summary) {
  const done = [];
  state.active = state.active.map((a) => {
    const m = MISSION_BY_ID[a.id];
    if (!m) return { id: nextId(state), progress: 0 };
    const val = Number(summary[m.stat]) || 0;
    const progress = m.scope === 'round' ? Math.max(a.progress, val) : a.progress + val;
    if (progress >= m.goal) {
      done.push(m);
      state.done++;
      return null;
    }
    return { id: a.id, progress };
  });
  state.active = state.active.map((a) => a || { id: nextId(state), progress: 0 });
  return done;
}
