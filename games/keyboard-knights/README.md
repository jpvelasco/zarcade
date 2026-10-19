# Keyboard Knights

A storybook typing adventure. A brave little knight marches along the road
while silly monsters waddle in, each carrying a word. Type the word to swing
your sword and send the monster *poof* into confetti.

## How to play

- Type the first letter of any monster's word to lock on, then finish the
  word. The nearest monster with that letter is picked.
- Typos just make the knight stumble and reset your combo. Nothing else.
- A monster that reaches you bonks one of your three hearts. Lose all three
  and you get one-tap retries, with slower monsters each time. Letter Meadow,
  every lesson and the **Relaxed pace** setting use monsters that wait for you,
  so you can't lose there.
- Each word charges **Star Spin**. When the meter is full, press **Enter** (or
  tap **★ Spin**) to poof every monster on screen.
- Bosses carry whole phrases. Type each one, spaces included.
- Stars: finish ★, 85 % accuracy ★★, 95 % accuracy with at most one bonk ★★★.

## Modes and collections

- **Quest map**: five regions of six stages (Letter Meadow, Mushroom Woods,
  Goose Farm, Cloud Castle, Story Library), each ending in a boss. *Who's
  playing?* picks a starting region (Little, Young, Big or Grown-up knight).
- **Lessons**: twelve lessons from F and J to capitals and punctuation, with an
  on-screen keyboard showing the next key, finger colours and a hands guide.
- **Daily quest**: same words for everyone on the same local date, with a
  mini-boss and a day streak.
- **Wardrobe**: armour, swords and pets unlocked by stars, bosses, lessons,
  daily quests, combos and the bestiary. They all show up in play.
- **Bestiary**: 15 monsters and 5 bosses, silhouettes until you meet them.
- **Stats**: best WPM (also on the title), accuracy, charts of recent runs and
  a heat map of the keys you find tricky. Words with your weak keys come up
  more often (except in the daily quest).

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Type | letter and punctuation keys | big on-screen keys |
| Star Spin | Enter | ★ Spin |
| Pause | Esc | ❚❚ |
| Menus | arrows, Enter, Esc (back) | tap |
| Results | Enter next, Space again, Esc map | tap |

P doesn't pause, because P is a letter you type. The on-screen keyboard shows
on touch devices; Settings can turn it on for desktop or off. With the
on-screen keyboard (or *Forgiving capitals*) letter case is ignored.

## Files

- `src/words.js` levelled word lists and boss passages; `src/blocklist.js`
  ROT13-encoded blocklist.
- `src/stages.js` regions, stages, lessons, bestiary, daily quest, word pools.
- `src/picker.js`, `src/stats.js` adaptive word picking, key stats, WPM.
- `src/battle.js` the DOM-free typing battle; `src/autoplay.js` bot typist.
- `src/progress.js` save file, unlocks, streaks.
- `src/sprites.js`, `src/render.js` baked canvas art and the road scene.
- `src/keyboard.js` on-screen keyboard and finger guide; `src/ui.js` menus and
  charts; `src/audio.js` Web Audio synth; `src/main.js` wiring and telemetry.

Saves live in `localStorage` under `keyboard-knights.v1`.

## Debug parameters

- `?stage=<id>` jump into a stage (`meadow-1`, `farm-boss`, `lesson-4`, `daily`).
- `?autoplay=<wpm>` a bot types for you.
- `?screen=map|lessons|wardrobe|bestiary|stats|settings` open a menu.
- `?touch` force the touch layout; `?date=YYYY-MM-DD` pick the daily quest date.

`window.KK` exposes the battle, save and renderer in the console.

## Tests

```sh
node --test 'games/keyboard-knights/tests/*.test.js'
```

Covers the blocklist (every word, passage and generated drill), word list
shape, adaptive picking, key stats and WPM, battle rules, bosses, stars,
pacing, saves, unlocks, the daily streak, and a bot that clears every stage.
