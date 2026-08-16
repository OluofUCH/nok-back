import assert from "node:assert/strict";
import test from "node:test";

test("the Express app still initializes in production without explicit CORS origins", async () => {
  const previousEnv = { ...process.env };
  process.env.NODE_ENV = "production";
  delete process.env.FRONTEND_URL;
  delete process.env.CORS_ORIGINS;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_BRANCH_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;

  try {
    const { default: app } = await import("../app.ts");
    assert.equal(typeof app, "function");
  } finally {
    process.env = previousEnv as NodeJS.ProcessEnv;
  }
});
