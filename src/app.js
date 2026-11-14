'use strict';
const M = window.AmanitaModel;
const $ = id => document.getElementById(id);
const names = { idea: 'Idea', character: 'Character', world: 'Worldbuilding', story: 'Story beat', image: 'Reference' };
const statusNames = { seed: 'Seed', exploring: 'Exploring', established: 'Established', locked: 'Locked rule' };
const statusIcons = { seed: '◦', exploring: '◐', established: '●', locked: '◆' };
let project, selected = null, filter = 'all', connectFrom = null, connecting = false, gesture = null;
let storyScope = '';
let view = { x: 0, y: 0, zoom: 1 };
let history = [], future = [], lastEdit = 0, lastEditKey = '', revision = 0;
let toastTimer, dialogResolve, pendingImageNote = null;
const connectionDragType = 'application/x-amanita-connection';
let connectionDragSource = null, pickerSource = null, pickerTarget = null;
const storageKey = 'amanita-project-v1';
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500);
}
function shortNoteTitle(title) {
  const words = (title || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'Untitled thought';
  return words.slice(0, 5).join(' ') + (words.length > 5 ? '…' : '');
}
function ask({ title, description = '', value = '', input = false, confirm = 'Save', cancel = 'Cancel', maxLength = 150, connection = null }) {
  if ($('dialog').open) return Promise.resolve(null);
  $('dialog-title').textContent = title;
  $('dialog-description').textContent = description;
  $('dialog-input').hidden = !input; $('dialog-input').value = value; $('dialog-input').maxLength = maxLength;
  $('connection-fields').hidden = !connection;
  if (connection) {
    const first = project.notes.find(n => n.id === connection.from);
    const second = project.notes.find(n => n.id === connection.to);
    const firstTitle = shortNoteTitle(first?.title), secondTitle = shortNoteTitle(second?.title);
    $('connection-endpoints').textContent = firstTitle + '\n' + secondTitle;
    $('connection-endpoints').title = (first?.title || 'Untitled thought') + '\n' + (second?.title || 'Untitled thought');
    const labels = {
      none: firstTitle + ' — ' + secondTitle + ' (no direction)',
      forward: firstTitle + ' → ' + secondTitle,
      reverse: secondTitle + ' → ' + firstTitle,
      both: firstTitle + ' ↔ ' + secondTitle + ' (both directions)',
    };
    for (const option of $('connection-direction').options) option.textContent = labels[option.value];
    $('connection-direction').value = connection.direction || 'none';
  }
  $('dialog-confirm').textContent = confirm; $('dialog-cancel').textContent = cancel;
  $('dialog').showModal();
  if (input) { $('dialog-input').focus(); $('dialog-input').select(); }
  else $('dialog-cancel').focus();
  return new Promise(resolve => dialogResolve = resolve);
}
$('dialog-cancel').addEventListener('click', () => $('dialog').close('cancel'));
$('dialog').addEventListener('close', () => {
  const result = $('dialog-input').hidden ? true : $('dialog-input').value;
  dialogResolve?.($('dialog').returnValue === 'confirm'
    ? ($('connection-fields').hidden ? result : { label: result, direction: $('connection-direction').value }) : null);
  dialogResolve = null; $('dialog').returnValue = '';
});
function remember(key = '') {
  const now = Date.now();
  if (!key || key !== lastEditKey || now - lastEdit > 700) {
    history.push(JSON.stringify(project)); if (history.length > 50) history.shift();
  }
  future = []; lastEdit = now; lastEditKey = key;
}
async function save() {
  const thisRevision = ++revision;
  const snapshot = M.validate(project);
  $('save-status').textContent = 'Saving…';
  try {
    // Write immediately so typing never waits for a debounce to persist.
    if (!window.amanita) localStorage.setItem(storageKey, JSON.stringify(snapshot));
    else await window.amanita.save(snapshot);
    if (thisRevision === revision) {
      $('save-status').replaceChildren(element('span', 'save-dot'), document.createTextNode('Saved on this device'));
    }
  } catch (error) {
    $('save-status').textContent = 'Save failed · please export';
    toast('Could not save. Export your project to keep a copy. ' + error.message);
  }
}
function changed() { renderBoard(); void save(); }
function inStory(note) { return !storyScope || !!note.storyIds?.includes(storyScope); }
function renderStoryControls() {
  const stories = project.stories || [];
  const picker = $('story-scope');
  const entries = [['', 'All stories'], ...stories.map(story => [story.id, story.title])];
  if (picker.options.length !== entries.length || entries.some(([id, title], i) => picker.options[i].value !== id || picker.options[i].text !== title)) {
    picker.replaceChildren(...entries.map(([id, title]) => new Option(title, id)));
  }
  picker.value = storyScope;
  $('rename-story').hidden = $('remove-story').hidden = !storyScope;
  $('add-story').disabled = stories.length >= M.MAX_STORIES;
}
function setStoryScope(id) {
  storyScope = id;
  cancelConnect();
  closeInspector();
  fit();
}
function visibleNotes() {
  const query = $('search').value.toLowerCase().trim();
  const certainty = $('certainty-filter').value;
  return project.notes.filter(n => inStory(n) && (filter === 'all' ? n.kind !== 'story' : n.kind === filter) && (certainty === 'all' || n.status === certainty) && (!query || (n.title + ' ' + n.body).toLowerCase().includes(query)));
}
function renderBoard() {
  $('project-name').textContent = project.title || 'Untitled comic';
  renderStoryControls();
  for (const kind of ['all', 'character', 'world', 'story', 'image']) $(kind + '-count').textContent = project.notes.filter(n => inStory(n) && (kind === 'all' ? n.kind !== 'story' : n.kind === kind)).length;
  const notes = visibleNotes();
  const storyView = filter === 'story';
  $('viewport').hidden = storyView; $('timeline').hidden = !storyView;
  $('connect').hidden = storyView; $('add-image').hidden = storyView;
  $('add-note').textContent = storyView ? '＋ Add a beat' : '＋ Add a note';
  document.querySelector('footer > div').hidden = storyView;
  if (storyView) {
    $('cards').replaceChildren(); $('connections').replaceChildren();
    $('note-summary').textContent = notes.length + ' beats · approximate sequence';
    renderTimeline(notes); return;
  }
  $('empty').hidden = !!notes.length;
  $('empty-description').textContent = storyScope && !project.notes.some(inStory)
    ? 'Add something here, or assign an existing note from All stories.'
    : project.notes.length ? 'No matching thoughts. Change your filters or add something new.' : 'Add a note or an image to plant your first idea.';
  $('note-summary').textContent = `${notes.length} ${notes.length === 1 ? 'thought' : 'thoughts'} · ${project.connections.filter(c => notes.some(n => n.id === c.from) && notes.some(n => n.id === c.to)).length} visible threads`;
  $('cards').replaceChildren();
  for (const n of notes) {
    const card = element('article', `note ${n.color}${n.kind === 'image' ? ' image-note' : ''}${selected === n.id ? ' selected' : ''}${connecting && connectFrom !== n.id ? ' connect-target' : ''}`);
    card.dataset.id = n.id; card.tabIndex = 0; card.setAttribute('aria-label', `${n.title || 'Untitled thought'}, ${statusNames[n.status]}`);
    card.style.left = n.x + 'px'; card.style.top = n.y + 'px';
    const type = element('div', 'note-type', names[n.kind]);
    const importance = element('span', 'importance'); importance.title = ['A little detail', 'Worth developing', 'Central to the story'][n.importance - 1];
    importance.setAttribute('aria-label', importance.title);
    for (let i = 1; i <= 3; i++) importance.append(element('i', i <= n.importance ? 'filled' : ''));
    type.append(importance); card.append(type);
    if (n.kind === 'image') { const img = element('img'); img.src = n.image; img.alt = n.title; img.draggable = false; card.append(img); }
    card.append(element('h2', '', n.title || 'An untitled thought'), element('p', 'note-body', n.body || 'A thought waiting to take shape…'));
    const status = element('div', 'note-status'); status.append(element('span', 'status-icon', statusIcons[n.status]), document.createTextNode(statusNames[n.status])); card.append(status);
    card.addEventListener('pointerdown', event => startNoteGesture(event, n.id));
    card.addEventListener('keydown', event => { if (event.target === card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); chooseNote(n.id); } });
    addConnectionHandle(card, n);
    $('cards').append(card);
  }
  drawConnections();
  updateTransform();
}
let draggedBeat = null;
function placeBeat(id, position) {
  const beat = project.notes.find(n => n.id === id);
  if (!beat || beat.kind !== 'story' || (beat.beatPosition ?? null) === position) return;
  remember();
  if (position === null) delete beat.beatPosition;
  else beat.beatPosition = position;
  beat.beatStage = position === null ? 'unplaced' : position < 1/3 ? 'early' : position < 2/3 ? 'middle' : 'late';
  changed(); renderInspector();
}
function beatCard(note, index) {
  const placed = note.beatPosition !== undefined;
  const card = element('article', 'beat-card ' + note.color + (selected === note.id ? ' selected' : '') + (connecting && connectFrom !== note.id ? ' connect-target' : ''));
  card.dataset.id = note.id;
  card.draggable = true;
  const title = note.title || 'Untitled beat';
  const open = element('button', 'beat-open');
  open.setAttribute('aria-label', 'Edit beat: ' + title);
  open.append(element('span', 'beat-status', statusIcons[note.status] + ' ' + statusNames[note.status]),
    element('h3', '', title), element('p', '', note.body || 'A moment waiting to happen…'));
  open.addEventListener('click', () => void chooseNote(note.id));
  const controls = element('div', 'beat-controls');
  controls.append(element('span', '', placed ? 'Beat ' + (index + 1) : 'Not placed yet'));
  if (placed) {
    for (const [step, verb, arrow] of [[-1, 'earlier', '←'], [1, 'later', '→']]) {
      const button = element('button', '', arrow);
      button.dataset.nudge = verb;
      button.setAttribute('aria-label', 'Move ' + title + ' ' + verb);
      button.disabled = step < 0 ? note.beatPosition === 0 : note.beatPosition === 1;
      button.addEventListener('click', () => {
        placeBeat(note.id, Math.max(0, Math.min(1000, Math.round(note.beatPosition * 1000) + step * 25)) / 1000);
        const next = [...$('timeline').querySelectorAll('.beat-card')].find(card => card.dataset.id === note.id);
        (next?.querySelector('[data-nudge="' + verb + '"]:not(:disabled)') || next?.querySelector('.beat-open'))?.focus({ preventScroll: true });
      });
      controls.append(button);
    }
  }
  card.append(open, controls);
  card.addEventListener('dragstart', event => {
    draggedBeat = note.id;
    event.dataTransfer.setData('application/x-amanita-beat', note.id);
    event.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    draggedBeat = null;
    for (const zone of $('timeline').querySelectorAll('.drop-ready')) zone.classList.remove('drop-ready');
  });
  addConnectionHandle(card, note);
  return card;
}
function beatDropZone(zone, getPosition, preview = () => {}) {
  zone.addEventListener('dragover', event => {
    if (!draggedBeat) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    preview(event);
    zone.classList.add('drop-ready');
  });
  zone.addEventListener('dragleave', event => {
    if (!zone.contains(event.relatedTarget)) zone.classList.remove('drop-ready');
  });
  zone.addEventListener('drop', event => {
    if (!draggedBeat) return;
    event.preventDefault();
    const id = draggedBeat;
    draggedBeat = null;
    zone.classList.remove('drop-ready');
    placeBeat(id, getPosition(event));
  });
}
function renderTimeline(notes) {
  const placed = notes.filter(n => n.beatPosition !== undefined).sort((a,b) => a.beatPosition - b.beatPosition || (a.beatOrder ?? 0) - (b.beatOrder ?? 0));
  const unplaced = notes.filter(n => n.beatPosition === undefined).sort((a,b) => (a.beatOrder ?? 0) - (b.beatOrder ?? 0));
  const hint = element('p', 'timeline-intro', 'Drag a beat anywhere from Early to Later. Leave space for a pause, or group beats that happen close together.');
  const track = element('section', 'beat-track');
  track.setAttribute('aria-label', 'Timeline spectrum');
  const axis = element('div', 'beat-axis');
  track.append(axis);
  for (const [stage, title] of [['early', 'Early'], ['middle', 'Along the way'], ['late', 'Later']]) {
    const label = element('span', 'beat-landmark', title);
    label.style.left = M.beatLandmarks[stage] * 100 + '%';
    axis.append(label);
  }
  const cursor = element('div', 'beat-drop-cursor');
  axis.append(cursor);
  // Stack nearby cards without moving their pins along the timeline.
  const rows = [];
  placed.forEach((note, index) => {
    let row = rows.findIndex(last => note.beatPosition - last >= 0.24);
    if (row < 0) row = rows.length;
    rows[row] = note.beatPosition;
    const slot = element('div', 'beat-slot');
    slot.style.left = note.beatPosition * 100 + '%';
    slot.style.setProperty('--row', row);
    slot.append(element('div', 'beat-stem'), beatCard(note, index));
    axis.append(slot);
  });
  track.style.setProperty('--rows', Math.max(1, rows.length));
  if (!placed.length) track.append(element('p', 'beat-empty', 'Drop a beat anywhere along the timeline.'));
  function positionAt(event) {
    const rect = axis.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * 1000) / 1000;
  }
  beatDropZone(track, positionAt, event => { cursor.style.left = positionAt(event) * 100 + '%'; });
  const bucket = element('section', 'beat-bucket');
  const heading = element('div', 'lane-heading');
  heading.append(element('h2', '', 'Unplaced'), element('span', '', String(unplaced.length)));
  bucket.setAttribute('aria-label', 'Unplaced beats');
  bucket.append(heading, element('p', 'lane-description', 'Drag a beat here to take it off the timeline.'));
  const cards = element('div', 'beat-bucket-cards');
  for (const note of unplaced) cards.append(beatCard(note));
  bucket.append(cards);
  beatDropZone(bucket, () => null);
  $('timeline').replaceChildren(hint, bucket, track);
}
$('beat-position').addEventListener('change', event => { if (selected) placeBeat(selected, Number(event.target.value) / 1000); });
$('toggle-beat-placement').addEventListener('click', () => {
  const note = project.notes.find(n => n.id === selected);
  if (note?.kind === 'story') placeBeat(note.id, note.beatPosition === undefined ? M.beatLandmarks.middle : null);
});
function svg(tag, attributes) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
  return el;
}
function drawConnections() {
  const canvas = $('connections'); canvas.replaceChildren();
  const defs = svg('defs', {});
  const marker = svg('marker', { id: 'thread-arrow', viewBox: '0 0 8 8', refX: '8', refY: '4', markerWidth: '10', markerHeight: '10', markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' });
  marker.append(svg('path', { d: 'M 0 0 L 8 4 L 0 8 Z', fill: '#7e896b' }));
  defs.append(marker); canvas.append(defs);
  const nodes = new Map([...$('cards').children].map(el => [el.dataset.id, el]));
  for (const c of project.connections) {
    const a = nodes.get(c.from), b = nodes.get(c.to); if (!a || !b) continue;
    let ax = a.offsetLeft + a.offsetWidth / 2, ay = a.offsetTop + a.offsetHeight / 2;
    let bx = b.offsetLeft + b.offsetWidth / 2, by = b.offsetTop + b.offsetHeight / 2;
    const dx = bx - ax, dy = by - ay;
    if (Math.abs(dx) > Math.abs(dy)) { ax += Math.sign(dx) * (a.offsetWidth / 2 + 9); bx -= Math.sign(dx) * (b.offsetWidth / 2 + 9); }
    else { ay += Math.sign(dy) * (a.offsetHeight / 2 + 9); by -= Math.sign(dy) * (b.offsetHeight / 2 + 9); }
    const bend = Math.abs(dx) > Math.abs(dy) ? 22 : -25;
    const cx = (ax + bx) / 2 + (Math.abs(dx) > Math.abs(dy) ? 0 : bend), cy = (ay + by) / 2 + (Math.abs(dx) > Math.abs(dy) ? bend : 0);
    const direction = c.direction || 'none';
    const path = svg('path', { d: `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`, class: 'connection-path', 'data-connection-id': c.id });
    if (direction === 'reverse' || direction === 'both') path.setAttribute('marker-start', 'url(#thread-arrow)');
    if (direction === 'forward' || direction === 'both') path.setAttribute('marker-end', 'url(#thread-arrow)');
    canvas.append(path);
    const label = svg('text', { x: (ax + bx + 2 * cx) / 4, y: (ay + by + 2 * cy) / 4 - 8, 'text-anchor': 'middle', class: 'connection-label', role: 'button', tabindex: '0', 'aria-label': 'Edit connection: ' + c.label });
    label.textContent = c.label || 'connected';
    label.addEventListener('pointerdown', e => e.stopPropagation());
    label.addEventListener('click', () => editConnection(c.id));
    label.addEventListener('keydown', e => { if (e.key === 'Enter') editConnection(c.id); });
    canvas.append(label);
  }
}
function updateTransform() {
  $('world').style.transform = `translate(${view.x}px,${view.y}px) scale(${view.zoom})`;
  $('zoom-label').textContent = Math.round(view.zoom * 100) + '%';
  $('viewport').style.backgroundPosition = `${view.x}px ${view.y}px`;
  $('viewport').style.backgroundSize = `${22 * view.zoom}px ${22 * view.zoom}px`;
}
function fit() {
  if (filter === 'story') return;
  const notes = visibleNotes();
  if (!notes.length) { view = { x: 0, y: 0, zoom: 1 }; updateTransform(); return; }
  const minX = Math.min(...notes.map(n => n.x)) - 45, minY = Math.min(...notes.map(n => n.y)) - 45;
  const maxX = Math.max(...notes.map(n => n.x + (n.kind === 'image' ? 300 : 280))) + 45;
  const maxY = Math.max(...notes.map(n => n.y + ($('cards').children.namedItem?.(n.id)?.offsetHeight || 310))) + 60;
  const width = $('viewport').clientWidth, height = $('viewport').clientHeight;
  view.zoom = Math.max(.25, Math.min(1, width / (maxX - minX), height / (maxY - minY)));
  view.x = (width - (maxX - minX) * view.zoom) / 2 - minX * view.zoom;
  view.y = (height - (maxY - minY) * view.zoom) / 2 - minY * view.zoom;
  updateTransform();
}
function zoom(factor, point) {
  const rect = $('viewport').getBoundingClientRect();
  const px = point ? point.x - rect.left : rect.width / 2, py = point ? point.y - rect.top : rect.height / 2;
  const next = Math.max(.25, Math.min(2, view.zoom * factor));
  view.x = px - (px - view.x) * next / view.zoom; view.y = py - (py - view.y) * next / view.zoom; view.zoom = next;
  updateTransform();
}
async function chooseNote(id) {
  if (connecting) {
    if (!connectFrom) {
      connectFrom = id; selected = id; updateConnectTip(); renderBoard(); return;
    }
    const source = connectFrom;
    if (source === id) { toast('Choose a different note to connect.'); return; }
    cancelConnect(); renderBoard();
    await createConnection(source, id); return;
  }
  selected = id; renderInspector(); renderBoard();
}
function renderInspector() {
  const n = project.notes.find(n => n.id === selected);
  $('inspector').hidden = !n;
  if (!n) return;
  $('beat-placement').hidden = n.kind !== 'story';
  $('beat-position').value = Math.round((n.beatPosition ?? M.beatLandmarks.middle) * 1000);
  $('beat-position').disabled = n.beatPosition === undefined;
  $('beat-position-hint').textContent = n.beatPosition === undefined ? 'This beat is in Unplaced.' : 'Move the slider or use its arrow keys to adjust the position.';
  $('toggle-beat-placement').textContent = n.beatPosition === undefined ? 'Place on timeline' : 'Move to Unplaced';
  $('inspector-label').textContent = names[n.kind].toUpperCase() + ' DETAILS';
  $('note-title').value = n.title; $('note-body').value = n.body;
  $('note-kind').value = n.kind; $('note-importance').value = n.importance; $('note-status').value = n.status;
  const locked = n.status === 'locked';
  $('note-title').disabled = locked; $('note-body').disabled = locked; $('note-kind').disabled = locked || n.kind === 'image';
  $('note-kind').querySelector('[value="image"]').disabled = false;
  $('delete-note').disabled = locked; $('lock-message').hidden = !locked;
  $('story-membership').hidden = !project.stories?.length;
  $('note-stories').replaceChildren();
  for (const story of project.stories || []) {
    const label = element('label', 'story-choice');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!n.storyIds?.includes(story.id);
    checkbox.addEventListener('change', () => {
      remember();
      const memberships = new Set(n.storyIds);
      if (checkbox.checked) memberships.add(story.id);
      else memberships.delete(story.id);
      M.updateNote(project, n.id, { storyIds: [...memberships] });
      cancelConnect();
      changed();
    });
    label.append(checkbox, element('span', '', story.title));
    $('note-stories').append(label);
  }
  $('swatches').replaceChildren();
  for (const color of M.colors) {
    const button = element('button', `${color}${n.color === color ? ' chosen' : ''}`); button.title = color; button.setAttribute('aria-label', color + ' paper'); button.setAttribute('aria-pressed', n.color === color);
    button.addEventListener('click', () => { remember(); M.updateNote(project, selected, { color }); changed(); renderInspector(); });
    $('swatches').append(button);
  }
  $('linked-notes').replaceChildren();
  const links = project.connections.filter(c => c.from === selected || c.to === selected);
  if (!links.length) $('linked-notes').textContent = 'No threads yet. Everything starts somewhere.';
  for (const c of links) {
    const other = project.notes.find(note => note.id === (c.from === selected ? c.to : c.from));
    const row = element('div', 'linked-row');
    const button = element('button', '', other.title || 'Untitled thought'); button.append(element('small', '', c.label + ' · ' + connectionSummary(c)));
    button.title = connectionSummary(c);
    button.addEventListener('click', () => {
      if (!inStory(other)) { storyScope = ''; toast('Showing All stories to open the linked note.'); }
      $('search').value = ''; $('certainty-filter').value = 'all';
      setFilter(other.kind === 'story' ? 'story' : 'all'); selected = other.id;
      renderBoard(); renderInspector(); centerNote(other);
    });
    const remove = element('button', '', '×'); remove.setAttribute('aria-label', 'Remove connection to ' + other.title);
    remove.addEventListener('click', () => { remember(); project.connections = project.connections.filter(link => link.id !== c.id); changed(); renderInspector(); });
    const edit = element('button', '', '✎'); edit.setAttribute('aria-label', 'Edit connection to ' + other.title);
    edit.addEventListener('click', () => editConnection(c.id));
    row.append(button, edit, remove); $('linked-notes').append(row);
  }
}
function centerNote(n) {
  if (filter === 'story') return;
  view.x = $('viewport').clientWidth / 2 - (n.x + 140) * view.zoom;
  view.y = $('viewport').clientHeight / 2 - (n.y + 130) * view.zoom; updateTransform();
}
function closeInspector() { selected = null; $('inspector').hidden = true; renderBoard(); }
function setFilter(kind) {
  filter = kind; cancelConnect(); closeInspector();
  for (const button of document.querySelectorAll('[data-filter]')) button.classList.toggle('active', button.dataset.filter === kind);
  const headings = { all: ['First sparks', 'Collect the fragments. Follow the threads. See what grows.', 'Scrapbook'], character: ['People of your world', 'Little details that make someone feel real.', 'Characters'], world: ['A world taking shape', 'Places, customs, rules, and things yet to be discovered.', 'World notes'], story: ['A loose timeline', 'Put the moments in a rough order. Leave room for things to change.', 'Story beats'], image: ['A little visual inspiration', 'Gather references, sketches, and places your imagination can wander.', 'Image references'] };
  $('board-title').replaceChildren(document.createTextNode(headings[kind][0]), element('span', '', '✳'));
  $('add-note').hidden = kind === 'image';
  $('board-description').textContent = headings[kind][1]; $('breadcrumb').textContent = headings[kind][2];
  renderBoard(); fit();
}
function startNoteGesture(event, id) {
  if (event.button !== 0 || event.target.closest('.connection-handle')) return;
  event.stopPropagation(); event.preventDefault();
  if (connecting) { void chooseNote(id); return; }
  const n = project.notes.find(n => n.id === id);
  gesture = { kind: 'note', id, startX: event.clientX, startY: event.clientY, originalX: n.x, originalY: n.y, moved: false, snapshot: JSON.stringify(project) };
  event.currentTarget.classList.add('dragging');
}
$('viewport').addEventListener('pointerdown', event => {
  if (event.target.closest('button') || event.target.closest('.connection-label') || event.button !== 0) return;
  event.preventDefault();
  gesture = { kind: 'pan', startX: event.clientX, startY: event.clientY, originalX: view.x, originalY: view.y, moved: false };
  $('viewport').classList.add('panning');
});
window.addEventListener('pointermove', event => {
  if (!gesture) return;
  const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
  if (Math.hypot(dx, dy) > 4) gesture.moved = true;
  if (!gesture.moved) return;
  if (gesture.kind === 'pan') { view.x = gesture.originalX + dx; view.y = gesture.originalY + dy; updateTransform(); }
  else {
    const note = project.notes.find(n => n.id === gesture.id);
    note.x = Math.max(-100000, Math.min(100000, gesture.originalX + dx / view.zoom));
    note.y = Math.max(-100000, Math.min(100000, gesture.originalY + dy / view.zoom));
    const card = [...$('cards').children].find(el => el.dataset.id === note.id);
    card.style.left = note.x + 'px'; card.style.top = note.y + 'px'; drawConnections();
  }
});
function endGesture() {
  if (!gesture) return;
  const g = gesture; gesture = null; $('viewport').classList.remove('panning');
  if (g.kind === 'note') {
    if (g.moved) { history.push(g.snapshot); if (history.length > 50) history.shift(); future = []; lastEditKey = ''; changed(); }
    else void chooseNote(g.id);
  } else if (!g.moved) { if (connecting) { cancelConnect(); renderBoard(); } else closeInspector(); }
}
window.addEventListener('pointerup', endGesture);
window.addEventListener('blur', endGesture);
$('viewport').addEventListener('wheel', event => {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) zoom(Math.exp(-event.deltaY * .003), { x: event.clientX, y: event.clientY });
  else { view.x -= event.deltaX; view.y -= event.deltaY; updateTransform(); }
}, { passive: false });
$('viewport').addEventListener('dblclick', event => {
  if (event.target === $('viewport')) addNote(undefined, { x: event.clientX, y: event.clientY });
});
function addNote(kind, point, image, title) {
  if (!image && (kind === 'image' || (!kind && filter === 'image'))) { pendingImageNote = null; $('image-file').click(); return; }
  $('search').value = ''; $('certainty-filter').value = 'all';
  kind ||= filter === 'all' ? 'idea' : filter;
  if (image && filter !== 'all' && filter !== 'image') setFilter('all');
  const rect = $('viewport').getBoundingClientRect();
  const x = ((point ? point.x - rect.left : rect.width / 2) - view.x) / view.zoom - 140;
  const y = ((point ? point.y - rect.top : rect.height / 2) - view.y) / view.zoom - 115;
  const note = { id: M.id(), title: title || '', body: '', kind, importance: 1, status: 'seed', color: ({ character: 'rose', world: 'sage', story: 'butter', image: 'paper' })[kind] || 'butter', x, y, ...(image ? { image } : {}), ...(kind === 'story' ? { beatStage: 'unplaced', beatOrder: project.notes.length } : {}) };
  if (storyScope) note.storyIds = [storyScope];
  remember(); project.notes.push(note); selected = note.id; changed(); renderInspector(); centerNote(note); $('note-title').focus();
}
async function imageFile(file, point, noteId = null) {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) { toast('Choose a PNG, JPEG, WebP, or GIF image.'); return; }
  if (file.size > 8 * 1024 * 1024) { toast('Choose an image smaller than 8 MB.'); return; }
  try {
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    if (JSON.stringify(project).length + data.length > M.MAX_BYTES) { toast('This project is full (40 MB). Export it before starting another.'); return; }
    if (noteId) {
      const note = project.notes.find(n => n.id === noteId);
      if (!note || note.status === 'locked') { toast('Unlock this note before attaching an image.'); return; }
      remember(); M.updateNote(project, noteId, { kind: 'image', image: data, title: note.title || file.name.replace(/\.[^.]+$/, '').slice(0,150) });
      if (filter !== 'all' && filter !== 'image') setFilter('image');
      selected = noteId; changed(); renderInspector(); centerNote(note);
    } else addNote('image', point, data, file.name.replace(/\.[^.]+$/, '').slice(0, 150));
  } catch { toast('Could not read that image. Please try another file.'); }
}
$('image-file').addEventListener('change', async () => {
  const noteId = pendingImageNote; pendingImageNote = null;
  if ($('image-file').files[0]) await imageFile($('image-file').files[0], undefined, noteId);
  $('image-file').value = ''; if (noteId) renderInspector();
});
$('image-file').addEventListener('cancel', () => { pendingImageNote = null; renderInspector(); });
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', async event => {
  event.preventDefault();
  if (!event.target.closest('#viewport')) return;
  const files = [...event.dataTransfer.files];
  if (files.length) { for (const file of files) await imageFile(file, { x: event.clientX, y: event.clientY }); }
  else { const text = event.dataTransfer.getData('text/plain'); if (text) { if (filter === 'image') setFilter('all'); addNote(undefined, { x: event.clientX, y: event.clientY }); M.updateNote(project, selected, { title: text.slice(0, 80), body: text.slice(0, 20000) }); changed(); renderInspector(); } }
});
function updateConnectTip() {
  $('canvas-tip').classList.add('connecting');
  const source = project.notes.find(n => n.id === connectFrom);
  $('canvas-tip').textContent = source
    ? `Connecting from “${source.title || 'Untitled thought'}” · Click another note · Esc to cancel`
    : 'Click the first note, then the second · Esc to cancel';
}
function cancelConnect() {
  connectFrom = null; connecting = false; $('connect').classList.remove('active');
  $('connect').textContent = '⌁ Connect notes';
  $('canvas-tip').classList.remove('connecting'); $('canvas-tip').textContent = 'Drag notes to arrange · Drag the background to explore';
}
function startConnect() {
  if (connecting) { cancelConnect(); renderBoard(); renderInspector(); return; }
  connecting = true; connectFrom = selected;
  $('inspector').hidden = true;
  $('connect').classList.add('active'); $('connect').textContent = '× Cancel connection';
  updateConnectTip(); renderBoard(); fit();
}
async function createConnection(from, to) {
  if (from === to || !project.notes.some(n => n.id === from) || !project.notes.some(n => n.id === to)) return;
  const result = await ask({ title: 'Follow a thread', description: 'Name the relationship and choose its direction.', input: true, value: 'connected to', maxLength: 100, confirm: 'Connect', connection: { from, to, direction: 'none' } });
  if (result !== null) {
    remember();
    project.connections.push({ id: M.id(), from, to, label: result.label.trim() || 'connected to', direction: result.direction });
    changed();
  }
  renderInspector();
}
function openConnectionPicker(id) {
  const note = project.notes.find(n => n.id === id);
  if (!note || $('connection-picker').open || $('dialog').open) return;
  pickerSource = id; pickerTarget = null;
  $('connection-picker-source').textContent = 'From: ' + (note.title || 'Untitled thought');
  $('connection-search').value = '';
  $('connection-category').replaceChildren(new Option('All categories', ''), ...M.kinds.map(kind => new Option(names[kind], kind)));
  $('connection-story').replaceChildren(new Option('All stories', ''), ...(project.stories || []).map(story => new Option(story.title, story.id)));
  renderConnectionResults();
  $('connection-picker').showModal();
  $('connection-search').focus();
}
function renderConnectionResults() {
  const query = $('connection-search').value.trim().toLowerCase();
  const category = $('connection-category').value, story = $('connection-story').value;
  const matches = project.notes.filter(note => note.id !== pickerSource &&
    (!category || note.kind === category) && (!story || note.storyIds?.includes(story)) &&
    (!query || (note.title + ' ' + note.body).toLowerCase().includes(query)));
  matches.sort((a, b) => a.title.localeCompare(b.title));
  $('connection-results-count').textContent = matches.length ? matches.length + (matches.length === 1 ? ' matching note' : ' matching notes') : 'No matching notes. Try changing the filters.';
  $('connection-results').replaceChildren(...matches.map(note => {
    const row = element('li');
    const button = element('button', 'connection-result', note.title || 'Untitled thought');
    const stories = (project.stories || []).filter(story => note.storyIds?.includes(story.id)).map(story => story.title);
    button.append(element('small', '', [names[note.kind], ...stories].join(' · ')));
    button.addEventListener('click', () => { pickerTarget = note.id; $('connection-picker').close(); });
    row.append(button);
    return row;
  }));
}
$('connection-search').addEventListener('input', renderConnectionResults);
$('connection-category').addEventListener('change', renderConnectionResults);
$('connection-story').addEventListener('change', renderConnectionResults);
$('connection-picker').addEventListener('close', () => {
  const from = pickerSource, to = pickerTarget;
  pickerSource = pickerTarget = null;
  if (to) void createConnection(from, to);
});
function addConnectionHandle(card, note) {
  const handle = element('button', 'connection-handle', '⌁');
  handle.draggable = true;
  handle.title = 'Drag onto another card to connect, or click to find a note';
  handle.setAttribute('aria-label', 'Connect from ' + (note.title || 'Untitled thought'));
  handle.addEventListener('click', () => openConnectionPicker(note.id));
  handle.addEventListener('dragstart', event => {
    event.stopPropagation();
    connectionDragSource = note.id;
    event.dataTransfer.setData(connectionDragType, note.id);
    event.dataTransfer.effectAllowed = 'link';
  });
  handle.addEventListener('dragend', () => {
    connectionDragSource = null;
    for (const target of document.querySelectorAll('.connection-drop-target')) target.classList.remove('connection-drop-target');
  });
  card.addEventListener('dragover', event => {
    if (!connectionDragSource || connectionDragSource === note.id || !event.dataTransfer.types.includes(connectionDragType)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'link';
    card.classList.add('connection-drop-target');
  });
  card.addEventListener('dragleave', event => {
    if (!card.contains(event.relatedTarget)) card.classList.remove('connection-drop-target');
  });
  card.addEventListener('drop', event => {
    if (!connectionDragSource || connectionDragSource === note.id || event.dataTransfer.getData(connectionDragType) !== connectionDragSource) return;
    event.preventDefault();
    event.stopPropagation();
    card.classList.remove('connection-drop-target');
    void createConnection(connectionDragSource, note.id);
  });
  card.append(handle);
}
function connectionSummary(c) {
  const first = project.notes.find(n => n.id === c.from)?.title || 'Untitled thought';
  const second = project.notes.find(n => n.id === c.to)?.title || 'Untitled thought';
  const symbol = { none: '—', forward: '→', reverse: '←', both: '↔' }[c.direction || 'none'];
  return first + ' ' + symbol + ' ' + second;
}
async function editConnection(id) {
  const c = project.connections.find(c => c.id === id);
  const result = await ask({ title: 'Edit this thread', description: 'Change its label or direction.', input: true, value: c.label, maxLength: 100, connection: c });
  if (result !== null) { remember(); c.label = result.label.trim() || 'connected'; c.direction = result.direction; changed(); renderInspector(); }
}
for (const [field, property] of [['note-title', 'title'], ['note-body', 'body'], ['note-kind', 'kind'], ['note-importance', 'importance'], ['note-status', 'status']]) {
  $(field).addEventListener(field === 'note-title' || field === 'note-body' ? 'input' : 'change', async () => {
    const n = project.notes.find(n => n.id === selected); if (!n) return;
    const value = property === 'importance' ? Number($(field).value) : $(field).value;
    if (property === 'kind' && value === 'image' && n.kind !== 'image') {
      pendingImageNote = n.id; $(field).value = n.kind; $('image-file').click(); return;
    }
    if (property === 'status' && (value === 'locked' || n.status === 'locked')) {
      const confirmed = await ask({ title: value === 'locked' ? 'Make this a locked rule?' : 'Unlock this rule?', description: value === 'locked' ? 'Its title and notes will be protected until you deliberately unlock it. You can still arrange it and connect it to other thoughts.' : 'You will be able to revise its title, notes, and category again.', confirm: value === 'locked' ? 'Lock rule' : 'Unlock' });
      if (!confirmed) { $(field).value = n.status; return; }
    }
    try { remember(n.id + ':' + property); M.updateNote(project, n.id, { [property]: value }); if (property === 'kind' && value === 'story') { setFilter('story'); selected = n.id; }
      changed(); if (!['title', 'body'].includes(property)) renderInspector(); }
    catch (error) { toast(error.message); renderInspector(); }
  });
}
$('delete-note').addEventListener('click', async () => {
  const n = project.notes.find(n => n.id === selected); if (!n || n.status === 'locked') return;
  if (await ask({ title: 'Let this thought go?', description: 'This note and its connections will be removed. You can undo this with Ctrl+Z.', confirm: 'Delete note' })) {
    remember(); M.removeNote(project, n.id); closeInspector(); changed();
  }
});
function undo(redo = false) {
  const source = redo ? future : history, target = redo ? history : future;
  if (!source.length) { toast(redo ? 'Nothing to redo yet.' : 'Nothing to undo yet.'); return; }
  target.push(JSON.stringify(project)); project = JSON.parse(source.pop()); lastEditKey = ''; cancelConnect();
  if (!project.stories?.some(story => story.id === storyScope)) storyScope = '';
  if (!project.notes.some(n => n.id === selected)) selected = null;
  changed(); renderInspector(); toast(redo ? 'Change restored.' : 'Last change undone.');
}
async function exportProject() {
  try {
    if (window.amanita) { const exported = await window.amanita.exportProject(project); if (exported) toast('Project exported, images included.'); return exported; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(M.validate(project), null, 2)], { type: 'application/json' }));
    const a = element('a'); a.href = url; a.download = (project.title || 'My comic').replace(/[^a-z0-9 _-]/gi, '') + '.amanita.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Project downloaded, images included.'); return true;
  } catch (error) { toast('Could not export: ' + error.message); return false; }
}
async function replaceProject(input) {
  let incoming;
  try { incoming = M.validate(input); } catch (error) { toast(error.message); return; }
  if (!await ask({ title: 'Open this scrapbook?', description: `“${incoming.title || 'Untitled comic'}” will replace the active project. Export the current project first if you want to keep a separate copy.`, confirm: 'Open project' })) return;
  remember(); project = incoming; resetView(); changed(); fit();
}
function resetView() { storyScope = ''; selected = null; $('search').value = ''; $('certainty-filter').value = 'all'; setFilter('all'); }
$('project-file').addEventListener('change', async () => {
  const file = $('project-file').files[0];
  try { if (file) { if (file.size > M.MAX_BYTES) throw new Error('Project is too large (maximum 40 MB).'); await replaceProject(JSON.parse(await file.text())); } }
  catch (error) { toast('Could not open this project: ' + error.message); }
  $('project-file').value = '';
});
$('import').addEventListener('click', async () => {
  if (!window.amanita) { $('project-file').click(); return; }
  try { const incoming = await window.amanita.importProject(); if (incoming) await replaceProject(incoming); }
  catch (error) { toast('Could not open this project: ' + error.message); }
});
$('new-project').addEventListener('click', async () => {
  const name = await ask({ title: 'A fresh page', description: 'Name your new comic world. Export this scrapbook first if you want to keep a separate copy; starting a new one replaces the active project.', input: true, value: 'Untitled comic', confirm: 'Start project' });
  if (name === null) return;
  remember(); project = { version: 1, title: name.trim() || 'Untitled comic', notes: [], connections: [] }; resetView(); changed(); fit();
});
$('project-name').addEventListener('click', async () => {
  const name = await ask({ title: 'Name your comic world', input: true, value: project.title });
  if (name !== null) { remember(); project.title = name.trim() || 'Untitled comic'; changed(); }
});
$('help').addEventListener('click', () => ask({ title: 'Make yourself at home', description: 'Drag a note to arrange it. Click it to write or change its importance and certainty.\n\nDrag the background or scroll to explore. Ctrl + scroll to zoom. F fits your notes. N adds a note. Esc closes the detail panel or cancels a connection.\n\nChoose Connect notes, then click the first note and the second. Use Connect to another note in the details to search across categories and stories. You can also drag a card’s thread handle onto another card. Click a thread’s label to rename it.\n\nCtrl+Z undoes a change; Ctrl+Shift+Z redoes it. Drop images or text onto the board. Changes save automatically on this device. Export a project to keep a backup or move it elsewhere.\n\nCharacter sheets, map editing, and dedicated magic systems are planned for later.', confirm: 'Got it', cancel: 'Close' }));
$('add-note').addEventListener('click', () => addNote());
$('story-scope').addEventListener('change', event => setStoryScope(event.target.value));
$('add-story').addEventListener('click', async () => {
  const title = (await ask({ title: 'New story', description: 'Give this story a name. Add existing notes to it from their details.', input: true, confirm: 'Create story' }))?.trim();
  if (!title) return;
  remember();
  const story = { id: M.id(), title };
  (project.stories ||= []).push(story);
  setStoryScope(story.id);
  changed();
});
$('rename-story').addEventListener('click', async () => {
  const story = project.stories.find(story => story.id === storyScope);
  const title = (await ask({ title: 'Rename story', value: story.title, input: true }))?.trim();
  if (!title || title === story.title) return;
  remember(); story.title = title; changed(); renderInspector();
});
$('remove-story').addEventListener('click', async () => {
  const id = storyScope;
  if (!await ask({ title: 'Remove this story view?', description: 'Its notes and beats stay in the project and in any other stories that use them. You can undo this with Ctrl+Z.', confirm: 'Remove view' })) return;
  remember();
  project.stories = project.stories.filter(story => story.id !== id);
  for (const note of project.notes) if (note.storyIds) note.storyIds = note.storyIds.filter(storyId => storyId !== id);
  setStoryScope('');
  changed();
});
$('add-image').addEventListener('click', () => { pendingImageNote = null; $('image-file').click(); });
$('export').addEventListener('click', exportProject);
$('connect').addEventListener('click', startConnect);
$('connect-selected').addEventListener('click', () => openConnectionPicker(selected));
$('close-inspector').addEventListener('click', () => { cancelConnect(); closeInspector(); });
$('fit').addEventListener('click', fit);
$('zoom-in').addEventListener('click', () => zoom(1.15));
$('zoom-out').addEventListener('click', () => zoom(1 / 1.15));
$('search').addEventListener('input', () => { cancelConnect(); renderBoard(); fit(); });
$('certainty-filter').addEventListener('change', () => { cancelConnect(); renderBoard(); fit(); });
for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => setFilter(button.dataset.filter));
window.addEventListener('keydown', event => {
  if ($('dialog').open || $('connection-picker').open) return;
  if (event.target.matches('input, textarea, select')) { if (event.key === 'Escape') { cancelConnect(); closeInspector(); } return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(event.shiftKey); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
  else if (event.key === 'Escape') { cancelConnect(); closeInspector(); }
  else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'n') addNote();
  else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'f') fit();
});
async function init() {
  try {
    const stored = window.amanita ? await window.amanita.load() : JSON.parse(localStorage.getItem(storageKey) || 'null');
    project = stored ? M.validate(stored) : M.seed();
    if (!stored) { void save(); toast('An example world to explore. Start your own with New project.'); }
  } catch (error) {
    project = M.seed(); $('save-status').textContent = 'Could not load saved project';
    toast('Saved project could not be loaded. Your file has not been overwritten. ' + error.message);
  }
  renderBoard(); fit();
}
void init();



