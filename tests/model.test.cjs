const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/model.js');
test('project round-trip preserves notes, images, and relationships', () => {
  const initial = M.seed();
  assert.deepEqual(M.validate(JSON.parse(JSON.stringify(initial))), initial);
});
test('locked rules protect content and deletion but allow board arrangement', () => {
  const p = M.seed();
  assert.throws(() => M.updateNote(p, 'magic', { body: 'changed' }), /Unlock/);
  assert.throws(() => M.removeNote(p, 'magic'), /Unlock/);
  M.updateNote(p, 'magic', { x: 400, importance: 1 });
  assert.equal(p.notes.find(n => n.id === 'magic').x, 400);
  M.updateNote(p, 'magic', { status: 'established' });
  M.updateNote(p, 'magic', { body: 'revised rule' });
  assert.equal(p.notes.find(n => n.id === 'magic').body, 'revised rule');
});
test('deleting a note removes every dangling relationship', () => {
  const p = M.seed(); M.removeNote(p, 'mara');
  assert.equal(p.connections.length, 1);
  assert.doesNotThrow(() => M.validate(p));
});
test('malformed imports cannot introduce dangling links, duplicate ids, or remote image URLs', () => {
  const dangling = M.seed(); dangling.connections[0].to = 'missing';
  assert.throws(() => M.validate(dangling));
  const duplicate = M.seed(); duplicate.notes[1].id = duplicate.notes[0].id;
  assert.throws(() => M.validate(duplicate));
  const remote = M.seed(); remote.notes.find(n => n.kind === 'image').image = 'https://example.com/tracker.png';
  assert.throws(() => M.validate(remote));
  const svg = M.seed(); svg.notes.find(n => n.kind === 'image').image = 'data:image/svg+xml;base64,AAAA';
  assert.throws(() => M.validate(svg));
  const badPosition = M.seed(); badPosition.notes[0].x = NaN;
  assert.throws(() => M.validate(badPosition));
});
test('importance and certainty remain independent', () => {
  const p = M.seed(); M.updateNote(p, 'premise', { importance: 3, status: 'seed' });
  const n = M.validate(p).notes.find(n => n.id === 'premise');
  assert.equal(n.importance, 3); assert.equal(n.status, 'seed');
});

test('older undirected projects migrate without changing relationships', () => {
  const p = M.seed();
  for (const c of p.connections) delete c.direction;
  const migrated = M.validate(p);
  assert.ok(migrated.connections.every(c => c.direction === 'none'));
  assert.equal(migrated.connections[0].from, p.connections[0].from);
  assert.equal(migrated.connections[0].to, p.connections[0].to);
});
test('all four directions survive project export/import and invalid directions are rejected', () => {
  for (const direction of M.directions) {
    const p = M.seed(); p.connections[0].direction = direction;
    assert.equal(M.validate(JSON.parse(JSON.stringify(p))).connections[0].direction, direction);
  }
  for (const direction of [null, 'sideways', 1, {}]) {
    const p = M.seed(); p.connections[0].direction = direction;
    assert.throws(() => M.validate(p));
  }
});

test('older story beats migrate to unplaced and placement/order round-trip', () => {
  const p = M.seed(); const beat = p.notes.find(n => n.kind === 'story');
  delete beat.beatStage; delete beat.beatOrder;
  const migrated = M.validate(p).notes.find(n => n.id === beat.id);
  assert.equal(migrated.beatStage, 'unplaced');
  assert.equal(migrated.beatOrder, p.notes.indexOf(beat));
  beat.beatStage = 'late'; beat.beatOrder = 2;
  assert.equal(M.validate(JSON.parse(JSON.stringify(p))).notes.find(n => n.id === beat.id).beatStage, 'late');
  beat.beatStage = 'wrong'; assert.throws(() => M.validate(p));
  beat.beatStage = 'early'; beat.beatOrder = -1; assert.throws(() => M.validate(p));
});

test('shared note and beat memberships survive export and reject dangling or duplicate IDs', () => {
  const p = M.seed();
  p.stories = [{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }];
  M.updateNote(p, 'magic', { storyIds: ['one', 'two'] });
  M.updateNote(p, 'scene', { storyIds: ['two'] });
  assert.deepEqual(M.validate(JSON.parse(JSON.stringify(p))), p);
  for (const storyIds of [['missing'], ['one', 'one'], 'one', null]) {
    M.updateNote(p, 'scene', { storyIds });
    assert.throws(() => M.validate(p));
  }
  M.updateNote(p, 'scene', { storyIds: ['two'] });
  p.stories[1].id = 'one';
  assert.throws(() => M.validate(p));
});

test('legacy beat order maps onto the spectrum and fine positions persist', () => {
  const p = M.seed();
  const beat = p.notes.find(note => note.kind === 'story');
  p.notes.push(
    { ...beat, id: 'early-two', beatStage: 'early', beatOrder: 2 },
    { ...beat, id: 'middle', beatStage: 'middle', beatOrder: 0 },
    { ...beat, id: 'early-one', beatStage: 'early', beatOrder: 1 },
    { ...beat, id: 'fine', beatStage: 'late', beatPosition: 0.731 }
  );
  const get = (project, id) => project.notes.find(note => note.id === id).beatPosition;
  const migrated = M.validate(p);
  assert.equal(get(migrated, 'scene'), undefined);
  assert.ok(get(migrated, 'early-one') < get(migrated, 'early-two'));
  assert.ok(get(migrated, 'early-two') < get(migrated, 'middle'));
  assert.equal(get(M.validate(migrated), 'fine'), 0.731);
  for (const position of [null, -0.001, 1.001, '0.5']) {
    beat.beatPosition = position;
    assert.throws(() => M.validate(p));
  }
});
