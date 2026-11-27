import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSetting } from '../src/utils/settingsNavigation.js';

const area = { title: 'Area & stores', category: 'Everyday', keywords: 'ZIP city state GPS favorite nearby' };
const account = { title: 'Account & security', category: 'Account', keywords: 'email password login' };
test('search finds another category and handles case and spaces', () => {
  assert.equal(matchesSetting(account, '  PASSWORD ', 'Everyday'), true);
  assert.equal(matchesSetting(area, 'ZIP', 'Help'), true);
  assert.equal(matchesSetting(account, '  ', 'Everyday'), false);
  assert.equal(matchesSetting(area, '', 'Everyday'), true);
});
test('multiple search words must all match; unknown searches do not return unrelated settings', () => {
  assert.equal(matchesSetting(area, 'nearby stores', 'Help'), true);
  assert.equal(matchesSetting(area, 'zip password', 'Help'), false);
  assert.equal(matchesSetting(account, 'zzzznothing', 'Account'), false);
});
