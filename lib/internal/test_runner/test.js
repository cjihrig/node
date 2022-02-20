'use strict';

class TestContext {
  #test;

  constructor(test) {
    this.#test = test;
  }

  skip() {
    this.#test.skip();
  }

  step(name, fn) {
    const subtest = new Test(name, fn);

    this.#test.subtests.push(subtest);
    return subtest.run();
  }
}

class Test {
  constructor(name, fn) {
    this.name = name;
    this.fn = fn;
    this.skipped = false;
    this.startTime = null;
    this.endTime = null;
    this.passed = false;
    this.error = null;  // TODO(cjihrig): Support multiple errors?
    this.subtests = [];
  }

  fail(err) {
    this.passed = false;
    this.error = String(err); // TODO(cjihrig): Use util.inspect() here?
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
        this.endTime = process.hrtime.bigint();
        this.passed = true;
      } catch (err) {
        this.endTime = process.hrtime.bigint();
        fail(err);
      }

      setImmediate(() => {
        process.removeListener('uncaughtException', fail);
        process.removeListener('unhandledRejection', fail);

        for (const subtest of this.subtests) {
          if (subtest.endTime === null) {
            subtest.fail(new Error(
              `subtest '${subtest.name}' did not complete before its parent`
            ));
          }

          if (!subtest.passed) {
            fail(new Error('subtest(s) failed'));
          }
        }

        resolve();
      });
    });
  }

  skip() {
    this.skipped = true;
    this.passed = true;
  }
}

module.exports = { Test };
