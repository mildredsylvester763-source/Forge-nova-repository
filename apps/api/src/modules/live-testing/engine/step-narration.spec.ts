import { GOAL_TASK_LIMIT, keywordsOf, narrate, parseGoal } from './step-narration';

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

describe('step narration and goal engine (FORGE TQ-008/012)', () => {
  it('splits plain-language goals into sequential tasks', () => {
    const v = parseGoal('open the shop then add an item to the cart; pay attention to errors');
    expect(v.ok).toBe(true);
    if (!v.ok || !v.tasks) throw new Error('expected ok');
    expect(v.tasks).toHaveLength(3);
    expect(v.tasks[0].id).toBe('task-1');
    expect(v.tasks[1].id).toBe('task-2');
    expect(v.tasks[2].id).toBe('task-3');
    expect(v.tasks[0].text).toBe('open the shop');
    expect(v.tasks[2].text).toBe('pay attention to errors');
    expect(v.tasks[2].keywords).toContain('attention');
  });

  it('dedupes repeated tasks and refuses broken goals by name', () => {
    expect(parseGoal('same thing then same thing').tasks).toHaveLength(1);
    expect(parseGoal('   ')).toEqual({ ok: false, reason: 'goal-empty' });
    expect(parseGoal(';;;')).toEqual({ ok: false, reason: 'goal-empty' });
    expect(parseGoal(5)).toEqual({ ok: false, reason: 'goal-not-a-string' });
    const long = Array.from({ length: 13 }, (_, i) => 'step number ' + i).join(' then ');
    expect(parseGoal(long)).toEqual({ ok: false, reason: 'goal-too-many-tasks:13' });
    expect(GOAL_TASK_LIMIT).toBe(12);
    expect(keywordsOf('The FORGE Nova Cart!')).toEqual(['forge', 'nova', 'cart']);
    expect(keywordsOf('a bc def')).toEqual(['def']);
  });

  it('narrates actions deterministically without ever echoing typed values', () => {
    const t = narrate({ action: 'type', target: 'search box', value: 'hunter2 secret' });
    expect(t).toEqual({ ok: true, text: 'Typing 14 characters into search box' });
    expect(narrate({ action: 'click', target: 'add to cart button' })).toEqual({
      ok: true,
      text: 'Clicking add to cart button',
    });
    expect(narrate({ action: 'scroll', target: 'list', direction: 'up', count: 3 })).toEqual({
      ok: true,
      text: 'Scrolling up 3 time(s) on list',
    });
    expect(narrate({ action: 'navigate' })).toEqual({ ok: true, text: 'Opening the app' });
    expect(narrate({ action: 'swipe', target: 'photo', direction: 'left' })).toEqual({
      ok: true,
      text: 'Swiping left on photo',
    });
    expect(narrate({ action: 'key', key: 'Enter' })).toEqual({ ok: true, text: 'Pressing Enter' });
    expect(narrate({ action: 'back' })).toEqual({ ok: true, text: 'Pressing back' });
  });

  it('refuses unknown actions and missing targets by name', () => {
    expect(narrate({ action: 'dance', target: 'x' })).toEqual({
      ok: false,
      reason: 'narration-unknown-action:dance',
    });
    expect(narrate({ action: 'click' })).toEqual({
      ok: false,
      reason: 'narration-missing-target:click',
    });
    expect(narrate({})).toEqual({ ok: false, reason: 'narration-action-missing' });
  });

  it('500-case sweep: narration never leaks values and goals hold their laws', () => {
    const rand = mulberry32(42);
    const actions = [
      'click', 'tap', 'type', 'scroll', 'drag', 'hover', 'key', 'upload', 'navigate',
      'wait', 'assert', 'swipe', 'long-press', 'pinch', 'multi-touch', 'stylus-pressure',
      'back', 'home', 'rotate', 'install', 'terminate', 'menu', 'window-resize',
      'file-dialog', 'dance',
    ];
    const targets = ['login button', 'cart icon', '', 'search box', '   ', 'form field'];
    const values = ['hello', 'secret-token-value', 'user@mail.io', 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', ''];
    const words = ['checkout', 'flow', 'testing', 'cart', 'page', 'loading', 'user'];
    for (let i = 0; i < 500; i++) {
      const action = actions[Math.floor(rand() * actions.length)];
      const target = targets[Math.floor(rand() * targets.length)];
      const value = values[Math.floor(rand() * values.length)];
      const n = narrate({ action, target, value, direction: 'up', key: 'Enter', count: 2 });
      if (typeof n.text === 'string') {
        expect(n.text.includes('secret-token-value')).toBe(false);
        expect(/^[A-Z]/.test(n.text)).toBe(true);
      }
      if (target.trim().length === 0 && n.ok) {
        expect(n.text).not.toContain('undefined');
      }

      const taskCount = Math.floor(rand() * 14) + 1;
      const parts: string[] = [];
      for (let j = 0; j < taskCount; j++) {
        parts.push(
          words[Math.floor(rand() * words.length)] + ' ' + words[Math.floor(rand() * words.length)],
        );
      }
      const joined = parts.join(rand() < 0.5 ? ' then ' : '; ');
      const gv = parseGoal(joined);
      if (taskCount > GOAL_TASK_LIMIT) {
        expect(gv.ok).toBe(false);
        expect(gv.reason).toContain('goal-too-many-tasks:');
      } else {
        expect(gv.ok).toBe(true);
        if (!gv.ok || !gv.tasks) throw new Error('expected ok');
        expect(gv.tasks.length).toBeLessThanOrEqual(taskCount);
        gv.tasks.forEach((task, idx) => {
          expect(task.id).toBe('task-' + (idx + 1));
          for (const kw of task.keywords) {
            expect(kw.length >= 3).toBe(true);
          }
        });
        const texts = gv.tasks.map((task) => task.text.toLowerCase());
        expect(new Set(texts).size).toBe(texts.length);
      }
    }
  });
});
