'use strict';
const {
  ArrayPrototypePush,
  Promise,
  PromiseAllSettled,
  RegExpPrototypeTest,
  StringPrototypeSplit,
} = primordials;
const {
  prepareMainThreadExecution
} = require('internal/bootstrap/pre_execution');
const { getOptionValue } = require('internal/options');
const { kDefaultIndent, Test } = require('internal/test_runner/test');
const { fork } = require('child_process');
const { resolve } = require('path');
const testPattern = getOptionValue('--test');
const isTestRunnerChild = process.env.NODE_TEST_RUNNER_CHILD === '1';

prepareMainThreadExecution(isTestRunnerChild);
markBootstrapComplete();

if (isTestRunnerChild) {
  // TODO(cjihrig): We might not actually need this code path - TBD.

  // This is a test runner child process. Setup the process for running tests
  // and then execute as if this were run_main_module.js.
  delete process.env.NODE_TEST_RUNNER_CHILD;
  require('internal/modules/cjs/loader').Module.runMain(testPattern);
  return;
}

// This is the main test runner process.
const tapVersionPattern = /^TAP version [0-9]+$/;
const root = new Test({ name: '<root>' });

root.run = async function() {
  this.reporter.pipe(process.stdout);
  this.reporter.version();
  this.reporter.plan('', this.subtests.length);

  // TODO(cjihrig): Make concurrency configurable.
  const promises = [];

  for (let i = 0; i < this.subtests.length; i++) {
    ArrayPrototypePush(promises, this.subtests[i].run());
  }

  await PromiseAllSettled(promises);

  for (let i = 0; i < this.diagnostics.length; i++) {
    this.reporter.diagnostic(this.indent, this.diagnostics[i]);
  }

  this.reporter.push(null);
};

// TODO(cjihrig): Turn pattern into a list of test files. Until then, the list
// of test files only includes the exact file passed with --test.
const testScripts = [resolve(testPattern)];

for (let i = 0; i < testScripts.length; i++) {
  const testScript = testScripts[i];
  const subtest = root.createSubtest(testScript, () => {
    subtest.output = '';

    subtest.report = function() {
      const lines = StringPrototypeSplit(subtest.output, '\n');

      for (let j = 0; j < lines.length; j++) {
        const line = lines[j];

        if (line === '' || RegExpPrototypeTest(tapVersionPattern, line)) {
          continue;
        }

        subtest.reporter.push(`${kDefaultIndent}${line}\n`);
      }

      Test.prototype.report.call(subtest);
    };

    return new Promise((resolve, reject) => {
      // TODO(cjihrig): Eventually it would be good to implement a streaming
      // TAP parser here. It would avoid too much buffering, and also allow
      // the output to be validated for things like plan errors.
      const child = fork(testScript, [], {
        env: { ...process.env, NODE_TEST_RUNNER_CHILD: '1' },
        // Keep --test as the last argument since it requires a path.
        execArgv: ['--test'],
        silent: true,
      });

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        subtest.output += chunk;
      });

      child.once('error', (err) => {
        // TODO(cjihrig): Report an error here.
        reject();
      });

      child.once('exit', (code, signal) => {
        if (code === 0 && signal === null) {
          resolve();
        } else {
          process.exitCode = 1;
          reject();
        }
      });
    });
  });
}

root.run();
