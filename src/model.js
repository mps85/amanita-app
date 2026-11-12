(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AmanitaModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_BYTES = 40 * 1024 * 1024;
  const colors = ['butter', 'rose', 'sage', 'lavender', 'paper'];
  const statuses = ['seed', 'exploring', 'established', 'locked'];
  const kinds = ['idea', 'character', 'world', 'story', 'image'];
  const directions = ['none', 'forward', 'reverse', 'both'];
  const beatStages = ['early', 'middle', 'late', 'unplaced'];
  const MAX_STORIES = 200;
  const id = () => globalThis.crypto.randomUUID();
  function validate(input) {
    const fail = () => { throw new Error('This is not a valid Amanita project.'); };
    if (!input || input.version !== 1 || typeof input.title !== 'string' || input.title.length > 150 ||
      !Array.isArray(input.notes) || input.notes.length > 2000 || !Array.isArray(input.connections) || input.connections.length > 4000) fail();
    if (JSON.stringify(input).length > MAX_BYTES) throw new Error('Project is too large (maximum 40 MB).');
    const storyIds = new Set();
    const storyInput = input.stories === undefined ? [] : input.stories;
    if (!Array.isArray(storyInput) || storyInput.length > MAX_STORIES) fail();
    const stories = storyInput.map(story => {
      if (!story || typeof story.id !== 'string' || !story.id || story.id.length > 100 || storyIds.has(story.id) ||
        typeof story.title !== 'string' || !story.title.trim() || story.title.length > 150) fail();
      storyIds.add(story.id);
      return { id: story.id, title: story.title.trim() };
    });
    const ids = new Set();
    const notes = input.notes.map((n, index) => {
      if (!n || typeof n.id !== 'string' || n.id.length > 100 || ids.has(n.id) ||
        typeof n.title !== 'string' || n.title.length > 150 || typeof n.body !== 'string' || n.body.length > 20000 ||
        !colors.includes(n.color) || !statuses.includes(n.status) || !kinds.includes(n.kind) ||
        ![1, 2, 3].includes(n.importance) || !Number.isFinite(n.x) || !Number.isFinite(n.y) || Math.abs(n.x) > 100000 || Math.abs(n.y) > 100000) fail();
      if (n.kind === 'image' && !(n.image === 'assets/forest.svg' || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(n.image || ''))) fail();
      if (n.kind === 'story' && ((n.beatStage !== undefined && !beatStages.includes(n.beatStage)) || (n.beatOrder !== undefined && (!Number.isInteger(n.beatOrder) || n.beatOrder < 0 || n.beatOrder > 100000)))) fail();
      const memberships = n.storyIds === undefined ? [] : n.storyIds;
      if (!Array.isArray(memberships) || memberships.length > stories.length ||
        new Set(memberships).size !== memberships.length || [...memberships].some(id => !storyIds.has(id))) fail();
      ids.add(n.id);
      return { id: n.id, title: n.title, body: n.body, color: n.color, status: n.status, kind: n.kind, importance: n.importance, x: n.x, y: n.y, ...(n.kind === 'image' ? { image: n.image } : {}), ...(n.kind === 'story' ? { beatStage: n.beatStage || 'unplaced', beatOrder: n.beatOrder ?? index } : {}), ...(memberships.length ? { storyIds: [...memberships] } : {}) };
    });
    const connectionIds = new Set();
    const connections = input.connections.map(c => {
      if (!c || typeof c.id !== 'string' || c.id.length > 100 || connectionIds.has(c.id) || !ids.has(c.from) || !ids.has(c.to) || c.from === c.to || typeof c.label !== 'string' || c.label.length > 100) fail();
      if (c.direction !== undefined && !directions.includes(c.direction)) fail();
      connectionIds.add(c.id); return { id: c.id, from: c.from, to: c.to, label: c.label, direction: c.direction ?? 'none' };
    });
    return { version: 1, title: input.title, notes, connections, ...(stories.length ? { stories } : {}) };
  }
  function updateNote(project, noteId, patch) {
    const note = project.notes.find(n => n.id === noteId);
    if (!note) throw new Error('Note not found.');
    if (note.status === 'locked' && ['title', 'body', 'kind', 'image'].some(key => key in patch && patch[key] !== note[key]))
      throw new Error('Unlock this rule before editing its content.');
    Object.assign(note, patch);
    return note;
  }
  function removeNote(project, noteId) {
    if (project.notes.find(n => n.id === noteId)?.status === 'locked') throw new Error('Unlock this rule before deleting it.');
    project.notes = project.notes.filter(n => n.id !== noteId);
    project.connections = project.connections.filter(c => c.from !== noteId && c.to !== noteId);
  }
  function seed() {
    return { version: 1, title: 'The forest between', notes: [
      { id: 'premise', title: 'What if the forest remembers?', body: 'Every path holds a memory. Some lead somewhere. Others lead to someone you used to be.', color: 'butter', status: 'seed', kind: 'idea', importance: 3, x: 140, y: 110 },
      { id: 'mara', title: 'Mara', body: 'A mapmaker who has never left home.\n\nCollects lost things. Afraid of being forgotten. Draws places she has only dreamed of.', color: 'rose', status: 'exploring', kind: 'character', importance: 3, x: 580, y: 80 },
      { id: 'magic', title: 'Magic always leaves a trace', body: 'A spell changes its caster a little. Nothing is made from nothing.\n\nA rule to build the magic system around.', color: 'sage', status: 'locked', kind: 'world', importance: 3, x: 1030, y: 130 },
      { id: 'map', title: 'Beyond the familiar paths', body: 'A little map of a place that does not quite exist yet.', color: 'paper', status: 'seed', kind: 'image', importance: 1, x: 130, y: 470, image: 'assets/forest.svg' },
      { id: 'scene', beatStage: 'unplaced', beatOrder: 4, title: 'An opening scene', body: 'Mara finds a map in her own handwriting.\n\nThere is one place on it she does not recognize. Someone has circled it in red.', color: 'butter', status: 'exploring', kind: 'story', importance: 2, x: 600, y: 490 },
      { id: 'question', title: 'What does she lose?', body: 'If drawing a new path is a kind of magic… what does it take from her?\n\nA memory? A name? Her way home?', color: 'lavender', status: 'seed', kind: 'idea', importance: 2, x: 1070, y: 510 },
    ], connections: [
      { id: 'c1', from: 'premise', to: 'mara', label: 'who belongs here?', direction: 'none' },
      { id: 'c2', from: 'mara', to: 'scene', label: 'starts with', direction: 'none' },
      { id: 'c3', from: 'magic', to: 'question', label: 'raises a question', direction: 'none' },
    ] };
  }
  return { MAX_BYTES, MAX_STORIES, colors, statuses, kinds, directions, beatStages, id, validate, updateNote, removeNote, seed };
});
