// Flags: --experimental-loader node:test/mock_loader
'use strict';
require('../common');
const fixtures = require('../common/fixtures');
const assert = require('node:assert');
const { test, mock } = require('node:test');

test('input validation', async (t) => {
  await t.test('throws if specifier is not a string', (t) => {
    assert.throws(() => {
      t.mock.module(5);
    }, { code: 'ERR_INVALID_ARG_TYPE' });
  });

  await t.test('throws if options is not an object', (t) => {
    assert.throws(() => {
      t.mock.module(__filename, null);
    }, { code: 'ERR_INVALID_ARG_TYPE' });
  });

  await t.test('throws if exports and source are both provided', (t) => {
    assert.throws(() => {
      t.mock.module(__filename, {
        source: __filename,
        exports: {},
      });
    }, { code: 'ERR_INVALID_ARG_VALUE' });
  });

  await t.test('throws if source is not a string', (t) => {
    assert.throws(() => {
      t.mock.module(__filename, { source: 5 });
    }, { code: 'ERR_INVALID_ARG_TYPE' });
  });

  await t.test('throws if cache is not a boolean', (t) => {
    assert.throws(() => {
      t.mock.module(__filename, { cache: 5 });
    }, { code: 'ERR_INVALID_ARG_TYPE' });
  });
});

test('CJS mocking with exports option', async (t) => {
  await t.test('does not cache by default', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-cjs.js');
    const original = require(fixture);

    assert.strictEqual(original.string, 'original cjs string');
    assert.strictEqual(original.fn, undefined);

    t.mock.module(fixture, {
      exports: { fn() { return 42; } },
    });
    const mocked = require(fixture);

    assert.notStrictEqual(original, mocked);
    assert.notStrictEqual(mocked, require(fixture));
    assert.strictEqual(mocked.string, undefined);
    assert.strictEqual(mocked.fn(), 42);
    t.mock.reset();
    assert.strictEqual(original, require(fixture));
  });

  await t.test('explicitly enables caching', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-cjs.js');
    const original = require(fixture);

    assert.strictEqual(original.string, 'original cjs string');
    assert.strictEqual(original.fn, undefined);

    t.mock.module(fixture, {
      exports: { fn() { return 42; } },
      cache: true,
    });
    const mocked = require(fixture);

    assert.notStrictEqual(original, mocked);
    assert.strictEqual(mocked, require(fixture));
    assert.strictEqual(mocked.string, undefined);
    assert.strictEqual(mocked.fn(), 42);
    t.mock.reset();
    assert.strictEqual(original, require(fixture));
  });

  await t.test('explicitly disables caching', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-cjs.js');
    const original = require(fixture);

    assert.strictEqual(original.string, 'original cjs string');
    assert.strictEqual(original.fn, undefined);

    t.mock.module(fixture, {
      exports: { fn() { return 42; } },
      cache: false,
    });
    const mocked = require(fixture);

    assert.notStrictEqual(original, mocked);
    assert.notStrictEqual(mocked, require(fixture));
    assert.strictEqual(mocked.string, undefined);
    assert.strictEqual(mocked.fn(), 42);
    t.mock.reset();
    assert.strictEqual(original, require(fixture));
  });

  await t.test('supports non-object exports', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-cjs.js');
    const original = require(fixture);

    assert.strictEqual(original.string, 'original cjs string');
    assert.strictEqual(original.fn, undefined);

    t.mock.module(fixture, {
      exports: 'mock value',
    });
    const mocked = require(fixture);

    assert.notStrictEqual(original, mocked);
    assert.strictEqual(mocked.string, undefined);
    assert.strictEqual(mocked, 'mock value');
    t.mock.reset();
    assert.strictEqual(original, require(fixture));
  });
});

test('CJS mocking with source option', async (t) => {
  await t.test('does not cache by default', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-cjs.js');
    const fixtureMock = fixtures.path('module-mocking', 'basic-cjs-mock.js');
    const original = require(fixture);

    assert.strictEqual(original.string, 'original cjs string');
    assert.strictEqual(original.fn, undefined);

    t.mock.module(fixture, { source: fixtureMock });
    const mocked = require(fixture);

    assert.notStrictEqual(original, mocked);
    assert.notStrictEqual(mocked, require(fixture));
    assert.strictEqual(mocked.string, 'mocked cjs string');
    t.mock.reset();
    assert.strictEqual(original, require(fixture));
  });

  await t.test('explicitly enables caching', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-cjs.js');
    const fixtureMock = fixtures.path('module-mocking', 'basic-cjs-mock.js');
    const original = require(fixture);

    assert.strictEqual(original.string, 'original cjs string');
    assert.strictEqual(original.fn, undefined);

    t.mock.module(fixture, { source: fixtureMock, cache: true });
    const mocked = require(fixture);

    assert.notStrictEqual(original, mocked);
    assert.strictEqual(mocked, require(fixture));
    assert.strictEqual(mocked.string, 'mocked cjs string');
    t.mock.reset();
    assert.strictEqual(original, require(fixture));
  });

  await t.test('explicitly disables caching', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-cjs.js');
    const fixtureMock = fixtures.path('module-mocking', 'basic-cjs-mock.js');
    const original = require(fixture);

    assert.strictEqual(original.string, 'original cjs string');
    assert.strictEqual(original.fn, undefined);

    t.mock.module(fixture, { source: fixtureMock, cache: false });
    const mocked = require(fixture);

    assert.notStrictEqual(original, mocked);
    assert.notStrictEqual(mocked, require(fixture));
    assert.strictEqual(mocked.string, 'mocked cjs string');
    t.mock.reset();
    assert.strictEqual(original, require(fixture));
  });
});

test('ESM mocking with exports option', async (t) => {
  await t.test('does not cache by default', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-esm.mjs');
    const original = await import(fixture);

    assert.strictEqual(original.string, 'original esm string');
    assert.strictEqual(original.fn, undefined);

    t.mock.module(fixture, {
      exports: { fn() { return 42; } },
    });
    const mocked = await import(fixture);

    assert.notStrictEqual(original, mocked);
    assert.notStrictEqual(mocked, await import(fixture));
    assert.strictEqual(mocked.string, undefined);
    assert.strictEqual(mocked.fn(), 42);
    t.mock.reset();
    assert.strictEqual(original, await import(fixture));
  });

  await t.test('explicitly enables caching', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-esm.mjs');
    const original = await import(fixture);

    assert.strictEqual(original.string, 'original esm string');
    assert.strictEqual(original.fn, undefined);

    t.mock.module(fixture, {
      exports: { fn() { return 42; } },
      cache: true,
    });
    const mocked = await import(fixture);

    assert.notStrictEqual(original, mocked);
    assert.strictEqual(mocked, await import(fixture));
    assert.strictEqual(mocked.string, undefined);
    assert.strictEqual(mocked.fn(), 42);
    t.mock.reset();
    assert.strictEqual(original, await import(fixture));
  });

  await t.test('explicitly disables caching', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-esm.mjs');
    const original = await import(fixture);

    assert.strictEqual(original.string, 'original esm string');
    assert.strictEqual(original.fn, undefined);

    t.mock.module(fixture, {
      exports: { fn() { return 42; } },
      cache: false,
    });
    const mocked = await import(fixture);

    assert.notStrictEqual(original, mocked);
    assert.notStrictEqual(mocked, await import(fixture));
    assert.strictEqual(mocked.string, undefined);
    assert.strictEqual(mocked.fn(), 42);
    t.mock.reset();
    assert.strictEqual(original, await import(fixture));
  });

  await t.test('supports non-object exports', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-esm.mjs');
    const original = await import(fixture);

    assert.strictEqual(original.string, 'original esm string');
    assert.strictEqual(original.fn, undefined);

    t.mock.module(fixture, {
      exports: 'mock value',
    });
    const mocked = await import(fixture);

    assert.notStrictEqual(original, mocked);
    assert.strictEqual(mocked.string, undefined);
    assert.strictEqual(mocked.default, 'mock value');
    t.mock.reset();
    assert.strictEqual(original, await import(fixture));
  });
});

test('ESM mocking with source option', async (t) => {
  await t.test('does not cache by default', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-esm.mjs');
    const fixtureMock = fixtures.path('module-mocking', 'basic-esm-mock.mjs');
    const original = await import(fixture);

    assert.strictEqual(original.string, 'original esm string');
    assert.strictEqual(original.fn, undefined);

    t.mock.module(fixture, { source: fixtureMock });
    const mocked = await import(fixture);

    assert.notStrictEqual(original, mocked);
    assert.notStrictEqual(mocked, await import(fixture));
    assert.strictEqual(mocked.string, 'mocked esm string');
    t.mock.reset();
    assert.strictEqual(original, await import(fixture));
  });

  await t.test('explicitly enables caching', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-esm.mjs');
    const fixtureMock = fixtures.path('module-mocking', 'basic-esm-mock.mjs');
    const original = await import(fixture);

    assert.strictEqual(original.string, 'original esm string');
    assert.strictEqual(original.fn, undefined);

    t.mock.module(fixture, { source: fixtureMock, cache: true });
    const mocked = await import(fixture);

    assert.notStrictEqual(original, mocked);
    assert.strictEqual(mocked, await import(fixture));
    assert.strictEqual(mocked.string, 'mocked esm string');
    t.mock.reset();
    assert.strictEqual(original, await import(fixture));
  });

  await t.test('explicitly disables caching', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-esm.mjs');
    const fixtureMock = fixtures.path('module-mocking', 'basic-esm-mock.mjs');
    const original = await import(fixture);

    assert.strictEqual(original.string, 'original esm string');
    assert.strictEqual(original.fn, undefined);

    t.mock.module(fixture, { source: fixtureMock, cache: false });
    const mocked = await import(fixture);

    assert.notStrictEqual(original, mocked);
    assert.notStrictEqual(mocked, await import(fixture));
    assert.strictEqual(mocked.string, 'mocked esm string');
    t.mock.reset();
    assert.strictEqual(original, await import(fixture));
  });
});

test('modules cannot be mocked multiple times at once', async (t) => {
  await t.test('CJS', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-cjs.js');

    t.mock.module(fixture, {
      exports: { fn() { return 42; } },
    });

    assert.throws(() => {
      t.mock.module(fixture, {
        exports: { fn() { return 55; } },
      });
    }, {
      code: 'ERR_INVALID_STATE',
      message: /The module is already mocked/,
    });

    const mocked = require(fixture);

    assert.strictEqual(mocked.fn(), 42);
  });

  await t.test('ESM', async (t) => {
    const fixture = fixtures.path('module-mocking', 'basic-esm.mjs');

    t.mock.module(fixture, {
      exports: { fn() { return 42; } },
    });

    assert.throws(() => {
      t.mock.module(fixture, {
        exports: { fn() { return 55; } },
      });
    }, {
      code: 'ERR_INVALID_STATE',
      message: /The module is already mocked/,
    });

    const mocked = await import(fixture);

    assert.strictEqual(mocked.fn(), 42);
  });
});

test('mocks are automatically restored', async (t) => {
  const cjsFixture = fixtures.path('module-mocking', 'basic-cjs.js');
  const esmFixture = fixtures.path('module-mocking', 'basic-esm.mjs');

  await t.test('CJS', async (t) => {
    t.mock.module(cjsFixture, {
      exports: { fn() { return 42; } },
    });

    const mocked = require(cjsFixture);

    assert.strictEqual(mocked.fn(), 42);
  });

  await t.test('ESM', async (t) => {
    t.mock.module(esmFixture, {
      exports: { fn() { return 43; } },
    });

    const mocked = await import(esmFixture);

    assert.strictEqual(mocked.fn(), 43);
  });

  const cjsMock = require(cjsFixture);
  const esmMock = await import(esmFixture);

  assert.strictEqual(cjsMock.string, 'original cjs string');
  assert.strictEqual(cjsMock.fn, undefined);
  assert.strictEqual(esmMock.string, 'original esm string');
  assert.strictEqual(esmMock.fn, undefined);
});

test('mocks can be restored independently', async (t) => {
  const cjsFixture = fixtures.path('module-mocking', 'basic-cjs.js');
  const esmFixture = fixtures.path('module-mocking', 'basic-esm.mjs');

  const cjsMock = t.mock.module(cjsFixture, {
    exports: { fn() { return 42; } },
  });

  const esmMock = t.mock.module(esmFixture, {
    exports: { fn() { return 43; } },
  });

  let cjsImpl = require(cjsFixture);
  let esmImpl = await import(esmFixture);

  assert.strictEqual(cjsImpl.fn(), 42);
  assert.strictEqual(esmImpl.fn(), 43);

  cjsMock.restore();
  cjsImpl = require(cjsFixture);

  assert.strictEqual(cjsImpl.fn, undefined);
  assert.strictEqual(esmImpl.fn(), 43);

  esmMock.restore();
  esmImpl = await import(esmFixture);

  assert.strictEqual(cjsImpl.fn, undefined);
  assert.strictEqual(esmImpl.fn, undefined);
});

test('busts the ESM mock cache', async (t) => {
  const fixture1 = fixtures.path('module-mocking', 'basic-esm.mjs');
  const fixture2 = fixtures.path('module-mocking', 'basic-esm-mock.mjs');

  // Mocked using the top level MockTracker.
  mock.module(fixture1, {
    exports: { fn() { return 42; } },
    cache: true,
  });

  // Mocked using this test's MockTracker.
  t.mock.module(fixture2, {
    exports: { fn() { return 43; } },
    cache: true,
  });

  const mock1Before = await import(fixture1);
  const mock2Before = await import(fixture2);

  assert.strictEqual(mock1Before, await import(fixture1));
  assert.strictEqual(mock2Before, await import(fixture2));

  mock.module.bustESMCache();

  const mock1After = await import(fixture1);
  const mock2After = await import(fixture2);

  assert.notStrictEqual(mock1Before, mock1After);
  assert.notStrictEqual(mock2Before, mock2After);
  assert.strictEqual(mock1After, await import(fixture1));
  assert.strictEqual(mock2After, await import(fixture2));

  // Reset the top level MockTracker so no other tests are impacted.
  mock.reset();
});
