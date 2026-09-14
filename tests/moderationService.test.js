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
  deobfuscateText,
  detectObfuscatedLink,
  isScamBotMessage,
  isGfxBotMessage,
  checkAutoModeration,
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

  describe('De-obfuscation Engine', () => {
    it('should strip zero-width and invisible characters', () => {
      const obfuscated = 'dog\u200Bview\u200Cs.\u200Dcom';
      assert.equal(deobfuscateText(obfuscated), 'dogviews.com');
    });

    it('should normalize fullwidth Unicode characters to standard Latin and symbols', () => {
      const fullwidth = 'ｄｏｇｖｉｅｗｓ ． ｃｏｍ';
      assert.equal(deobfuscateText(fullwidth), 'dogviews.com');
    });

    it('should convert Cyrillic homoglyphs to Latin equivalents', () => {
      // 'о' (\u043e) and 'е' (\u0435) are Cyrillic
      const homoglyph = 'd\u043egvi\u0435ws.\u0441\u043em';
      assert.equal(deobfuscateText(homoglyph), 'dogviews.com');
    });

    it('should decode textual dot substitutions like (dot), [dot], and bullet dots', () => {
      assert.equal(deobfuscateText('topviews(dot)com'), 'topviews.com');
      assert.equal(deobfuscateText('bigfollows [dot] ru'), 'bigfollows.ru');
      assert.equal(deobfuscateText('streampromo dot net'), 'streampromo.net');
      assert.equal(deobfuscateText('viewers•xyz'), 'viewers.xyz');
    });

    it('should collapse single-character spaced runs', () => {
      assert.equal(deobfuscateText('d o g v i e w s . c o m'), 'dogviews.com');
      assert.equal(deobfuscateText('b i g f o l l o w s'), 'bigfollows');
    });
  });

  describe('Obfuscated Link Detection', () => {
    it('should detect disguised domain names with spaced dots and textual dots', () => {
      assert.equal(detectObfuscatedLink('dogviews . com'), true);
      assert.equal(detectObfuscatedLink('topviews(dot)com'), true);
      assert.equal(detectObfuscatedLink('bigfollows [dot] ru'), true);
      assert.equal(detectObfuscatedLink('streampromo dot net'), true);
      assert.equal(detectObfuscatedLink('visit https://twitch.tv/mychannel'), true);
    });

    it('should not flag normal non-link conversational text', () => {
      assert.equal(detectObfuscatedLink('I really love this stream and community!'), false);
      assert.equal(detectObfuscatedLink('version 2.0 release date is soon'), false);
    });
  });

  describe('Scam Bot & Fake Views Protection', () => {
    it('should detect known scam bot networks regardless of obfuscation', () => {
      assert.equal(isScamBotMessage('Wanna become famous? Buy followers, primes and views on dogviews . com'), true);
      assert.equal(isScamBotMessage('Best viewer bot! topviews(dot)com - cheap views, primes, followers'), true);
      assert.equal(isScamBotMessage('b i g f o l l o w s [dot] ru best chatters and primes'), true);
      assert.equal(isScamBotMessage('Get fast views at streampromo . net now!'), true);
    });

    it('should detect viewbot sales pitches even with unfamiliar domain names', () => {
      assert.equal(isScamBotMessage('Want to become famous? Cheap primes and chatters on viewerbotboost(dot)com'), true);
      assert.equal(isScamBotMessage('Buy followers and cheap viewers at instantgrow . xyz'), true);
      assert.equal(isScamBotMessage('Best primes and chatters available now at mychannelboost . site'), true);
    });

    it('should not flag innocent stream chatter', () => {
      assert.equal(isScamBotMessage('I hope this game becomes famous one day!'), false);
      assert.equal(isScamBotMessage('Thanks for the raid everyone! Check out twitch.tv/streamer'), false);
      assert.equal(isScamBotMessage('gg that was an awesome match'), false);
    });
  });

  describe('Unsolicited Graphic Artist Bot Detection', () => {
    it('should detect copy-paste digital artist pitches soliciting Discord commissions', () => {
      const botMsg = 'Hey love the stream! I am a digital artist offering custom emotes, overlays, and sub badges. Add me on discord: artist#1234 for cheap commissions!';
      assert.equal(isGfxBotMessage(botMsg), true);
    });

    it('should not flag normal conversation about art or Discord', () => {
      assert.equal(isGfxBotMessage('I love your custom emotes on this channel!'), false);
      assert.equal(isGfxBotMessage('Join our community discord to play games together!'), false);
    });
  });

  describe('checkAutoModeration Pipeline', () => {
    const channel = {
      id: 'channel123',
      moderation: {
        filterScamBots: true,
        scamAction: 'ban',
        filterGfxBots: true,
        filterLinks: true,
      },
    };

    it('should intercept and moderate a scam bot message', async () => {
      const event = {
        broadcaster_user_id: 'channel123',
        chatter_user_id: 'bot999',
        chatter_user_login: 'scambot42',
        chatter_user_name: 'ScamBot42',
        message_id: 'msg-001',
        message: {
          text: 'Wanna become famous? Buy followers, primes and views on dogviews . com',
          fragments: [],
        },
        badges: [],
      };

      const moderated = await checkAutoModeration(event, channel, 'botWorker');
      assert.equal(moderated, true);
    });

    it('should bypass moderation for privileged users (broadcaster or moderator)', async () => {
      const modEvent = {
        broadcaster_user_id: 'channel123',
        chatter_user_id: 'mod123',
        chatter_user_login: 'headmod',
        message_id: 'msg-002',
        message: {
          text: 'Look at this example scam dogviews . com',
        },
        badges: [{ set_id: 'moderator' }],
      };

      const moderated = await checkAutoModeration(modEvent, channel, 'botWorker');
      assert.equal(moderated, false);
    });

    it('should intercept unsolicited graphic artist bot spam', async () => {
      const gfxEvent = {
        broadcaster_user_id: 'channel123',
        chatter_user_id: 'artistbot1',
        chatter_user_login: 'art_spammer',
        message_id: 'msg-003',
        message: {
          text: 'Hey! I am a digital artist offering custom emotes, overlays and sub badges. Add me on discord: artist#1234 for cheap commissions!',
          fragments: [],
        },
        badges: [],
      };

      const moderated = await checkAutoModeration(gfxEvent, channel, 'botWorker');
      assert.equal(moderated, true);
    });

    it('should block obfuscated links when link filter is active', async () => {
      const linkEvent = {
        broadcaster_user_id: 'channel123',
        chatter_user_id: 'viewer12',
        chatter_user_login: 'sneakyviewer',
        message_id: 'msg-004',
        message: {
          text: 'check out my cool funny website awesomejokes(dot)com guys',
          fragments: [],
        },
        badges: [],
      };

      const moderated = await checkAutoModeration(linkEvent, channel, 'botWorker');
      assert.equal(moderated, true);
    });
  });
});

