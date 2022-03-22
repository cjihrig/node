// Flags: --no-warnings
'use strict';
require('../common');
const test = require('test_runner');

test('pass');
test('never resolving promise', () => new Promise(() => {}));
test('fail');
