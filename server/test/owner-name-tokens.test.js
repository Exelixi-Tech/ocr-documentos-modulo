'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { looksLikeSerialToken, stripSerialTokens } = require('../src/services/ownerNameTokens');

test('serial NIV del carnet no pasa como apellido (caso real 3-nov)', () => {
  assert.equal(looksLikeSerialToken('8211MBCA6SD245116'), true);
  assert.equal(stripSerialTokens('8211MBCA6SD245116'), '');
  assert.equal(stripSerialTokens('PEREZ 8211MBCA6SD245116'), 'PEREZ');
});

test('tokens con dígitos o >= 10 alfanuméricos se descartan; nombres normales se conservan', () => {
  assert.equal(looksLikeSerialToken('ABCDEFGHIJ'), true);
  assert.equal(looksLikeSerialToken('GOMEZ'), false);
  assert.equal(looksLikeSerialToken('MARÍA'), false);
  assert.equal(stripSerialTokens('MARIA DE LOS ANGELES GOMEZ'), 'MARIA DE LOS ANGELES GOMEZ');
  assert.equal(stripSerialTokens('JUAN A1B2 PEREZ'), 'JUAN PEREZ');
});
