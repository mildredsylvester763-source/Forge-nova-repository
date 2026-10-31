import {
  avCatalog,
  avStateTransition,
  checkPlayback,
  checkSync,
} from './av-output';

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

describe('audio video output engine', () => {
  it('pins the codec catalog per platform', () => {
    expect(avCatalog('web')).toEqual({
      platform: 'web',
      video: ['h264', 'vp9', 'av1'],
      audio: ['aac', 'opus', 'mp3'],
    });
    expect(avCatalog('ios')).toEqual({
      platform: 'ios',
      video: ['h264', 'hevc'],
      audio: ['aac', 'opus'],
    });
    expect(avCatalog('desktop').audio).toEqual(['aac', 'opus', 'mp3', 'flac']);
    expect(avCatalog()).toEqual({
      platform: null,
      video: ['h264', 'vp9', 'av1', 'hevc'],
      audio: ['aac', 'opus', 'mp3', 'amr', 'flac'],
    });
    expect(avCatalog('tv')).toEqual({ platform: null, video: [], audio: [] });
  });

  it('pins the playback verdict and normalization', () => {
    let v = checkPlayback({ platform: 'web', kind: 'video', codec: 'h264' });
    expect(v.ok).toBe(true);
    expect(v.plays).toBe(true);
    expect(v.text).toBe('Checking h264 video playback on web');
    v = checkPlayback({ platform: ' IOS', kind: 'Video', codec: ' HEVC ' });
    expect(v.ok).toBe(true);
    expect(v.codec).toBe('hevc');
    expect(v.text).toBe('Checking hevc video playback on ios');
    v = checkPlayback({ platform: 'android', kind: 'audio', codec: 'amr' });
    expect(v.ok).toBe(true);
  });

  it('refuses unsupported codecs, wrong kinds and unknown platforms by name', () => {
    let v = checkPlayback({ platform: 'web', kind: 'video', codec: 'hevc' });
    expect(v.reason).toBe('av-codec-unsupported:hevc:web');
    v = checkPlayback({ platform: 'ios', kind: 'audio', codec: 'mp3' });
    expect(v.reason).toBe('av-codec-unsupported:mp3:ios');
    v = checkPlayback({ platform: 'web', kind: 'audio', codec: 'vp9' });
    expect(v.reason).toBe('av-codec-wrong-kind:vp9');
    v = checkPlayback({ platform: 'web', kind: 'video', codec: 'flac' });
    expect(v.reason).toBe('av-codec-wrong-kind:flac');
    v = checkPlayback({ platform: 'web', kind: 'video', codec: 'theora' });
    expect(v.reason).toBe('av-codec-unknown:theora');
    v = checkPlayback({ platform: 'web', kind: 'video' });
    expect(v.reason).toBe('av-codec-missing');
    v = checkPlayback({ platform: 'web', kind: '', codec: 'h264' });
    expect(v.reason).toBe('av-kind-missing');
    v = checkPlayback({ platform: 'web', kind: 'smell', codec: 'h264' });
    expect(v.reason).toBe('av-kind-unknown:smell');
    v = checkPlayback({ platform: 'tv', kind: 'video', codec: 'h264' });
    expect(v.reason).toBe('av-platform-unknown:tv');
    v = checkPlayback({ platform: '', kind: 'video', codec: 'h264' });
    expect(v.reason).toBe('av-platform-missing');
  });

  it('pins the ITU-R BT.1359-1 sync bands', () => {
    let s = checkSync(0);
    expect([s.sync, s.detectable, s.acceptable]).toEqual(['in-sync', false, true]);
    s = checkSync(45);
    expect(s.sync).toBe('in-sync');
    s = checkSync(-125);
    expect(s.sync).toBe('in-sync');
    s = checkSync(46);
    expect([s.sync, s.detectable, s.acceptable]).toEqual(['drifting', true, true]);
    s = checkSync(-126);
    expect(s.sync).toBe('drifting');
    s = checkSync(90);
    expect(s.acceptable).toBe(true);
    s = checkSync(-185);
    expect(s.acceptable).toBe(true);
    s = checkSync(91);
    expect([s.sync, s.acceptable]).toEqual(['out-of-sync', false]);
    s = checkSync(-186);
    expect(s.sync).toBe('out-of-sync');
    s = checkSync(300);
    expect(s.text).toBe('Measuring audio and video drift of 300ms');
    s = checkSync(undefined);
    expect(s.reason).toBe('av-drift-missing');
    s = checkSync('abc');
    expect(s.reason).toBe('av-drift-not-a-number:abc');
  });

  it('pins the media state machine', () => {
    let m = avStateTransition('idle', 'playing');
    expect(m.ok).toBe(true);
    expect(m.text).toBe('Media moves from idle to playing');
    expect(avStateTransition('playing', 'paused').ok).toBe(true);
    expect(avStateTransition('paused', 'playing').ok).toBe(true);
    expect(avStateTransition('playing', 'ended').ok).toBe(true);
    m = avStateTransition('idle', 'paused');
    expect(m.reason).toBe('av-state-refused:idle:paused');
    m = avStateTransition('idle', 'ended');
    expect(m.reason).toBe('av-state-refused:idle:ended');
    m = avStateTransition('ended', 'playing');
    expect(m.reason).toBe('av-state-refused:ended:playing');
    m = avStateTransition('paused', 'ended');
    expect(m.reason).toBe('av-state-refused:paused:ended');
    m = avStateTransition('idle', 'idle');
    expect(m.reason).toBe('av-state-refused:idle:idle');
    m = avStateTransition('buffering', 'playing');
    expect(m.reason).toBe('av-state-unknown:buffering');
    m = avStateTransition('', 'playing');
    expect(m.reason).toBe('av-state-missing');
  });

  it('survives a 500-case sweep of platforms, kinds and codecs', () => {
    const rnd = mulberry32(42);
    const platPool = ['web', 'android', 'ios', 'desktop', 'tv', '', 'Web'];
    const kindPool = ['audio', 'video', 'smell', '', 'Video'];
    const codecPool = [
      'h264',
      'vp9',
      'av1',
      'hevc',
      'aac',
      'opus',
      'mp3',
      'amr',
      'flac',
      'theora',
      '',
      'H264',
    ];
    const platformList = ['web', 'android', 'ios', 'desktop'];
    const allVideo = ['h264', 'vp9', 'av1', 'hevc'];
    const allAudio = ['aac', 'opus', 'mp3', 'amr', 'flac'];
    const videoCodecs: Record<string, string[]> = {
      web: ['h264', 'vp9', 'av1'],
      android: ['h264', 'hevc'],
      ios: ['h264', 'hevc'],
      desktop: ['h264', 'vp9', 'av1', 'hevc'],
    };
    const audioCodecs: Record<string, string[]> = {
      web: ['aac', 'opus', 'mp3'],
      android: ['aac', 'opus', 'amr'],
      ios: ['aac', 'opus'],
      desktop: ['aac', 'opus', 'mp3', 'flac'],
    };
    for (let i = 0; i < 500; i++) {
      const platform = platPool[Math.floor(rnd() * platPool.length)];
      const kind = kindPool[Math.floor(rnd() * kindPool.length)];
      const codec = codecPool[Math.floor(rnd() * codecPool.length)];
      const r = checkPlayback({ platform, kind, codec });
      const norm = (x: unknown): string =>
        typeof x === 'string' ? x.trim().toLowerCase() : '';
      const p = norm(platform);
      const k = norm(kind);
      const c = norm(codec);
      let want: string | null = null;
      let wantOk = false;
      if (p.length === 0) {
        want = 'av-platform-missing';
      } else if (!platformList.includes(p)) {
        want = 'av-platform-unknown:' + p;
      } else if (k.length === 0) {
        want = 'av-kind-missing';
      } else if (k !== 'audio' && k !== 'video') {
        want = 'av-kind-unknown:' + k;
      } else if (c.length === 0) {
        want = 'av-codec-missing';
      } else {
        const knownVideo = allVideo.includes(c);
        const knownAudio = allAudio.includes(c);
        if (!knownVideo && !knownAudio) {
          want = 'av-codec-unknown:' + c;
        } else if (k === 'video' && !knownVideo) {
          want = 'av-codec-wrong-kind:' + c;
        } else if (k === 'audio' && !knownAudio) {
          want = 'av-codec-wrong-kind:' + c;
        } else {
          const supported =
            k === 'video' ? videoCodecs[p].includes(c) : audioCodecs[p].includes(c);
          if (!supported) {
            want = 'av-codec-unsupported:' + c + ':' + p;
          } else {
            wantOk = true;
          }
        }
      }
      if (wantOk) {
        expect(r.ok).toBe(true);
        expect(r.plays).toBe(true);
      } else {
        expect(r.ok).toBe(false);
        expect(r.reason).toBe(want);
      }
    }
  });

  it('survives a 500-case sweep of drift values', () => {
    const rnd = mulberry32(42);
    const driftPool: unknown[] = [
      -500,
      -186,
      -185,
      -150,
      -126,
      -125,
      -50,
      0,
      20,
      45,
      46,
      60,
      90,
      91,
      200,
      undefined,
      'abc',
    ];
    for (let i = 0; i < 500; i++) {
      const d = driftPool[Math.floor(rnd() * driftPool.length)];
      const r = checkSync(d);
      if (d === undefined || d === null) {
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('av-drift-missing');
      } else {
        const n = Number(d);
        if (!Number.isFinite(n)) {
          expect(r.ok).toBe(false);
          expect(r.reason).toBe('av-drift-not-a-number:' + String(d));
        } else {
          let want = 'in-sync';
          if (n > 45 || n < -125) {
            want = 'drifting';
          }
          if (n > 90 || n < -185) {
            want = 'out-of-sync';
          }
          expect(r.ok).toBe(true);
          expect(r.sync).toBe(want);
        }
      }
    }
  });

  it('survives a 500-case sweep of media state transitions', () => {
    const rnd = mulberry32(42);
    const statePool = ['idle', 'playing', 'paused', 'ended', 'buffering', ''];
    const mediaStates = ['idle', 'playing', 'paused', 'ended'];
    const legal: Record<string, string[]> = {
      idle: ['playing'],
      playing: ['paused', 'ended'],
      paused: ['playing'],
      ended: [],
    };
    for (let i = 0; i < 500; i++) {
      const from = statePool[Math.floor(rnd() * statePool.length)];
      const to = statePool[Math.floor(rnd() * statePool.length)];
      const r = avStateTransition(from, to);
      const norm = (x: unknown): string =>
        typeof x === 'string' ? x.trim().toLowerCase() : '';
      const f = norm(from);
      const t = norm(to);
      let want: string | null = null;
      let wantOk = false;
      if (f.length === 0) {
        want = 'av-state-missing';
      } else if (!mediaStates.includes(f)) {
        want = 'av-state-unknown:' + f;
      } else if (t.length === 0) {
        want = 'av-state-missing';
      } else if (!mediaStates.includes(t)) {
        want = 'av-state-unknown:' + t;
      } else if (!legal[f].includes(t)) {
        want = 'av-state-refused:' + f + ':' + t;
      } else {
        wantOk = true;
      }
      if (wantOk) {
        expect(r.ok).toBe(true);
        expect(r.from).toBe(f);
        expect(r.to).toBe(t);
      } else {
        expect(r.ok).toBe(false);
        expect(r.reason).toBe(want);
      }
    }
  });
});
