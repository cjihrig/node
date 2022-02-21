'use strict';
const { EventEmitter } = require('events');

class TestContext {
  #test;

  constructor(test) {
    this.#test = test;
  }

  skip() {
    this.#test.skip();
  }

  test(name, fn) {
    const subtest = this.#test.createSubtest(name, fn);

    return subtest.run();
  }
}

// TODO(cjihrig): This might not need to be an EE after all.
class Test extends EventEmitter {
  // TODO(cjihrig): Make this an options object, including the parent test.
  constructor(testNumber, name, fn, reporter, indent, indentString) {
    super();
    this.testNumber = testNumber;
    this.name = name;
    this.fn = fn;
    this.cancelled = false;
    this.skipped = false;
    this.startTime = null;
    this.endTime = null;
    this.passed = false;
    this.error = null;  // TODO(cjihrig): Support multiple errors?
    this.parent = null;
    this.subtests = [];
    this.reporter = reporter;
    this.indent = indent;
    this.indentString = indentString;
    this.waitingOn = 0;
    this.output = [];
    this.settled = false;
    this.finished = false;
  }

  createSubtest(name, fn) {
    // TODO(cjihrig): Error if the test is already finished and no new
    // subtests should be created.
    const testNumber = this.subtests.length + 1;
    const indent = this.indent + this.indentString;
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
    this.fail(new Error('test did not finish'));
    this.cancelled = true;
  }

  pass() {
    this.endTime = process.hrtime.bigint();
    this.passed = true;
  }

  fail(err) {
    this.endTime = process.hrtime.bigint();
    this.passed = false;
    this.error = String(err); // TODO(cjihrig): Use util.inspect() here?
  }

  skip() {
    this.pass();
    this.skipped = true;
  }

  run() {
    const fail = this.fail.bind(this);

    return new Promise(async (resolve) => {
      // TODO(cjihrig): Are these handlers overkill? Maybe only needed in
      // strict/throw unhandled rejection mode?
      process.on('uncaughtException', fail);
      process.on('unhandledRejection', fail);

      try {
        this.startTime = process.hrtime.bigint();
        await this.fn.call(null, new TestContext(this));
        this.pass();
      } catch (err) {
        this.fail(err);
      }

      setImmediate(() => {
        this.postrun();
        process.removeListener('uncaughtException', fail);
        process.removeListener('unhandledRejection', fail);
        this.report();
        resolve();
      });
    });
  }

  postrun() {
    // The test has run, so recursively cancel any outstanding subtests and
    // mark this test as failed if any subtests failed.
    for (const subtest of this.subtests) {
      if (subtest.endTime === null) {
        subtest.cancel();
        subtest.postrun();
      }

      if (this.passed && !subtest.passed) {
        this.fail(new Error('subtest(s) failed'));
      }
    }

    // TODO(cjihrig): What if instead of using this flag, the parent keeps a
    // queue of ready to report tests???
    this.settled = true;
  }

  isClearToSend() {
    return this.parent === null ||
      (
        this.parent.waitingOn === this.testNumber && this.parent.isClearToSend()
      );
  }

  report() {
    // When a test finishes, try to report its results. By this point, postrun()
    // has run, so all subtests are guaranteed to have finished or been
    // cancelled.

    // First, check if this test has any earlier siblings that can be reported.
    // If so, run those now. Otherwise, reporting on this test will be blocked
    // until its parent forces all of its own subtests to report. Functionally,
    // that is fine, but try to avoid buffering test output when possible.
    if (this.parent !== null &&
        this.parent.subtests.length !== 0 &&
        this.parent.waitingOn < this.testNumber) {
      for (let i = this.parent.waitingOn - 1; i < this.testNumber - 1; i++) {
        const sibling = this.parent.subtests[i];

        if (!sibling.settled) {
          break;
        }

        sibling.report();
      }
    }
    // TODO(cjihrig): Need to do this some thing for following siblings later.

    // Before reporting this test's results, ensure that it is this test's
    // turn to report. This ensures that the output reporting is serialized in
    // the correct order.
    if (!this.isClearToSend()) {
      return;
    }

    // Report any subtests that have not been reported yet.
    for (const subtest of this.subtests) {
      if (!subtest.finished) {
        subtest.report();
      }
    }

    // Output this test's results, and update the parent's waiting counter.
    process.stdout.write(getTestOutput(this));

    if (this.parent) {
      this.parent.waitingOn++;
    }

    // Finally, mark this test as finished. Nothing should happen with this test
    // after this point.
    this.finished = true;
  }
}

module.exports = { Test };


function getTestOutput(test) {
  const status = test.passed ? 'ok' : 'not ok';
  let output = `${test.indent}${status} ${test.testNumber}`;

  if (test.name) {
    output += ` ${test.name}`;
  }

  // TODO(cjihrig): Complete this implementation.
  if (test.skipped) {
    output += ` # SKIP`;
  }

  output += '\n';
  return output;
}
