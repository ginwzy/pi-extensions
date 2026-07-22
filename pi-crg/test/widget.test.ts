import assert from "node:assert/strict";
import { createInitialState, resolveWidgetMode, updateWidget } from "../src/widget.ts";

delete process.env.PI_CRG_WIDGET;

function makeContext() {
  const calls: unknown[][] = [];
  return {
    calls,
    ctx: {
      hasUI: true,
      ui: {
        setWidget: (...args: unknown[]) => calls.push(args),
      },
    },
  };
}

assert.equal(resolveWidgetMode(undefined), "activity");
assert.equal(resolveWidgetMode("invalid"), "activity");
assert.equal(resolveWidgetMode("always"), "always");
assert.equal(resolveWidgetMode("off"), "off");

{
  const state = createInitialState();
  const { calls, ctx } = makeContext();
  updateWidget(state, ctx as never);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[1], undefined, "activity mode hides the no-graph idle state");
}

{
  const state = { ...createInitialState(), updating: true };
  const { calls, ctx } = makeContext();
  updateWidget(state, ctx as never);
  assert.deepEqual(calls[0]?.[1], ["crg: updating"], "initial builds show activity before the graph exists");
}

{
  const state = { ...createInitialState(), graphReady: true, nodeCount: 42, lastBuild: "ready" };
  const { calls, ctx } = makeContext();
  updateWidget(state, ctx as never);
  assert.equal(calls[0]?.[1], undefined, "activity mode hides the ready state");

  state.updating = true;
  updateWidget(state, ctx as never);
  assert.deepEqual(calls.at(-1)?.[1], ["crg: updating  42 nodes  ready"]);

  state.updating = false;
  state.lastError = "update failed";
  updateWidget(state, ctx as never);
  assert.deepEqual(calls.at(-1)?.[1], ["crg: stale  42 nodes  ready  update failed"]);

  state.lastError = null;
  updateWidget(state, ctx as never);
  assert.equal(calls.at(-1)?.[1], undefined, "successful recovery clears the stale widget");
}

{
  const state = { ...createInitialState(), widgetMode: "always" as const, graphReady: true, nodeCount: 7, lastBuild: "ready" };
  const { calls, ctx } = makeContext();
  updateWidget(state, ctx as never);
  assert.deepEqual(calls[0]?.[1], ["crg: ready  7 nodes  ready"]);
}

{
  const state = { ...createInitialState(), widgetMode: "off" as const, updating: true };
  const { calls, ctx } = makeContext();
  updateWidget(state, ctx as never);
  assert.equal(calls[0]?.[1], undefined, "off mode hides even active updates");
}

console.log("widget tests: ok");
