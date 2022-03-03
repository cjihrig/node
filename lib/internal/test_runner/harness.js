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

function createProcessEventHandler(eventName, rootTest) {
  return (err) => {
    // Check if this error is coming from a test. If it is, fail the test.
    const test = testResources.get(executionAsyncId());
    const error = new Error(`${eventName} failure`, { cause: err });

    if (test !== undefined) {
      if (test.endTime !== null) {
        // If the test is already finished, report this as a top level
        // diagnostic since this is a malformed test.
        let msg = `Warning: Test "${test.name}" generated asynchronous ` +
          'activity after the test ended. This activity created the error ' +
          `"${err}" and would have caused the test to fail, but instead ` +
          `triggered an ${eventName} event.`;

        rootTest.diagnostic(msg);
      }

      test.fail(error);
    }
  };
}

function setup() {
  const reporter = new TapStream();
  const root = new Test({
    testNumber: 0,
    name: '<root>',
    reporter
  });

  hook.enable();

  root.run = async function() {
    const exceptionHandler =
      createProcessEventHandler('uncaughtException', root);
    const rejectionHandler =
      createProcessEventHandler('unhandledRejection', root);
    // Since Promises won't keep the event loop alive, use an interval.
    const keepAlive = setInterval(() => {}, 2 ** 31 - 1);

    process.on('uncaughtException', exceptionHandler);
    process.on('unhandledRejection', rejectionHandler);
    this.reporter.pipe(process.stdout);
    this.reporter.version();
    this.reporter.plan('', this.subtests.length);

    // TODO(cjihrig): Make concurrency configurable.
    const promises = [];

    for (const subtest of this.subtests) {
      promises.push(subtest.run());
    }

    await Promise.allSettled(promises);

    for (const diagnostic of this.diagnostics) {
      this.reporter.diagnostic(this.indent, diagnostic);
    }

    this.reporter.push(null);
    hook.disable();
    process.removeListener('unhandledRejection', rejectionHandler);
    process.removeListener('uncaughtException', exceptionHandler);
    clearInterval(keepAlive);
  };

  root.test = function(name, options, fn) {
    if (this.subtests.length === 0) {
      setImmediate(() => {
        this.run();
      });
    }

    this.createSubtest(name, options, fn);
  }

  return root.test.bind(root);
}

module.exports = setup();
