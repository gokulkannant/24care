import assert from "node:assert/strict";
import test from "node:test";
import { GET as startGoogleAuth } from "../app/api/auth/google/route";
import { hashRefreshToken } from "../lib/custom-auth";

test("Google auth fails closed when application credentials are missing", async () => {
  const previous = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  try {
    const response = await startGoogleAuth(new Request("https://24care.busundo.org/api/auth/google"));
    assert.equal(response.status, 503);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previous;
  }
});

test("refresh token hashes are deterministic and one-way", () => {
  const token = "refresh-token-example";
  assert.equal(hashRefreshToken(token), hashRefreshToken(token));
  assert.notEqual(hashRefreshToken(token), token);
  assert.notEqual(hashRefreshToken(token), hashRefreshToken(`${token}-changed`));
});
