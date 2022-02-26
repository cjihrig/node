'use strict';

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

  test(name, fn) {
    const subtest = this.#test.createSubtest(name, fn);

    return subtest.run();
  }
}

class Test {
  // TODO(cjihrig): Make this an options object.
  constructor(testNumber, name, fn, reporter, indent, indentString) {
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
    this.parent = null;
    // TODO(cjihrig): I don't think it's necessary to store all of the subtests
    // in an array. Two maps - readySubtests and one for subtests that are
    // still pending should be enough. For now, keep all of the subtests in an
    // array in case they are needed later.
    this.subtests = [];
    this.reporter = reporter;
    this.indent = indent;
    this.indentString = indentString;
    this.waitingOn = 0;
    this.readySubtests = new Map();
    this._fail = this.fail.bind(this);
    this.diagnostics = [];
    this.message = null;
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

  createSubtest(name, fn) {
    // TODO(cjihrig): Error if the test is already finished and no new
    // subtests should be created.
    const testNumber = this.subtests.length + 1;
    const indent = this.parent === null ? this.indent :
                    this.indent + this.indentString;
    const test = new Test(
      testNumber, name, fn, this.reporter, indent, this.indentString
    );

    if (this.waitingOn === 0) {
      this.waitingOn = testNumber;
    }

    test.parent = this;
    this.subtests.push(test);
    return test;
  }

  cancel() {
    if (this.endTime !== null) {
      return;
    }

    this.fail(
      new Error('test did not finish before its parent and was cancelled')
    );
    this.cancelled = true;
  }

  fail(err) {
    this.endTime = process.hrtime.bigint();
    this.passed = false;

    if (this.error === null) {
      this.error = err;
    }
  }

  pass() {
    if (this.endTime !== null) {
      return;
    }

    this.endTime = process.hrtime.bigint();
    this.passed = true;
  }

  skip(message) {
    if (this.endTime !== null) {
      return;
    }

    this.endTime = process.hrtime.bigint();
    this.passed = true;
    this.skipped = true;
    this.message = message;
  }

  todo(message) {
    this.isTodo = true;
    this.message = message;
  }

  diagnostic(message) {
    this.diagnostics.push(message);
  }

  run() {
    return new Promise(async (resolve) => {
      // TODO(cjihrig): Are these handlers overkill? Maybe only needed in
      // strict/throw unhandled rejection mode?
      process.on('uncaughtException', this._fail);
      process.on('unhandledRejection', this._fail);

      try {
        this.startTime = process.hrtime.bigint();
        await this.fn.call(null, new TestContext(this));
        this.pass();
      } catch (err) {
        this.fail(err);
      }

      this.teardown();
      setImmediate(() => {
        if (this.parent === null) {
          this.finalize();
        } else {
          this.parent.processReadySubtestRange(false);
        }

        resolve();
      });
    });
  }

  teardown() {
    let failedSubtests = 0;

    // The test has run, so recursively cancel any outstanding subtests and
    // mark this test as failed if any subtests failed.
    for (const subtest of this.subtests) {
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

      this.fail(new Error(msg));
    }

    setImmediate(() => {
      process.removeListener('uncaughtException', this._fail);
      process.removeListener('unhandledRejection', this._fail);
    });

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

    for (const diagnostic of this.diagnostics) {
      this.reporter.diagnostic(this.indent, diagnostic);
    }

    if (this.parent) {
      this.parent.waitingOn++;
    }

    if (!this.passed) {
      process.exitCode = 1;
    }
  }
}

module.exports = { Test };
