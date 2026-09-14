import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt } from '../src/db/crypto.js';

describe('Crypto Utility', () => {
  it('should encrypt and decrypt a string accurately', () => {
    const original = 'oauth:twitch_super_secret_token_12345';
    const encrypted = encrypt(original);

    assert.notEqual(encrypted, original);
    assert.ok(typeof encrypted === 'string');
    assert.ok(encrypted.length > 0);

    const decrypted = decrypt(encrypted);
    assert.equal(decrypted, original);
  });

  it('should return null or falsy when encrypting empty values', () => {
    assert.equal(encrypt(''), null);
    assert.equal(encrypt(null), null);
    assert.equal(encrypt(undefined), null);
  });

  it('should return null or falsy when decrypting empty values', () => {
    assert.equal(decrypt(''), null);
    assert.equal(decrypt(null), null);
    assert.equal(decrypt(undefined), null);
  });

  it('should produce unique ciphertexts for identical plaintexts (unique IV)', () => {
    const text = 'same_plaintext_token';
    const enc1 = encrypt(text);
    const enc2 = encrypt(text);

    assert.notEqual(enc1, enc2, 'Different IVs must yield different ciphertexts');
    assert.equal(decrypt(enc1), text);
    assert.equal(decrypt(enc2), text);
  });
});
