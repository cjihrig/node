'use strict';
const {
  ArrayIsArray,
  SafeMap,
  StringPrototypeSplit,
  globalThis,
} = primordials;
const {
  Atomics: {
    notify: AtomicsNotify,
    store: AtomicsStore,
  },
} = globalThis;
const {
  kMockSuccess,
  kMockExists,
  kMockUnknownMessage,
} = require('internal/test_runner/mock/mock');
const {
  pathToFileURL,
  URL,
} = require('internal/url');
const { isBuiltin } = require('module');
const { isAbsolute } = require('path');

// TODO(cjihrig): The mocks need to be thread aware because the exports are
// evaluated on the thread that creates the mock. Before marking this API as
// stable, one of the following issues needs to be implemented:
// https://github.com/nodejs/node/issues/49472
// or https://github.com/nodejs/node/issues/52219
const mocks = new SafeMap();
let globalVersion = 0;

// TODO(cjihrig): This file should not be exposed publicly, but register() does
// not handle internal loaders. Before marking this API as stable, one of the
// following issues needs to be implemented:
// https://github.com/nodejs/node/issues/49473
// or https://github.com/nodejs/node/issues/52219

async function initialize(data) {
  data?.port.on('message', ({ type, payload }) => {
    if (type === 'node:test:register') {
      const baseURL = getBaseUrl(payload.resolvedURL);
      const mock = mocks.get(baseURL);

      if (mock?.active) {
        sendAck(payload.ack, kMockExists);
        return;
      }

      const localVersion = mock?.localVersion ?? 0;

      mocks.set(baseURL, {
        __proto__: null,
        url: baseURL,
        exports: payload.exports,
        cache: payload.cache,
        active: true,
        localVersion,
      });
      sendAck(payload.ack);
    } else if (type === 'node:test:unregister') {
      const baseURL = getBaseUrl(payload.resolvedURL);
      const mock = mocks.get(baseURL);

      if (mock !== undefined) {
        mock.active = false;
        mock.localVersion++;
      }

      sendAck(payload.ack);
    } else if (type === 'node:test:cachebust') {
      globalVersion++;
      sendAck(payload.ack);
    } else {
      sendAck(payload.ack, kMockUnknownMessage);
    }
  });
}

async function resolve(specifier, context, nextResolve) {
  if (isAbsolute(specifier)) {
    specifier = pathToFileURL(specifier).href;
  }

  const mock = mocks.get(specifier);

  if (mock?.active !== true) {
    return nextResolve(specifier, context);
  }

  const url = new URL(specifier);

  if (url.protocol !== 'file:') {
    return nextResolve(specifier, context);
  }

  url.searchParams.set('node-test', `${globalVersion}-${mock.localVersion}`);

  if (!mock.cache) {
    // With ESM, we can't remove modules from the cache. Bump the module's
    // version instead so that the next import will be uncached.
    mock.localVersion++;
  }

  return nextResolve(url.toString(), context);
}

async function load(url, context, nextLoad) {
  const baseURL = getBaseUrl(url);

  if (isBuiltin(baseURL)) {
    return nextLoad(url);
  }

  const mockConfig = mocks.get(baseURL);

  if (mockConfig?.active !== true) {
    return nextLoad(url);
  }

  return {
    __proto__: null,
    format: context.format,
    shortCircuit: true,
    source: await createSourceFromMock(mockConfig),
  };
}

async function createSourceFromMock(mockConfig) {
  const { exports: mockExports, url } = mockConfig;

  // Create mock implementation from provided exports.
  let source = `
    import $__test from 'node:test';

    // Use has() here since it's possible to have undefined exports.
    if (!$__test.mock._esmMockExports.has('${url}')) {
      throw new Error('mock exports not found for "${url}"');
    }

    const $__exports = $__test.mock._esmMockExports.get('${url}');
  `;

  if (ArrayIsArray(mockExports)) {
    for (let i = 0; i < mockExports.length; ++i) {
      const name = mockExports[i];

      source += `export let ${name} = $__exports['${name}'];\n`;
    }
  } else {
    source += 'export default $__exports;\n';
  }

  // TODO(cjihrig): Support default export.

  return source;
}

function sendAck(buf, status = kMockSuccess) {
  AtomicsStore(buf, 0, status);
  AtomicsNotify(buf, 0);
}

function getBaseUrl(url) {
  return StringPrototypeSplit(url, '?')[0];
}

module.exports = { initialize, load, resolve };
