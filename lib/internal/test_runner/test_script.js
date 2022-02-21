'use strict';
const { Test } = require('internal/test_runner/test');

class TestScript {
  // TODO(cjihrig): Make constructor take options object.
  constructor(reporter, autoRun) {
    this.autoRun = autoRun;
    this.reporter = reporter;
    this.tests = [];
  }

  async run() {
    this.reporter.version();
    this.reporter.plan(this.tests.length);

    for (const test of this.tests) {
      await test.run();
      // this.report(test);
    }
  }

  test(name, fn) {
    if (this.autoRun && this.tests.length === 0) {
      setImmediate(async () => {
        await this.run();
      });
    }

    const testNumber = this.tests.length + 1;

    this.tests.push(new Test(testNumber, name, fn, this.reporter, '', '    '));
  }
}

module.exports = { TestScript };
