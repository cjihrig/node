'use strict';
const {
  ArrayPrototypePush,
  ArrayPrototypeSlice,
  Error,
  FunctionPrototypeBind,
  FunctionPrototypeCall,
  globalThis,
  Int32Array,
  ObjectDefineProperty,
  ObjectGetOwnPropertyDescriptor,
  ObjectGetPrototypeOf,
  ObjectKeys,
  Proxy,
  ReflectApply,
  ReflectConstruct,
  ReflectGet,
  SafeMap,
  StringPrototypeStartsWith,
} = primordials;
const {
  Atomics: {
    store: AtomicsStore,
    wait: AtomicsWait,
  },
  SharedArrayBuffer,
} = globalThis;
const {
  codes: {
    ERR_INVALID_ARG_TYPE,
    ERR_INVALID_ARG_VALUE,
    ERR_INVALID_STATE,
  },
} = require('internal/errors');
const esm = require('internal/process/esm_loader');
const { fileURLToPath, toPathIfFileURL } = require('internal/url');
const {
  emitExperimentalWarning,
  getStructuredStack,
  kEmptyObject,
} = require('internal/util');
const {
  validateBoolean,
  validateFunction,
  validateInteger,
  validateObject,
  validateString,
} = require('internal/validators');
const { MockTimers } = require('internal/test_runner/mock/mock_timers');
const { notStrictEqual } = require('assert');
const { isBuiltin, Module } = require('module');
const { dirname } = require('path');
const { _load, _nodeModulePaths, _resolveFilename } = Module;
function kDefaultFunction() {}
const kMockSuccess = 1;
const kMockExists = 2;
const kMockUnknownMessage = 3;
const kWaitTimeout = 5_000;
let sharedModuleState;

class MockFunctionContext {
  #calls;
  #mocks;
  #implementation;
  #restore;
  #times;

  constructor(implementation, restore, times) {
    this.#calls = [];
    this.#mocks = new SafeMap();
    this.#implementation = implementation;
    this.#restore = restore;
    this.#times = times;
  }

  get calls() {
    return ArrayPrototypeSlice(this.#calls, 0);
  }

  callCount() {
    return this.#calls.length;
  }

  mockImplementation(implementation) {
    validateFunction(implementation, 'implementation');
    this.#implementation = implementation;
  }

  mockImplementationOnce(implementation, onCall) {
    validateFunction(implementation, 'implementation');
    const nextCall = this.#calls.length;
    const call = onCall ?? nextCall;
    validateInteger(call, 'onCall', nextCall);
    this.#mocks.set(call, implementation);
  }

  restore() {
    const { descriptor, object, original, methodName } = this.#restore;

    if (typeof methodName === 'string') {
      // This is an object method spy.
      ObjectDefineProperty(object, methodName, descriptor);
    } else {
      // This is a bare function spy. There isn't much to do here but make
      // the mock call the original function.
      this.#implementation = original;
    }
  }

  resetCalls() {
    this.#calls = [];
  }

  trackCall(call) {
    ArrayPrototypePush(this.#calls, call);
  }

  nextImpl() {
    const nextCall = this.#calls.length;
    const mock = this.#mocks.get(nextCall);
    const impl = mock ?? this.#implementation;

    if (nextCall + 1 === this.#times) {
      this.restore();
    }

    this.#mocks.delete(nextCall);
    return impl;
  }
}

const {
  nextImpl,
  restore: restoreFn,
  trackCall,
} = MockFunctionContext.prototype;
delete MockFunctionContext.prototype.trackCall;
delete MockFunctionContext.prototype.nextImpl;

class MockModuleContext {
  #restore;
  #sharedState;

  constructor({
    cache, caller, hasExports, mockExports, sharedState, source, specifier,
  }) {
    this.#sharedState = sharedState;

    const { format, url } = esm.esmLoader.resolve(specifier, caller, null);
    let mockedURL;

    if (source !== undefined) {
      mockedURL = esm.esmLoader.resolve(source, caller, null).url;
    }

    if (format === 'commonjs' || format === 'builtin') {
      const resolved = format === 'commonjs' ? fileURLToPath(url) : url;

      if (this.#sharedState.cjsMocks.has(resolved)) {
        throw new ERR_INVALID_STATE(
          `Cannot mock '${specifier}.' The module is already mocked.`,
        );
      }

      this.#restore = {
        __proto__: null,
        format,
        path: resolved,
        cached: resolved in Module._cache,
        value: Module._cache[resolved],
      };

      delete Module._cache[resolved];
      this.#setupCjsMocking();
      this.#sharedState.cjsMocks.set(resolved, {
        __proto__: null,
        source,
        hasExports,
        exports: mockExports,
        cache,
        mockPath: mockedURL ? fileURLToPath(mockedURL) : undefined,
        parent: toPathIfFileURL(caller),
      });
    } else if (format === 'module') {
      const ack = new Int32Array(new SharedArrayBuffer(4));
      let exportNames;

      if (hasExports &&
          (mockExports !== null && typeof mockExports === 'object')) {
        exportNames = ObjectKeys(mockExports);
      }

      this.#sharedState.loaderPort.postMessage({
        __proto__: null,
        type: 'node:test:register',
        payload: {
          __proto__: null,
          source,
          cache,
          resolvedURL: url,
          mockedURL,
          exports: exportNames,
          ack,
        },
      });
      waitForAck(ack);

      if (ack[0] === kMockExists) {
        throw new ERR_INVALID_STATE(
          `Cannot mock '${specifier}.' The module is already mocked.`,
        );
      }

      if (hasExports) {
        this.#sharedState.esmMockExports.set(url, mockExports);
      }

      this.#restore = {
        __proto__: null,
        format,
        resolvedURL: url,
        ack,
      };
    }
  }

  restore() {
    if (this.#restore === undefined) {
      return;
    }

    if (this.#restore.format === 'commonjs') {
      if (this.#restore.cached) {
        Module._cache[this.#restore.path] = this.#restore.value;
      }

      this.#sharedState.cjsMocks.delete(this.#restore.path);
    } else if (this.#restore.format === 'module') {
      const ack = this.#restore.ack;

      AtomicsStore(ack, 0, 0);
      this.#sharedState.loaderPort.postMessage({
        __proto__: null,
        type: 'node:test:unregister',
        payload: {
          __proto__: null,
          resolvedURL: this.#restore.resolvedURL,
          ack,
        },
      });
      waitForAck(ack);
    }

    this.#restore = undefined;
  }

  #setupCjsMocking() {
    if (Module._load === this.#sharedState.cjsMockModuleLoad) {
      return;
    }

    Module._load = this.#sharedState.cjsMockModuleLoad;
  }
}

const { restore: restoreModule } = MockModuleContext.prototype;

class MockTracker {
  #mocks = [];
  #timers;

  get timers() {
    this.#timers ??= new MockTimers();
    return this.#timers;
  }

  fn(
    original = function() {},
    implementation = original,
    options = kEmptyObject,
  ) {
    if (original !== null && typeof original === 'object') {
      options = original;
      original = function() {};
      implementation = original;
    } else if (implementation !== null && typeof implementation === 'object') {
      options = implementation;
      implementation = original;
    }

    validateFunction(original, 'original');
    validateFunction(implementation, 'implementation');
    validateObject(options, 'options');
    const { times = Infinity } = options;
    validateTimes(times, 'options.times');
    const ctx = new MockFunctionContext(implementation, { original }, times);
    return this.#setupMock(ctx, original);
  }

  method(
    objectOrFunction,
    methodName,
    implementation = kDefaultFunction,
    options = kEmptyObject,
  ) {
    validateStringOrSymbol(methodName, 'methodName');
    if (typeof objectOrFunction !== 'function') {
      validateObject(objectOrFunction, 'object');
    }

    if (implementation !== null && typeof implementation === 'object') {
      options = implementation;
      implementation = kDefaultFunction;
    }

    validateFunction(implementation, 'implementation');
    validateObject(options, 'options');

    const {
      getter = false,
      setter = false,
      times = Infinity,
    } = options;

    validateBoolean(getter, 'options.getter');
    validateBoolean(setter, 'options.setter');
    validateTimes(times, 'options.times');

    if (setter && getter) {
      throw new ERR_INVALID_ARG_VALUE(
        'options.setter', setter, "cannot be used with 'options.getter'",
      );
    }
    const descriptor = findMethodOnPrototypeChain(objectOrFunction, methodName);

    let original;

    if (getter) {
      original = descriptor?.get;
    } else if (setter) {
      original = descriptor?.set;
    } else {
      original = descriptor?.value;
    }

    if (typeof original !== 'function') {
      throw new ERR_INVALID_ARG_VALUE(
        'methodName', original, 'must be a method',
      );
    }

    const restore = { descriptor, object: objectOrFunction, methodName };
    const impl = implementation === kDefaultFunction ?
      original : implementation;
    const ctx = new MockFunctionContext(impl, restore, times);
    const mock = this.#setupMock(ctx, original);
    const mockDescriptor = {
      __proto__: null,
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
    };

    if (getter) {
      mockDescriptor.get = mock;
      mockDescriptor.set = descriptor.set;
    } else if (setter) {
      mockDescriptor.get = descriptor.get;
      mockDescriptor.set = mock;
    } else {
      mockDescriptor.writable = descriptor.writable;
      mockDescriptor.value = mock;
    }

    ObjectDefineProperty(objectOrFunction, methodName, mockDescriptor);

    return mock;
  }

  getter(
    object,
    methodName,
    implementation = kDefaultFunction,
    options = kEmptyObject,
  ) {
    if (implementation !== null && typeof implementation === 'object') {
      options = implementation;
      implementation = kDefaultFunction;
    } else {
      validateObject(options, 'options');
    }

    const { getter = true } = options;

    if (getter === false) {
      throw new ERR_INVALID_ARG_VALUE(
        'options.getter', getter, 'cannot be false',
      );
    }

    return this.method(object, methodName, implementation, {
      ...options,
      getter,
    });
  }

  setter(
    object,
    methodName,
    implementation = kDefaultFunction,
    options = kEmptyObject,
  ) {
    if (implementation !== null && typeof implementation === 'object') {
      options = implementation;
      implementation = kDefaultFunction;
    } else {
      validateObject(options, 'options');
    }

    const { setter = true } = options;

    if (setter === false) {
      throw new ERR_INVALID_ARG_VALUE(
        'options.setter', setter, 'cannot be false',
      );
    }

    return this.method(object, methodName, implementation, {
      ...options,
      setter,
    });
  }

  module(specifier, options = kEmptyObject) {
    emitExperimentalWarning('Module mocking');
    validateString(specifier, 'specifier');
    validateObject(options, 'options');

    const {
      cache = false,
      exports: mockExports,
      source,
    } = options;
    const hasExports = 'exports' in options;

    if (hasExports && 'source' in options) {
      throw new ERR_INVALID_ARG_VALUE(
        'options.source',
        source,
        'options.source and options.exports cannot be used together',
      );
    } else if (source !== undefined) {
      validateString(source, 'options.source');
    }

    validateBoolean(cache, 'options.cache');

    // Get the file that called this function. We need four stack frames:
    // vm context -> getStructuredStack() -> this function -> actual caller.
    const callSite = getStructuredStack()[3];
    const caller = callSite.getFileName();
    const ctx = new MockModuleContext({
      __proto__: null,
      cache,
      caller,
      hasExports,
      mockExports,
      sharedState: setupSharedModuleState(),
      source,
      specifier,
    });

    ArrayPrototypePush(this.#mocks, {
      __proto__: null,
      ctx,
      restore: restoreModule,
    });
    return ctx;
  }

  reset() {
    this.restoreAll();
    this.#timers?.reset();
    this.#mocks = [];
  }

  restoreAll() {
    for (let i = 0; i < this.#mocks.length; i++) {
      const { ctx, restore } = this.#mocks[i];

      FunctionPrototypeCall(restore, ctx);
    }
  }

  #setupMock(ctx, fnToMatch) {
    const mock = new Proxy(fnToMatch, {
      __proto__: null,
      apply(_fn, thisArg, argList) {
        const fn = FunctionPrototypeCall(nextImpl, ctx);
        let result;
        let error;

        try {
          result = ReflectApply(fn, thisArg, argList);
        } catch (err) {
          error = err;
          throw err;
        } finally {
          FunctionPrototypeCall(trackCall, ctx, {
            arguments: argList,
            error,
            result,
            // eslint-disable-next-line no-restricted-syntax
            stack: new Error(),
            target: undefined,
            this: thisArg,
          });
        }

        return result;
      },
      construct(target, argList, newTarget) {
        const realTarget = FunctionPrototypeCall(nextImpl, ctx);
        let result;
        let error;

        try {
          result = ReflectConstruct(realTarget, argList, newTarget);
        } catch (err) {
          error = err;
          throw err;
        } finally {
          FunctionPrototypeCall(trackCall, ctx, {
            arguments: argList,
            error,
            result,
            // eslint-disable-next-line no-restricted-syntax
            stack: new Error(),
            target,
            this: result,
          });
        }

        return result;
      },
      get(target, property, receiver) {
        if (property === 'mock') {
          return ctx;
        }

        return ReflectGet(target, property, receiver);
      },
    });

    ArrayPrototypePush(this.#mocks, {
      __proto__: null,
      ctx,
      restore: restoreFn,
    });
    return mock;
  }
}

MockTracker.prototype.module.bustESMCache = function() {
  const sharedState = setupSharedModuleState();
  const ack = new Int32Array(new SharedArrayBuffer(4));

  sharedState.loaderPort.postMessage({
    __proto__: null,
    type: 'node:test:cachebust',
    payload: {
      __proto__: null,
      ack,
    },
  });
  waitForAck(ack);
};

function setupSharedModuleState() {
  if (sharedModuleState === undefined) {
    const { mock } = require('test'); // Cannot use 'node:' here.
    const esmMockExports = new SafeMap();
    // TODO(cjihrig): register() should provide a way to get the message port.
    const loaderPort = globalThis.$__nodeTestLoaderPort;
    delete globalThis.$__nodeTestLoaderPort;
    notStrictEqual(loaderPort, undefined);
    sharedModuleState = {
      __proto__: null,
      cjsMocks: new SafeMap(),
      cjsMockModuleLoad: null,
      esmMockExports,
      loaderPort,
    };
    sharedModuleState.cjsMockModuleLoad =
      FunctionPrototypeBind(cjsMockModuleLoad, sharedModuleState);
    mock._esmMockExports = esmMockExports;
  }

  return sharedModuleState;
}

function cjsMockModuleLoad(request, parent, isMain) {
  let resolved;

  if (isBuiltin(request)) {
    resolved = StringPrototypeStartsWith(request, 'node:') ? request :
      `node:${request}`;
  } else {
    resolved = _resolveFilename(request, parent, isMain);
  }

  const cachedEntry = Module._cache[resolved];

  if (cachedEntry !== undefined) {
    return cachedEntry.exports;
  }

  const mockConfig = this.cjsMocks.get(resolved);

  if (mockConfig?.hasExports) {
    const mockExports = mockConfig.exports;
    const isObject = typeof mockExports === 'object' && mockExports !== null;
    const newExports = isObject ? { ...mockExports } : mockExports;

    if (mockConfig.cache) {
      const entry = new Module(resolved, mockConfig.parent);

      entry.exports = newExports;
      entry.filename = resolved;
      entry.loaded = true;
      entry.paths = _nodeModulePaths(entry.path);
      Module._cache[resolved] = entry;
    }

    return newExports;
  }

  const mockPath = mockConfig?.mockPath;
  const newRequest = mockPath ?? request;
  const result = _load(newRequest, parent, isMain);

  if (mockPath !== undefined) {
    if (isBuiltin(request)) {
      // TODO(cjihrig): Support core modules.
    } else {
      if (mockConfig.cache) {
        const entry = Module._cache[mockPath];

        entry.filename = resolved;
        entry.id = resolved;
        entry.path = dirname(resolved);
        entry.paths = _nodeModulePaths(entry.path);
        Module._cache[resolved] = entry;
      }
    }

    delete Module._cache[mockPath];
  }

  return result;
}

function validateStringOrSymbol(value, name) {
  if (typeof value !== 'string' && typeof value !== 'symbol') {
    throw new ERR_INVALID_ARG_TYPE(name, ['string', 'symbol'], value);
  }
}

function validateTimes(value, name) {
  if (value === Infinity) {
    return;
  }

  validateInteger(value, name, 1);
}

function findMethodOnPrototypeChain(instance, methodName) {
  let host = instance;
  let descriptor;

  while (host !== null) {
    descriptor = ObjectGetOwnPropertyDescriptor(host, methodName);

    if (descriptor) {
      break;
    }

    host = ObjectGetPrototypeOf(host);
  }

  return descriptor;
}

function waitForAck(buf) {
  const result = AtomicsWait(buf, 0, 0, kWaitTimeout);

  notStrictEqual(result, 'timed-out', 'test mocking synchronization failed');
}

module.exports = {
  kMockSuccess,
  kMockExists,
  kMockUnknownMessage,
  MockTracker,
};
