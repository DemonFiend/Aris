import { describe, it, expect, beforeEach } from 'vitest';
import { ClickReactionController } from './click-reaction';

// Minimal stubs — we only need `getNormalizedBoneNode` to return objects
// with mutable `rotation`. The controller never touches VRM internals
// beyond that.
type StubBone = { rotation: { x: number; y: number; z: number } };

function makeStubVRM() {
  const bones = new Map<string, StubBone>();
  const ensure = (name: string): StubBone => {
    let b = bones.get(name);
    if (!b) {
      b = { rotation: { x: 0, y: 0, z: 0 } };
      bones.set(name, b);
    }
    return b;
  };
  return {
    bones,
    vrm: {
      humanoid: {
        getNormalizedBoneNode: (name: string) => ensure(name),
      },
    } as unknown as Parameters<ClickReactionController['setVRM']>[0],
  };
}

function makeStubControllers() {
  const expressions: string[] = [];
  let gestureStops = 0;
  const expr = {
    setExpression: (e: string) => {
      expressions.push(e);
    },
  } as unknown as Parameters<ClickReactionController['setControllers']>[0];
  const gesture = {
    stop: () => {
      gestureStops += 1;
    },
  } as unknown as Parameters<ClickReactionController['setControllers']>[1];
  return {
    expr,
    gesture,
    expressions,
    gestureStops: () => gestureStops,
  };
}

describe('ClickReactionController', () => {
  let stub: ReturnType<typeof makeStubVRM>;
  let ctrls: ReturnType<typeof makeStubControllers>;
  let ctrl: ClickReactionController;

  beforeEach(() => {
    stub = makeStubVRM();
    ctrls = makeStubControllers();
    ctrl = new ClickReactionController();
    ctrl.setVRM(stub.vrm);
    ctrl.setControllers(ctrls.expr, ctrls.gesture);
  });

  it('starts not playing', () => {
    expect(ctrl.isPlaying()).toBe(false);
  });

  it('trigger() activates a reaction and stops any active gesture', () => {
    ctrl.trigger();
    expect(ctrl.isPlaying()).toBe(true);
    expect(ctrls.gestureStops()).toBe(1);
  });

  it('first click sets surprised expression', () => {
    ctrl.trigger();
    expect(ctrls.expressions).toEqual(['surprised']);
  });

  it('escalates expression on rapid repeat clicks', () => {
    ctrl.trigger(); // 1: surprised
    ctrl.trigger(); // 2: giggle
    ctrl.trigger(); // 3: annoyed
    ctrl.trigger(); // 4: still annoyed
    ctrl.trigger(); // 5: pushback
    expect(ctrls.expressions).toEqual([
      'surprised',
      'happy', // giggle uses 'happy' expression
      'angry', // annoyed
      'angry', // still annoyed
      'angry', // pushback
    ]);
  });

  it('head-zone clicks always play headpat (happy expression, no escalation)', () => {
    ctrl.trigger('head');
    ctrl.trigger('head');
    ctrl.trigger('head');
    expect(ctrls.expressions).toEqual(['happy', 'happy', 'happy']);
  });

  it('head-zone clicks count toward the rolling window for body escalation', () => {
    // Three head clicks then a body click: body should see 4 total clicks
    // and escalate to annoyed (3+ clicks → annoyed).
    ctrl.trigger('head');
    ctrl.trigger('head');
    ctrl.trigger('head');
    ctrl.trigger('body');
    expect(ctrls.expressions[ctrls.expressions.length - 1]).toBe('angry');
  });

  it('reaction ends after duration elapses and restores neutral', () => {
    ctrl.trigger(); // surprised: 0.6s
    // Advance well past the duration in small ticks
    for (let i = 0; i < 10; i++) ctrl.update(0.1);
    expect(ctrl.isPlaying()).toBe(false);
    expect(ctrls.expressions[ctrls.expressions.length - 1]).toBe('neutral');
  });

  it('clicks outside the rolling window reset escalation', () => {
    ctrl.trigger(); // 1: surprised
    // Advance 11 seconds — past CLICK_WINDOW (10s) — via the controller's clock
    for (let i = 0; i < 110; i++) ctrl.update(0.1);
    ctrl.trigger(); // should be surprised again, not giggle
    const last = ctrls.expressions[ctrls.expressions.length - 1];
    expect(last).toBe('surprised');
  });

  it('applies bone modification while playing surprised', () => {
    // Touch the bone first so the stub creates and caches it; the controller
    // must mutate the same reference we hold.
    const head = stub.vrm.humanoid!.getNormalizedBoneNode!('head')!;
    ctrl.trigger(); // surprised
    head.rotation.x = 0;
    ctrl.update(0.3); // mid-reaction (0.6s duration → t=0.5)
    // Surprised tilts head back: head.rotation.x should be negative.
    expect(head.rotation.x).toBeLessThan(0);
  });

  it('does nothing without VRM', () => {
    const bare = new ClickReactionController();
    bare.setControllers(ctrls.expr, ctrls.gesture);
    bare.trigger();
    expect(bare.isPlaying()).toBe(false);
  });
});
