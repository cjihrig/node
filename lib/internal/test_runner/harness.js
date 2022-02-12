'use strict';
const { TapWriter } = require('internal/test_runner/tap_writer');
const { TestScript } = require('internal/test_runner/test_script');

function setup() {
  const reporter = new TapWriter(process.stdout);
  const script = new TestScript(reporter, true);
  const testFn = script.test.bind(script);

  return testFn;
}

module.exports = setup();
