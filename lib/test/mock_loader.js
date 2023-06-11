'use strict';
const {
  ArrayIsArray,
  globalThis,
  SafeMap,
  StringPrototypeSplit,
} = primordials;
const {
  Atomics: {
    notify: AtomicsNotify,
    store: AtomicsStore,
  },
} = globalThis;
const { readFile } = require('fs/promises');
const { esmLoader } = require('internal/process/esm_loader');
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

// TODO(cjihrig): The mocks need to be thread aware. This matches the behavior
// of CJS, which is per thread. Also, the exports option is evaluated on the
// thread that creates the mock.
const mocks = new SafeMap();
let globalVersion = 0;

// TODO(cjihrig): If this file needs to be public, make sure it follows all of
// the rules for adding a new public file (requires 'node:', etc.). Ideally,
// it won't need to be public if register() can handle an internal loader.

function globalPreload(context) {
  context.port.on('message', ({ type, payload }) => {
    if (type === 'node:test:register') {
      const baseURL = StringPrototypeSplit(payload.resolvedURL, '?')[0];
      const mock = mocks.get(baseURL);

      if (mock?.active) {
        sendAck(payload.ack, kMockExists);
        return;
      }

      const localVersion = mock?.localVersion ?? 0;

      mocks.set(baseURL, {
        __proto__: null,
        url: baseURL,
        mockedURL: payload.mockedURL,
        exports: payload.exports,
        cache: payload.cache,
        active: true,
        localVersion,
      });
      sendAck(payload.ack);
    } else if (type === 'node:test:unregister') {
      const baseURL = StringPrototypeSplit(payload.resolvedURL, '?')[0];
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

  // TODO(cjihrig): getBuiltin() does not work with node:test. It would be nice
  // to attach this to the node:test module instead of globalThis.
  return 'globalThis.$__nodeTestLoaderPort = port;';
}

async function resolve(specifier, context, nextResolve) {
  if (isAbsolute(specifier)) {
    specifier = pathToFileURL(specifier).href;
  }

  const resolved = esmLoader.resolve(specifier, context.parentURL, null);
  const mock = mocks.get(resolved.url);

  if (mock?.active !== true) {
    return nextResolve(specifier, context);
  }

  const url = new URL(resolved.url);

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
  const baseURL = StringPrototypeSplit(url, '?')[0];

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
  const { exports: mockExports, mockedURL, url } = mockConfig;

  if (mockedURL) {
    // Create mock implementation from the contents of a file.
    // TODO(cjihrig): Handle the case where the mock file tries to import the
    // file that it is mocking.
    return readFile(new URL(mockedURL), 'utf8');
  }

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

module.exports = { globalPreload, load, resolve };
