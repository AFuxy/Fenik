import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  grantLinkPermit,
  hasLinkPermit,
  containsLink,
  isExcessiveCaps,
  containsBannedWord,
  countEmotes,
  hasExcessiveEmotes,
  isRepeatedTextSpam,
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

  describe('Emote Counting & Limit Gate', () => {
    it('should count Twitch native emote fragments', () => {
      const event = {
        message: {
          text: 'kappa kappa PogChamp',
          fragments: [
            { type: 'emote', text: 'kappa' },
            { type: 'emote', text: 'kappa' },
            { type: 'emote', text: 'PogChamp' },
          ],
        },
      };
      assert.equal(countEmotes(event), 3);
    });

    it('should count Unicode emojis in message text', () => {
      const event = {
        message: {
          text: 'Hello chat! 🔥 🚀 🎮 🎉 💜',
          fragments: [{ type: 'text', text: 'Hello chat! 🔥 🚀 🎮 🎉 💜' }],
        },
      };
      assert.equal(countEmotes(event), 5);
    });

    it('should count combined Twitch fragments and Unicode emojis', () => {
      const event = {
        message: {
          text: 'Cool! 😀 PogChamp 🔥',
          fragments: [
            { type: 'text', text: 'Cool! 😀 ' },
            { type: 'emote', text: 'PogChamp' },
            { type: 'text', text: ' 🔥' },
          ],
        },
      };
      assert.equal(countEmotes(event), 3); // 1 fragment + 2 unicode emojis
    });

    it('should evaluate hasExcessiveEmotes based on maxEmotes threshold', () => {
      const event = {
        message: {
          text: '😀 😃 😄 😁 😆 😅 🤣',
          fragments: [],
        },
      };
      assert.equal(hasExcessiveEmotes(event, 5), true); // 7 emojis > 5
      assert.equal(hasExcessiveEmotes(event, 10), false); // 7 emojis <= 10
    });
  });

  describe('Repeated Text & Word Spam Detection', () => {
    it('should detect character repetition spam', () => {
      assert.equal(isRepeatedTextSpam('aaaaaaaaaaaaa', 4), true);
      assert.equal(isRepeatedTextSpam('WWWWWWWWWWWW', 4), true);
      assert.equal(isRepeatedTextSpam('hellooooo', 4), false); // 5 'o's, under threshold
    });

    it('should detect consecutive repeated words', () => {
      assert.equal(isRepeatedTextSpam('spam spam spam spam spam', 3), true);
      assert.equal(isRepeatedTextSpam('vote now vote now vote now vote now', 3), true);
      assert.equal(isRepeatedTextSpam('hello hello world', 3), false);
    });

    it('should detect phrase repetition looping over the full message', () => {
      assert.equal(isRepeatedTextSpam('sub now sub now sub now sub now sub now', 3), true);
    });

    it('should allow normal non-repetitive sentences', () => {
      assert.equal(isRepeatedTextSpam('Hey everyone, thanks for tuning in to the broadcast today!'), false);
      assert.equal(isRepeatedTextSpam('gg everyone that was an amazing speedrun attempt'), false);
    });
  });
});

