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
      this.report(test);
    }
  }

  report(test) {
    if (test.skipped) {
      this.reporter.skip(`- ${test.name}`);
    } else if (test.passed) {
      this.reporter.ok(`- ${test.name}`);
    } else {
      this.reporter.fail(`- ${test.name}`);
      process.exitCode = 1;
    }

    if (test.subtests.length > 0) {
      this.reporter.indent();
      this.reporter.plan(test.subtests.length);

      for (const subtest of test.subtests) {
        this.report(subtest);
      }

      this.reporter.dedent();
    }
  }

  test(name, fn) {
    if (this.autoRun && this.tests.length === 0) {
      setImmediate(async () => {
        await this.run();
      });
    }

    this.tests.push(new Test(name, fn));
  }
}

module.exports = { TestScript };
