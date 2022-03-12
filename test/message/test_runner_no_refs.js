// Flags: --no-warnings
'use strict';
require('../common');
const test = require('test_runner');

// When run alone, the test() below does not keep the event loop alive. This
// test verifies that the test harness keeps the event loop alive anyway.
test('does not keep event loop alive pass', async (t) => {
  await t.test('+does not keep event loop alive pass', async (t) => {
    return new Promise((resolve) => {
      setTimeout(resolve, 1000).unref();
    });
  });
});
