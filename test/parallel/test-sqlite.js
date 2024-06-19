'use strict';
require('../common');
const tmpdir = require('../common/tmpdir');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { SQLiteDatabaseSync, SQLiteStatementSync } = require('node:sqlite');
const { suite, test } = require('node:test');
let cnt = 0;

tmpdir.refresh();

function nextDb() {
  return join(tmpdir.path, `database-${cnt++}.db`);
}

suite('SQLiteDatabaseSync() constructor', () => {
  test('throws if called without new', (t) => {
    t.assert.throws(() => {
      SQLiteDatabaseSync();
    }, {
      code: 'ERR_CONSTRUCT_CALL_REQUIRED',
      message: /Cannot call constructor without `new`/,
    });
  });

  test('throws if database path is not a string', (t) => {
    t.assert.throws(() => {
      new SQLiteDatabaseSync();
    }, {
      code: 'ERR_INVALID_ARG_TYPE',
      message: /The "path" argument must be a string/,
    });
  });

  test('throws if options is provided but is not an object', (t) => {
    t.assert.throws(() => {
      new SQLiteDatabaseSync('foo', null);
    }, {
      code: 'ERR_INVALID_ARG_TYPE',
      message: /The "options" argument must be an object/,
    });
  });

  test('throws if options.open is provided but is not a boolean', (t) => {
    t.assert.throws(() => {
      new SQLiteDatabaseSync('foo', { open: 5 });
    }, {
      code: 'ERR_INVALID_ARG_TYPE',
      message: /The "options\.open" argument must be a boolean/,
    });
  });
});

suite('SQLiteDatabaseSync.prototype.open()', () => {
  test('opens a database connection', (t) => {
    const dbPath = nextDb();
    const db = new SQLiteDatabaseSync(dbPath, { open: false });

    t.assert.strictEqual(existsSync(dbPath), false);
    t.assert.strictEqual(db.open(), undefined);
    t.assert.strictEqual(existsSync(dbPath), true);
  });

  test('throws if database is already open', (t) => {
    const db = new SQLiteDatabaseSync(nextDb(), { open: false });

    db.open();
    t.assert.throws(() => {
      db.open();
    }, {
      code: 'ERR_INVALID_STATE',
      message: /database is already open/,
    });
  });
});

suite('SQLiteDatabaseSync.prototype.close()', () => {
  test('closes an open database connection', (t) => {
    const db = new SQLiteDatabaseSync(nextDb());

    t.assert.strictEqual(db.close(), undefined);
  });

  test('throws if database is not open', (t) => {
    const db = new SQLiteDatabaseSync(nextDb(), { open: false });

    t.assert.throws(() => {
      db.close();
    }, {
      code: 'ERR_INVALID_STATE',
      message: /database is not open/,
    });
  });
});

suite('SQLiteDatabaseSync.prototype.prepare()', () => {
  test('returns a prepared statement', (t) => {
    const db = new SQLiteDatabaseSync(nextDb());
    const stmt = db.prepare('CREATE TABLE webstorage(key TEXT)');
    t.assert.ok(stmt instanceof SQLiteStatementSync);
  });

  test('throws if database is not open', (t) => {
    const db = new SQLiteDatabaseSync(nextDb(), { open: false });

    t.assert.throws(() => {
      db.prepare();
    }, {
      code: 'ERR_INVALID_STATE',
      message: /database is not open/,
    });
  });

  test('throws if sql is not a string', (t) => {
    const db = new SQLiteDatabaseSync(nextDb());

    t.assert.throws(() => {
      db.prepare();
    }, {
      code: 'ERR_INVALID_ARG_TYPE',
      message: /The "sql" argument must be a string/,
    });
  });
});

suite('SQLiteStatementSync() constructor', () => {
  test('SQLiteStatementSync cannot be constructed directly', (t) => {
    t.assert.throws(() => {
      new SQLiteStatementSync();
    }, {
      code: 'ERR_ILLEGAL_CONSTRUCTOR',
      message: /Illegal constructor/,
    });
  });
});

suite('SQLiteStatementSync.prototype.get()', () => {
  test('executes a query and returns undefined on no results', (t) => {
    const db = new SQLiteDatabaseSync(nextDb());
    const stmt = db.prepare('CREATE TABLE storage(key TEXT, val TEXT)');
    t.assert.strictEqual(stmt.get(), undefined);
  });

  test('executes a query and returns the first result', (t) => {
    const db = new SQLiteDatabaseSync(nextDb());
    let stmt = db.prepare('CREATE TABLE storage(key TEXT, val TEXT)');
    t.assert.strictEqual(stmt.get(), undefined);
    stmt = db.prepare('INSERT INTO storage (key, val) VALUES (?, ?)');
    t.assert.strictEqual(stmt.get('key1', 'val1'), undefined);
    t.assert.strictEqual(stmt.get('key2', 'val2'), undefined);
    stmt = db.prepare('SELECT * FROM storage ORDER BY key');
    t.assert.deepStrictEqual(stmt.get(), { key: 'key1', val: 'val1' });
  });
});

suite('SQLiteStatementSync.prototype.all()', () => {
  test('executes a query and returns an empty array on no results', (t) => {
    const db = new SQLiteDatabaseSync(nextDb());
    const stmt = db.prepare('CREATE TABLE storage(key TEXT, val TEXT)');
    t.assert.deepStrictEqual(stmt.all(), []);
  });

  test('executes a query and returns all results', (t) => {
    const db = new SQLiteDatabaseSync(nextDb());
    let stmt = db.prepare('CREATE TABLE storage(key TEXT, val TEXT)');
    t.assert.strictEqual(stmt.run(), undefined);
    stmt = db.prepare('INSERT INTO storage (key, val) VALUES (?, ?)');
    t.assert.strictEqual(stmt.run('key1', 'val1'), undefined);
    t.assert.strictEqual(stmt.run('key2', 'val2'), undefined);
    stmt = db.prepare('SELECT * FROM storage ORDER BY key');
    t.assert.deepStrictEqual(stmt.all(), [
      { key: 'key1', val: 'val1' },
      { key: 'key2', val: 'val2' },
    ]);
  });
});

test('ERR_SQLITE_ERROR is thrown for errors originating from SQLite', (t) => {
  // TODO(cjihrig): Use db.exec() once it exists.
  const db = new SQLiteDatabaseSync(nextDb());
  let stmt = db.prepare(`
    CREATE TABLE test(
      key INTEGER PRIMARY KEY
    ) STRICT;
  `);
  t.assert.strictEqual(stmt.run(), undefined);
  stmt = db.prepare('INSERT INTO test (key) VALUES (?)');
  t.assert.strictEqual(stmt.run(1), undefined);
  t.assert.throws(() => {
    stmt.run(1);
  }, {
    code: 'ERR_SQLITE_ERROR',
    message: 'UNIQUE constraint failed: test.key',
    errcode: 1555,
    errstr: 'constraint failed',
  });
});

test('supported data types', (t) => {
  // TODO(cjihrig): Use db.exec() once it exists.
  const u8a = new TextEncoder().encode('a☃b☃c');
  const db = new SQLiteDatabaseSync(nextDb());
  let stmt = db.prepare(`
    CREATE TABLE types(
      key INTEGER PRIMARY KEY,
      int INTEGER,
      double REAL,
      text TEXT,
      buf BLOB
    ) STRICT;
  `);
  t.assert.strictEqual(stmt.run(), undefined);
  stmt = db.prepare('INSERT INTO types (key, int, double, text, buf) ' +
    'VALUES (?, ?, ?, ?, ?)');
  t.assert.strictEqual(stmt.run(1, 42, 3.14159, 'foo', u8a), undefined);
  t.assert.strictEqual(stmt.run(2, null, null, null, null), undefined);
  t.assert.strictEqual(
    stmt.run(3, Number(8), Number(2.718), String('bar'), Buffer.from('x☃y☃')),
    undefined
  );

  const query = db.prepare('SELECT * FROM types WHERE key = ?');
  t.assert.deepStrictEqual(query.get(1), {
    key: 1,
    int: 42,
    double: 3.14159,
    text: 'foo',
    buf: u8a,
  });
  t.assert.deepStrictEqual(query.get(2), {
    key: 2,
    int: null,
    double: null,
    text: null,
    buf: null,
  });
  t.assert.deepStrictEqual(query.get(3), {
    key: 3,
    int: 8,
    double: 2.718,
    text: 'bar',
    buf: new TextEncoder().encode('x☃y☃'),
  });
});

test('unsupported data types', (t) => {
  // TODO(cjihrig): Use db.exec() once it exists.
  const db = new SQLiteDatabaseSync(nextDb());
  const setup = db.prepare(
    'CREATE TABLE types(key INTEGER PRIMARY KEY, val INTEGER) STRICT;'
  );
  t.assert.strictEqual(setup.run(), undefined);

  [
    undefined,
    () => {},
    Symbol(),
    /foo/,
    Promise.resolve(),
    new Map(),
    new Set(),
  ].forEach((val) => {
    t.assert.throws(() => {
      db.prepare('INSERT INTO types (key, val) VALUES (?, ?)').run(1, val);
    }, {
      code: 'ERR_INVALID_ARG_TYPE',
      message: /Anonymous parameter in argument 2 cannot be bound to SQLite/,
    });
  });

  t.assert.throws(() => {
    const stmt = db.prepare('INSERT INTO types (key, val) VALUES ($k, $v)');
    stmt.run({ $k: 1, $v: () => {} });
  }, {
    code: 'ERR_INVALID_ARG_TYPE',
    message: /Named parameter '\$v' in argument 1 cannot be bound to SQLite/,
  });
});
