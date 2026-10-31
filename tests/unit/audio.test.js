// BGM score checks (node --test): the music is data, so its structure can be verified without audio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTrack, SCORE_DATA, TRACK_NAMES, STEPS, barLengths, midi, chordTones } from '../../js/audio.js';

test('note / chord helpers', () => {
  assert.equal(midi('A4'), 69); assert.equal(midi('C4'), 60); assert.equal(midi('F#5'), 78); assert.equal(midi('Bb3'), 58);
  assert.deepEqual(chordTones('Am'), [9, 12, 16]); assert.deepEqual(chordTones('Fmaj7'), [5, 9, 12, 16]);
});

test('every bar of every track is exactly one bar long', () => {
  for (const name of TRACK_NAMES) {
    const sc = SCORE_DATA[name];
    assert.equal(sc.lead.length, sc.chords.length, `${name}: melody and chords have the same number of bars`);
    for (const [i, n] of barLengths(sc.lead).entries()) assert.equal(n, STEPS, `${name} lead bar ${i + 1}`);
    for (const [i, n] of barLengths(sc.chords).entries()) assert.equal(n, STEPS, `${name} chord bar ${i + 1}`);
  }
});

test('home theme is calm, battle theme is fast and driving', () => {
  const home = compileTrack('home'), battle = compileTrack('battle');
  assert.ok(home.bpm < 100 && battle.bpm >= 140, 'tempo');
  const drums = (tr, k) => tr.events.flat().filter((e) => e.drum === k).length;
  assert.equal(drums(home, 'kick') + drums(home, 'snare'), 0, 'no drum kit at home');
  assert.ok(drums(battle, 'kick') > 0 && drums(battle, 'snare') > 0, 'battle has kick and snare');
  // battle bass moves in 8th notes; home bass is slow
  const bassCount = (tr) => tr.events.flat().filter((e) => /Bass$/.test(e.inst || '')).length;
  assert.ok(bassCount(battle) / battle.length > 3 * bassCount(home) / home.length);
  for (const tr of [home, battle]) {
    assert.ok(!tr.once && tr.length >= 16 * STEPS, 'loops of at least 16 bars');
    const notes = tr.events.flat().filter((e) => e.midi != null).map((e) => e.midi);
    assert.ok(Math.min(...notes) >= midi('C2') && Math.max(...notes) <= midi('E6'), 'pitch range');
  }
  assert.ok(compileTrack('win').once && compileTrack('lose').once, 'jingles play once');
});
