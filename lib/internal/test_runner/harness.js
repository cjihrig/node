'use strict';
const {
  createHook,
  executionAsyncId,
} = require('async_hooks');
const { TapStream } = require('internal/test_runner/tap_stream');
const { Test } = require('internal/test_runner/test');
const testResources = new Map();
const hook = createHook({
  init(asyncId, type, triggerAsyncId, resource) {
    if (resource instanceof Test) {
      testResources.set(asyncId, resource);
      return;
    }

    const parent = testResources.get(triggerAsyncId);

    if (parent !== undefined) {
      testResources.set(asyncId, parent);
    }
  },
  destroy(asyncId) {
    // TODO(cjihrig): Also delete the test if this is the last child resource.
    testResources.delete(asyncId);
  }
});

function createProcessEventHandler(eventName) {
  return (err) => {
    // Check if this error is coming from a test. If it is, fail the test.
    const test = testResources.get(executionAsyncId());
    const error = new Error(`${eventName} failure`, { cause: err });

    if (test !== undefined) {
      // TODO(cjihrig): If the test is already finished, report this as a top
      // level diagnostic since this is a malformed test.
      test.fail(error);
      return;
    }
  };
}

function setup() {
  hook.enable();

  const reporter = new TapStream();
  const root = new Test(0, 'root', () => {}, reporter, '', '    ');

  root.run = async function() {
    const exceptionHandler = createProcessEventHandler('uncaughtException');
    const rejectionHandler = createProcessEventHandler('unhandledRejection');
    // Since Promises won't keep the event loop alive, use an interval.
    const keepAlive = setInterval(() => {}, 2 ** 31 - 1);

    process.on('uncaughtException', exceptionHandler);
    process.on('unhandledRejection', rejectionHandler);
    this.reporter.pipe(process.stdout);
    this.reporter.version();
    this.reporter.plan('', this.subtests.length);

    for (const subtest of this.subtests) {
      await subtest.run();
    }

    this.reporter.push(null);
    hook.disable();
    process.removeListener('unhandledRejection', rejectionHandler);
    process.removeListener('uncaughtException', exceptionHandler);
    clearInterval(keepAlive);
  };

  root.test = function(name, fn) {
    if (this.subtests.length === 0) {
      setImmediate(() => {
        this.run();
      });
    }

    this.createSubtest(name, fn);
  }

  return root.test.bind(root);
}

module.exports = setup();
