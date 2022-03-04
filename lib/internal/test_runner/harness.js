'use strict';
const { SafeMap } = primordials;
const {
  createHook,
  executionAsyncId,
} = require('async_hooks');
const {
  codes: {
    ERR_TEST_FAILURE,
  },
} = require('internal/errors');
const { TapStream } = require('internal/test_runner/tap_stream');
const { Test } = require('internal/test_runner/test');
const testResources = new SafeMap();
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
    testResources.delete(asyncId);
  }
});

function createProcessEventHandler(eventName, rootTest) {
  return (err) => {
    // Check if this error is coming from a test. If it is, fail the test.
    const test = testResources.get(executionAsyncId());

    if (test !== undefined) {
      if (test.endTime !== null) {
        // If the test is already finished, report this as a top level
        // diagnostic since this is a malformed test.
        const msg = `Warning: Test "${test.name}" generated asynchronous ` +
          'activity after the test ended. This activity created the error ' +
          `"${err}" and would have caused the test to fail, but instead ` +
          `triggered an ${eventName} event.`;

        rootTest.diagnostic(msg);
      }

      test.fail(new ERR_TEST_FAILURE(err, eventName));
    }
  };
}

function test(name, options, fn) {
  const subtest = this.createSubtest(name, options, fn);

  return subtest.run();
}

function setup() {
  const reporter = new TapStream();
  const root = new Test({
    testNumber: 0,
    name: '<root>',
    reporter
  });

  hook.enable();

  const exceptionHandler =
    createProcessEventHandler('uncaughtException', root);
  const rejectionHandler =
    createProcessEventHandler('unhandledRejection', root);

  process.on('uncaughtException', exceptionHandler);
  process.on('unhandledRejection', rejectionHandler);
  process.on('beforeExit', () => {
    root.pass();
    root.teardown();
    root.reporter.plan(root.indent, root.subtests.length);

    for (let i = 0; i < root.diagnostics.length; i++) {
      root.reporter.diagnostic(root.indent, root.diagnostics[i]);
    }

    root.reporter.push(null);
    hook.disable();
    process.removeListener('unhandledRejection', rejectionHandler);
    process.removeListener('uncaughtException', exceptionHandler);

    if (!root.passed) {
      process.exitCode = 1;
    }
  });

  root.reporter.pipe(process.stdout);
  root.reporter.version();

  return test.bind(root);
}

module.exports = setup();
