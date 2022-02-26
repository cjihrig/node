'use strict';
const { TapStream } = require('internal/test_runner/tap_stream');
const { Test } = require('internal/test_runner/test');

function setup() {
  const reporter = new TapStream();
  const root = new Test(0, 'root', () => {}, reporter, '', '    ');

  root.run = async function() {
    this.reporter.pipe(process.stdout);
    this.reporter.version();
    this.reporter.plan('', this.subtests.length);

    for (const subtest of this.subtests) {
      await subtest.run();
    }

    this.reporter.push(null);
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
