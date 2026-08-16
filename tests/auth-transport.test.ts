import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { csrfProtection } from "../middleware/csrf.ts";
import { CSRF_COOKIE_NAME, readSessionToken } from "../utils/session.ts";

type Outcome = { error?: any; passed: boolean };

function runCsrf(headers: Record<string, string>, method = "POST", path = "/api/auth/login") {
  const request = { method, path, headers } as unknown as Request;
  const outcome: Outcome = { passed: false };
  const next = ((error?: any) => {
    if (error) outcome.error = error;
    else outcome.passed = true;
  }) as NextFunction;
  csrfProtection(request, {} as Response, next);
  return outcome;
}

const withBearerAuth = (enabled: boolean, run: () => void) => {
  const previous = process.env.ALLOW_BEARER_AUTH;
  process.env.ALLOW_BEARER_AUTH = enabled ? "true" : "false";
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.ALLOW_BEARER_AUTH;
    else process.env.ALLOW_BEARER_AUTH = previous;
  }
};

test("a write with no CSRF cookie is allowed through, because Safari cannot store one cross-site", () => {
  // The Origin allowlist in app.ts carries the CSRF protection for this request.
  const outcome = runCsrf({ "x-csrf-token": "header-only-token" });
  assert.equal(outcome.passed, true);
  assert.equal(outcome.error, undefined);
});

test("a write is still rejected when a CSRF cookie exists but the header does not match", () => {
  const outcome = runCsrf({
    cookie: `${CSRF_COOKIE_NAME}=cookie-value-aaaaaaaaaaaa`,
    "x-csrf-token": "different-value-bbbbbbbb",
  });
  assert.equal(outcome.passed, false);
  assert.equal(outcome.error?.statusCode, 403);
  assert.equal(outcome.error?.details, "CSRF_VALIDATION_FAILED");
});

test("a write is rejected when a CSRF cookie exists and no header accompanies it", () => {
  const outcome = runCsrf({ cookie: `${CSRF_COOKIE_NAME}=cookie-value-aaaaaaaaaaaa` });
  assert.equal(outcome.passed, false);
  assert.equal(outcome.error?.statusCode, 403);
});

test("a write passes when the CSRF cookie and header agree", () => {
  const outcome = runCsrf({
    cookie: `${CSRF_COOKIE_NAME}=matching-token-value`,
    "x-csrf-token": "matching-token-value",
  });
  assert.equal(outcome.passed, true);
});

test("a bearer token skips the double submit, since a cross-site page cannot set that header", () => {
  withBearerAuth(true, () => {
    const outcome = runCsrf({
      authorization: "Bearer some.signed.jwt",
      cookie: `${CSRF_COOKIE_NAME}=cookie-value-aaaaaaaaaaaa`,
    });
    assert.equal(outcome.passed, true);
  });
});

test("the double submit is still enforced for a bearer request when bearer auth is disabled", () => {
  withBearerAuth(false, () => {
    const outcome = runCsrf({
      authorization: "Bearer some.signed.jwt",
      cookie: `${CSRF_COOKIE_NAME}=cookie-value-aaaaaaaaaaaa`,
      "x-csrf-token": "mismatched-header-value",
    });
    assert.equal(outcome.passed, false);
    assert.equal(outcome.error?.statusCode, 403);
  });
});

test("reads are never subject to the CSRF check", () => {
  assert.equal(runCsrf({}, "GET", "/api/products").passed, true);
});

test("a bearer token takes precedence over a stale session cookie", () => {
  withBearerAuth(true, () => {
    const request = {
      headers: {
        authorization: "Bearer fresh.bearer.token",
        cookie: "nokere_session=stale.cookie.token",
      },
    } as unknown as Request;
    assert.equal(readSessionToken(request), "fresh.bearer.token");
  });
});

test("the session cookie is still read when no bearer token is supplied", () => {
  const request = {
    headers: { cookie: "nokere_session=cookie.only.token" },
  } as unknown as Request;
  assert.equal(readSessionToken(request), "cookie.only.token");
});

test("bearer tokens are ignored once ALLOW_BEARER_AUTH is set to false", () => {
  withBearerAuth(false, () => {
    const request = {
      headers: { authorization: "Bearer rejected.bearer.token" },
    } as unknown as Request;
    assert.equal(readSessionToken(request), "");
  });
});
