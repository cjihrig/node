// Flags: --experimental-sqlite
'use strict';
const { spawnPromisified } = require('../common');
const { DatabaseSync, StatementSync } = require('node:sqlite');
const { suite, test } = require('node:test');

suite('accessing the node:sqlite module', () => {
  test('cannot be accessed without the node: scheme', (t) => {
    t.assert.throws(() => {
      require('sqlite');
    }, {
      code: 'MODULE_NOT_FOUND',
      message: /Cannot find module 'sqlite'/,
    });
  });

  test('cannot be accessed without --experimental-sqlite flag', async (t) => {
    const {
      stdout,
      stderr,
      code,
      signal,
    } = await spawnPromisified(process.execPath, [
      '-e',
      'require("node:sqlite")',
    ]);

    t.assert.strictEqual(stdout, '');
    t.assert.match(stderr, /No such built-in module: node:sqlite/);
    t.assert.notStrictEqual(code, 0);
    t.assert.strictEqual(signal, null);
  });
});
