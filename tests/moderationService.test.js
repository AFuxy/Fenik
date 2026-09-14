import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  grantLinkPermit,
  hasLinkPermit,
  containsLink,
  isExcessiveCaps,
  containsBannedWord,
} from '../src/services/moderationService.js';

describe('Auto-Moderation Service', () => {
  describe('Link Permits', () => {
    it('should grant and recognize link permits for 60 seconds', () => {
      assert.equal(hasLinkPermit('ch100', 'alice'), false);

      grantLinkPermit('ch100', 'Alice');
      assert.equal(hasLinkPermit('ch100', 'alice'), true);
      assert.equal(hasLinkPermit('ch100', 'ALICE'), true);
      assert.equal(hasLinkPermit('ch999', 'alice'), false); // different channel
    });
  });

  describe('Link Detection', () => {
    it('should detect URLs with various protocols and TLDs', () => {
      assert.equal(containsLink('check this https://youtube.com/watch'), true);
      assert.equal(containsLink('go to http://twitch.tv'), true);
      assert.equal(containsLink('visit google.com/test today'), true);
      assert.equal(containsLink('discord.gg/mycoolserver'), true);
      assert.equal(containsLink('just chatting about life'), false);
      assert.equal(containsLink('this is version 1.0 of the software'), false);
    });
  });

  describe('Caps Spam Detection', () => {
    it('should detect excessive caps (>70% uppercase with at least 12 characters)', () => {
      assert.equal(isExcessiveCaps('HELLO EVERYONE HOW ARE YOU DOING'), true);
      assert.equal(isExcessiveCaps('OMG LOL HAHAAAAAA'), true);
      assert.equal(isExcessiveCaps('Hello everyone how are you doing'), false);
      // Short messages should not trigger even if all caps
      assert.equal(isExcessiveCaps('LOL HYPE GG'), false);
    });
  });

  describe('Banned Words Detection', () => {
    it('should detect blacklisted words and phrases case-insensitively', () => {
      const bannedList = ['badword', 'free followers', 'scam'];

      assert.equal(containsBannedWord('You should buy badword now', bannedList), true);
      assert.equal(containsBannedWord('Get FREE FOLLOWERS here', bannedList), true);
      assert.equal(containsBannedWord('This is a totally safe and legit stream', bannedList), false);
      assert.equal(containsBannedWord('Clean message', []), false);
    });
  });
});
