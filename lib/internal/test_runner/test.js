'use strict';
const {
  ArrayPrototypePush,
  Number,
  ObjectCreate,
  SafeMap,
} = primordials;
const { AsyncResource } = require('async_hooks');
const {
  codes: {
    ERR_TEST_FAILURE,
  },
} = require('internal/errors');
const { clearInterval, setInterval } = require('timers');
const { bigint: hrtime } = process.hrtime;
const kCancelledByParent = 'cancelledByParent';
const kParentAlreadyFinished = 'parentAlreadyFinished';
const kSubtestsFailed = 'subtestsFailed';
const kTestCodeFailure = 'testCodeFailure';
const kDefaultIndent = '    ';
const noop = () => {};

class TestContext {
  #test;

  constructor(test) {
    this.#test = test;
  }

  diagnostic(message) {
    this.#test.diagnostic(message);
  }

  skip(message) {
    this.#test.skip(message);
  }

  todo(message) {
    this.#test.todo(message);
  }

  test(name, options, fn) {
    const subtest = this.#test.createSubtest(name, options, fn);

    return subtest.run();
  }
}

class Test extends AsyncResource {
  constructor(options) {
    super('Test');

    const {
      testNumber,
      name,
      fn = noop,
      reporter,
      indent = '',
      indentString = kDefaultIndent,
      parent = null,
    } = options;

    // TODO(cjihrig): Add validation here.

    this.testNumber = testNumber;
    this.name = name;
    this.fn = fn;
    this.cancelled = false;
    this.skipped = false;
    this.isTodo = false;
    this.startTime = null;
    this.endTime = null;
    this.passed = false;
    this.error = null;
    this.parent = parent;
    this.subtests = [];
    this.reporter = reporter;
    this.indent = indent;
    this.indentString = indentString;
    this.waitingOn = 0;
    this.readySubtests = new SafeMap();
    this.diagnostics = [];
    this.message = null;
    this.keepAlive = null;

    // If this is the root test, keep the event loop alive.
    if (parent === null) {
      this.keepAlive = setInterval(noop, 2 ** 31 - 1);
    }
  }

  addReadySubtest(subtest) {
    this.readySubtests.set(subtest.testNumber, subtest);
  }

  processReadySubtestRange(canSend) {
    const start = this.waitingOn;
    const end = start + this.readySubtests.size;

    for (let i = start; i < end; i++) {
      const subtest = this.readySubtests.get(i);

      // Check if the specified subtest is in the map. If it is not, return
      // early to avoid trying to process any more tests since they would be
      // out of order.
      if (subtest === undefined) {
        return;
      }

      // Call isClearToSend() in the loop so that it is:
      // - Only called if there are results to report in the correct order.
      // - Guaranteed to only be called a maximum of once per call to
      //   processReadySubtestRange().
      canSend = canSend || this.isClearToSend();

      if (!canSend) {
        return;
      }

      // Report the subtest's results and remove it from the ready map.
      subtest.finalize();
      this.readySubtests.delete(i);
    }
  }

  createSubtest(name, options, fn) {
    if (typeof options === 'function') {
      fn = options;
      options = ObjectCreate(null);
    }

    let parent = this;

    // If this test has already ended, attach this test to the root test so
    // that the error can be properly reported.
    if (this.endTime !== null) {
      while (parent.parent !== null) {
        parent = parent.parent;
      }
    }

    const testNumber = parent.subtests.length + 1;
    const indent = parent.parent === null ? parent.indent :
      parent.indent + parent.indentString;
    const test = new Test({
      testNumber,
      name,
      fn,
      reporter: parent.reporter,
      indent,
      indentString: parent.indentString,
      parent
    });

    if (parent.waitingOn === 0) {
      parent.waitingOn = testNumber;
    }

    if (this.endTime !== null) {
      test.fail(
        new ERR_TEST_FAILURE(
          'test could not be started because its parent finished',
          kParentAlreadyFinished
        )
      );
    }

    ArrayPrototypePush(parent.subtests, test);
    return test;
  }

  cancel() {
    if (this.endTime !== null) {
      return;
    }

    this.fail(
      new ERR_TEST_FAILURE(
        'test did not finish before its parent and was cancelled',
        kCancelledByParent
      )
    );
    this.cancelled = true;
  }

  fail(err) {
    if (this.error !== null) {
      return;
    }

    this.endTime = hrtime();
    this.passed = false;
    this.error = err;
  }

  pass() {
    if (this.endTime !== null) {
      return;
    }

    this.endTime = hrtime();
    this.passed = true;
  }

  skip(message) {
    this.skipped = true;
    this.message = message;
  }

  todo(message) {
    this.isTodo = true;
    this.message = message;
  }

  diagnostic(message) {
    ArrayPrototypePush(this.diagnostics, message);
  }

  async run() {
    try {
      this.startTime = hrtime();
      await this.runInAsyncScope(this.fn, null, new TestContext(this));
      this.pass();
    } catch (err) {
      this.fail(new ERR_TEST_FAILURE(err, kTestCodeFailure));
    }

    this.teardown();
    this.parent.processReadySubtestRange(false);
  }

  teardown() {
    let failedSubtests = 0;

    // If the test was failed before it even started, then the end time will
    // be earlier than the start time. Correct that here.
    if (this.endTime < this.startTime) {
      this.endTime = hrtime();
    }

    // The test has run, so recursively cancel any outstanding subtests and
    // mark this test as failed if any subtests failed.
    for (let i = 0; i < this.subtests.length; i++) {
      const subtest = this.subtests[i];

      if (subtest.endTime === null) {
        subtest.cancel();
        subtest.teardown();
      }

      if (!subtest.passed) {
        failedSubtests++;
      }
    }

    if (this.passed && failedSubtests > 0) {
      const subtestString = `subtest${failedSubtests > 1 ? 's' : ''}`;
      const msg = `${failedSubtests} ${subtestString} failed`;

      this.fail(new ERR_TEST_FAILURE(msg, kSubtestsFailed));
    }

    this.parent?.addReadySubtest(this);
  }

  isClearToSend() {
    return this.parent === null ||
      (
        this.parent.waitingOn === this.testNumber && this.parent.isClearToSend()
      );
  }

  finalize() {
    // By the time this function is called, the following can be relied on:
    // - The current test has completed or been cancelled.
    // - All of this test's subtests have completed or been cancelled.
    // - It is the current test's turn to report its results.

    // Report any subtests that have not been reported yet. Since all of the
    // subtests have finished, it's safe to pass true to
    // processReadySubtestRange(), which will finalize all remaining subtests.
    this.processReadySubtestRange(true);

    // Output this test's results and update the parent's waiting counter.
    if (this.subtests.length > 0) {
      this.reporter.plan(this.subtests[0].indent, this.subtests.length);
    }

    this.report();
    this.parent.waitingOn++;

    if (this.parent.parent === null &&
        this.parent.waitingOn > this.parent.subtests.length) {
      // This was the last test, so the root does not need to keep the event
      // loop alive anymore.
      clearInterval(this.parent.keepAlive);
    }
  }

  report() {
    // Duration is recorded in BigInt nanoseconds. Convert to seconds.
    const duration = Number(this.endTime - this.startTime) / 1_000_000_000;
    const message = `- ${this.name}`;
    let directive;

    if (this.skipped) {
      directive = this.reporter.getSkip(this.message);
    } else if (this.isTodo) {
      directive = this.reporter.getTodo(this.message);
    }

    if (this.passed) {
      this.reporter.ok(this.indent, this.testNumber, message, directive);
    } else {
      this.reporter.fail(this.indent, this.testNumber, message, directive);
    }

    this.reporter.details(this.indent, duration, this.error);

    for (let i = 0; i < this.diagnostics.length; i++) {
      this.reporter.diagnostic(this.indent, this.diagnostics[i]);
    }
  }
}

module.exports = { kDefaultIndent, Test };
