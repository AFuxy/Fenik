import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { flashMiddleware } from '../src/middleware/flash.js';

describe('Cookie-Backed Flash Middleware', () => {
  it('should parse incoming flash cookie and immediately clear it', () => {
    let clearedCookieName = null;
    const req = {
      cookies: {
        flash_message: JSON.stringify({ success: 'Operation completed successfully' }),
      },
    };
    const res = {
      clearCookie: (name) => {
        clearedCookieName = name;
      },
      cookie: () => {},
    };
    let nextCalled = false;

    flashMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.flash.success, 'Operation completed successfully');
    assert.equal(clearedCookieName, 'flash_message');
  });

  it('should provide res.setFlash to write an ephemeral cookie', () => {
    let setCookieName = null;
    let setCookieValue = null;
    let setCookieOptions = null;

    const req = { cookies: {} };
    const res = {
      cookie: (name, val, opts) => {
        setCookieName = name;
        setCookieValue = val;
        setCookieOptions = opts;
      },
      clearCookie: () => {},
    };

    flashMiddleware(req, res, () => {});

    assert.ok(typeof res.setFlash === 'function');
    res.setFlash('error', 'Invalid command trigger');

    assert.equal(setCookieName, 'flash_message');
    const parsed = JSON.parse(setCookieValue);
    assert.equal(parsed.error, 'Invalid command trigger');
    assert.equal(setCookieOptions.httpOnly, true);
    assert.equal(setCookieOptions.path, '/');
  });
});
