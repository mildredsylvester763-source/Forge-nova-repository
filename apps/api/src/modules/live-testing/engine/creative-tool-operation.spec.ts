import {
  INITIAL_CREATIVE_STATE,
  applyCreativeOperation,
  creativeEditorCatalog,
} from './creative-tool-operation';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('creative tool operation engine', () => {
  it('pins the per-editor operation vocabularies', () => {
    const catalog = creativeEditorCatalog();
    expect(catalog.manhwa).toEqual([
      'draw',
      'paint',
      'layer-add',
      'layer-merge',
      'layer-hide',
      'undo',
      'redo',
    ]);
    expect(catalog['three-d']).toEqual([
      'object-add',
      'object-move',
      'object-rotate',
      'camera-orbit',
      'undo',
      'redo',
    ]);
    expect(catalog.music).toEqual([
      'note-place',
      'note-drag',
      'clip-trim',
      'instrument-select',
      'undo',
      'redo',
    ]);
  });

  it('pins the initial state and the layer counter law', () => {
    expect(INITIAL_CREATIVE_STATE).toEqual({
      layers: 1,
      objects: 0,
      notes: 0,
      undoDepth: 0,
      redoDepth: 0,
    });
    const add = applyCreativeOperation(null, { editor: 'manhwa', operation: 'layer-add' });
    expect(add.ok).toBe(true);
    expect(add.state).toEqual({
      layers: 2,
      objects: 0,
      notes: 0,
      undoDepth: 1,
      redoDepth: 0,
    });
    const draw = applyCreativeOperation(add.state, { editor: ' manhwa ', operation: ' Draw ' });
    expect(draw.ok).toBe(true);
    expect(draw.state?.undoDepth).toBe(2);
    expect(draw.state?.redoDepth).toBe(0);
    expect(draw.text).toBe('Drawing on the canvas');
  });

  it('pins the object and note counters and the orbit narration', () => {
    let v = applyCreativeOperation(null, { editor: 'three-d', operation: 'object-add' });
    expect(v.state?.objects).toBe(1);
    expect(v.state?.undoDepth).toBe(1);
    v = applyCreativeOperation(null, { editor: 'music', operation: 'note-place' });
    expect(v.state?.notes).toBe(1);
    v = applyCreativeOperation(null, { editor: 'three-d', operation: 'camera-orbit' });
    expect(v.text).toBe('Orbiting the camera');
  });

  it('pins the undo and redo stack law', () => {
    let v = applyCreativeOperation(null, { editor: 'manhwa', operation: 'draw' });
    v = applyCreativeOperation(v.state, { editor: 'manhwa', operation: 'draw' });
    expect(v.state?.undoDepth).toBe(2);
    const undo = applyCreativeOperation(v.state, { editor: 'manhwa', operation: 'undo' });
    expect(undo.ok).toBe(true);
    expect(undo.state?.undoDepth).toBe(1);
    expect(undo.state?.redoDepth).toBe(1);
    expect(undo.text).toBe('Undoing the last edit');
    const redo = applyCreativeOperation(undo.state, { editor: 'manhwa', operation: 'redo' });
    expect(redo.ok).toBe(true);
    expect(redo.state?.undoDepth).toBe(2);
    expect(redo.state?.redoDepth).toBe(0);
    expect(redo.text).toBe('Redoing the last edit');
  });

  it('refuses empty stacks, counters at their limits and unknown inputs by name', () => {
    let v = applyCreativeOperation(null, { editor: 'manhwa', operation: 'undo' });
    expect(v.reason).toBe('creative-undo-empty');
    v = applyCreativeOperation(null, { editor: 'manhwa', operation: 'redo' });
    expect(v.reason).toBe('creative-redo-empty');
    v = applyCreativeOperation(
      { layers: 1, objects: 0, notes: 0, undoDepth: 2, redoDepth: 0 },
      { editor: 'manhwa', operation: 'layer-merge' },
    );
    expect(v.reason).toBe('creative-layer-floor:1');
    v = applyCreativeOperation(
      { layers: 50, objects: 0, notes: 0, undoDepth: 0, redoDepth: 0 },
      { editor: 'manhwa', operation: 'layer-add' },
    );
    expect(v.reason).toBe('creative-layer-limit:50');
    v = applyCreativeOperation(
      { layers: 1, objects: 200, notes: 0, undoDepth: 0, redoDepth: 0 },
      { editor: 'three-d', operation: 'object-add' },
    );
    expect(v.reason).toBe('creative-object-limit:200');
    v = applyCreativeOperation(
      { layers: 1, objects: 0, notes: 500, undoDepth: 0, redoDepth: 0 },
      { editor: 'music', operation: 'note-place' },
    );
    expect(v.reason).toBe('creative-note-limit:500');
    v = applyCreativeOperation(null, { editor: 'videogame', operation: 'draw' });
    expect(v.reason).toBe('creative-editor-unknown:videogame');
    v = applyCreativeOperation(null, { editor: '', operation: 'draw' });
    expect(v.reason).toBe('creative-editor-missing');
    v = applyCreativeOperation(null, { editor: 'manhwa', operation: 'render' });
    expect(v.reason).toBe('creative-operation-unknown:render:manhwa');
    v = applyCreativeOperation(null, { editor: 'manhwa', operation: 'note-place' });
    expect(v.reason).toBe('creative-operation-unknown:note-place:manhwa');
    v = applyCreativeOperation(null, { editor: 'manhwa', operation: '' });
    expect(v.reason).toBe('creative-operation-missing');
  });

  it('survives a 500-case sweep of editors, operations and states', () => {
    const rnd = mulberry32(42);
    const editorPool = ['manhwa', 'three-d', 'music', 'videogame', '', 'Manhwa'];
    const opPool = [
      'draw',
      'paint',
      'layer-add',
      'layer-merge',
      'layer-hide',
      'object-add',
      'object-move',
      'object-rotate',
      'camera-orbit',
      'note-place',
      'note-drag',
      'clip-trim',
      'instrument-select',
      'undo',
      'redo',
      'render',
      '',
    ];
    const layerPool = [1, 2, 50, 49];
    const objPool = [0, 1, 200, 199];
    const notePool = [0, 1, 500, 499];
    const depthPool = [0, 1, 3];
    const editors = ['manhwa', 'three-d', 'music'];
    const catalog = creativeEditorCatalog();
    for (let i = 0; i < 500; i++) {
      const editor = editorPool[Math.floor(rnd() * editorPool.length)];
      const operation = opPool[Math.floor(rnd() * opPool.length)];
      const layers = layerPool[Math.floor(rnd() * layerPool.length)];
      const objects = objPool[Math.floor(rnd() * objPool.length)];
      const notes = notePool[Math.floor(rnd() * notePool.length)];
      const undoDepth = depthPool[Math.floor(rnd() * depthPool.length)];
      const redoDepth = depthPool[Math.floor(rnd() * depthPool.length)];
      const r = applyCreativeOperation(
        { layers, objects, notes, undoDepth, redoDepth },
        { editor, operation },
      );
      const norm = (x: unknown): string =>
        typeof x === 'string' ? x.trim().toLowerCase() : '';
      const e = norm(editor);
      const o = norm(operation);
      let want: string | null = null;
      let wantOk = false;
      if (e.length === 0) {
        want = 'creative-editor-missing';
      } else if (!editors.includes(e)) {
        want = 'creative-editor-unknown:' + e;
      } else if (o.length === 0) {
        want = 'creative-operation-missing';
      } else if (!catalog[e].includes(o)) {
        want = 'creative-operation-unknown:' + o + ':' + e;
      } else if (o === 'undo' && undoDepth === 0) {
        want = 'creative-undo-empty';
      } else if (o === 'redo' && redoDepth === 0) {
        want = 'creative-redo-empty';
      } else if (o === 'layer-add' && layers >= 50) {
        want = 'creative-layer-limit:50';
      } else if (o === 'layer-merge' && layers <= 1) {
        want = 'creative-layer-floor:1';
      } else if (o === 'object-add' && objects >= 200) {
        want = 'creative-object-limit:200';
      } else if (o === 'note-place' && notes >= 500) {
        want = 'creative-note-limit:500';
      } else {
        wantOk = true;
      }
      if (wantOk) {
        expect(r.ok).toBe(true);
        expect(r.state).toBeDefined();
        if (o === 'undo') {
          expect(r.state?.undoDepth).toBe(undoDepth - 1);
          expect(r.state?.redoDepth).toBe(redoDepth + 1);
        } else if (o === 'redo') {
          expect(r.state?.redoDepth).toBe(redoDepth - 1);
          expect(r.state?.undoDepth).toBe(undoDepth + 1);
        } else {
          expect(r.state?.undoDepth).toBe(undoDepth + 1);
          expect(r.state?.redoDepth).toBe(0);
        }
      } else {
        expect(r.ok).toBe(false);
        expect(r.reason).toBe(want);
      }
    }
  });
});
