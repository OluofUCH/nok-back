import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/index.ts";

test("the Vercel entrypoint exports an Express handler", () => {
  assert.equal(typeof handler, "function");
});
