// Flags: --no-warnings
'use strict';
require('../common');
const test = require('node:test_runner');

// No TAP output should be generated.
console.log(test.name);
