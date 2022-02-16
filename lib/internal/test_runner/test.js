'use strict';

class TestContext {
  #test;

  constructor(test) {
    this.#test = test;
  }

  skip() {
    this.#test.skip();
  }
}

class Test {
  constructor(name, fn) {
    this.name = name;
    this.fn = fn;
    this.skipped = false;
    this.started = false;
    this.passed = false;
    this.error = null;
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
        this.started = true;
        await this.fn.call(null, new TestContext(this));
        this.passed = true;
      } catch (err) {
        fail(err);
      }

      setImmediate(() => {
        process.removeListener('uncaughtException', fail);
        process.removeListener('unhandledRejection', fail);
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
