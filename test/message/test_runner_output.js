'use strict';
require('../common');
const assert = require('assert');
const test = require('test_runner');

test('sync pass todo', (t) => {
  t.todo();
});

test('sync pass todo with message', (t) => {
  t.todo('this is a passing todo');
});

test('sync fail todo', (t) => {
  t.todo();
  throw new Error('thrown from sync fail todo');
});

test('sync fail todo with message', (t) => {
  t.todo('this is a failing todo');
  throw new Error('thrown from sync fail todo with message');
});

test('sync skip pass', (t) => {
  t.skip();
});

test('sync skip pass with message', (t) => {
  t.skip('this is skipped');
});

test('sync pass', (t) => {
  t.diagnostic('this test should pass');
});

test('sync throw fail', () => {
  throw new Error('thrown from sync throw fail');
});

test('async skip pass', async (t) => {
  t.skip();
});

test('async pass', async () => {

});

test('async throw fail', async () => {
  throw new Error('thrown from async throw fail');
});

test('async skip fail', async (t) => {
  t.skip();
  throw new Error('thrown from async throw fail');
});

test('async assertion fail', async () => {
  // Make sure the assert module is handled.
  assert.strictEqual(true, false);
});

test('resolve pass', () => {
  return Promise.resolve();
});

test('reject fail', () => {
  return Promise.reject(new Error('rejected from reject fail'));
});

test('unhandled rejection - passes but warns', () => {
  Promise.reject(new Error('rejected from unhandled rejection fail'));
});

test('async unhandled rejection - passes but warns', async () => {
  Promise.reject(new Error('rejected from async unhandled rejection fail'));
});

test('immediate throw - passes but warns', () => {
  setImmediate(() => {
    throw new Error('thrown from immediate throw fail');
  });
});

test('immediate reject - passes but warns', () => {
  setImmediate(() => {
    Promise.reject(new Error('rejected from immediate reject fail'));
  });
});

test('immediate resolve pass', () => {
  return new Promise((resolve) => {
    setImmediate(() => {
      resolve();
    });
  });
});

test('subtest sync throw fail', async (t) => {
  await t.test('+sync throw fail', (t) => {
    t.diagnostic('this subtest should make its parent test fail');
    throw new Error('thrown from subtest sync throw fail');
  });
});

test('sync throw non-error fail', async (t) => {
  throw Symbol('thrown symbol from sync throw non-error fail')
});

test('level 0a', async (t) => {
  t.test('level 1a', async (t) => {
    const p1a = new Promise((resolve) => {
      setTimeout(() => {
        // console.log('resolving p1a');
        resolve();
      }, 1000);
    });

    return p1a;
  });

  t.test('level 1b', async (t) => {
    const p1b = new Promise((resolve) => {
      // console.log('resolving p1b');
      resolve();
    });

    return p1b;
  });

  t.test('level 1c', async (t) => {
    const p1c = new Promise((resolve) => {
      setTimeout(() => {
        // console.log('resolving p1c');
        resolve();
      }, 2000);
    });

    return p1c;
  });

  t.test('level 1d', async (t) => {
    const p1c = new Promise((resolve) => {
      setTimeout(() => {
        // console.log('resolving p1d');
        resolve();
      }, 1500);
    });

    return p1c;
  });

  const p0a = new Promise((resolve) => {
    setTimeout(() => {
      // console.log('resolving p0a');
      resolve();
    }, 3000);
  });

  return p0a;
});

test('top level', async (t) => {
  t.test('+long running', async (t) => {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, 3000).unref();
      // setTimeout(resolve, 3000); //.unref();
    });
  });

  t.test('+short running', async (t) => {
    t.test('++short running', async (t) => {});
  });
});

test('invalid subtest - pass but subtest fails', (t) => {
  setImmediate(() => {
    t.test('invalid subtest fail', () => {
      throw new Error('this should not be thrown');
    });
  });
});
