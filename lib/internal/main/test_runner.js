'use strict';

const {
  prepareMainThreadExecution
} = require('internal/bootstrap/pre_execution');
const { getOptionValue } = require('internal/options');
const { TapStream } = require('internal/test_runner/tap_writer');
const { fork } = require('child_process');
const { resolve } = require('path');
const testPattern = getOptionValue('--test');
const isTestRunnerChild = process.env.NODE_TEST_RUNNER_CHILD === '1';

prepareMainThreadExecution(isTestRunnerChild);
markBootstrapComplete();

if (isTestRunnerChild) {
  // This is a test runner child process. Setup the process for running tests
  // and then execute as if this were run_main_module.js.
  delete process.env.NODE_TEST_RUNNER_CHILD;
  require('internal/modules/cjs/loader').Module.runMain(testPattern);
  return;
}

// This is the main test runner process.
const tapVersionPattern = /^TAP version [0-9]+$/;
const reporter = new TapStream();

// TODO(cjihrig): Turn pattern into a list of test files. Until then, the list
// of test files only includes the exact file passed with --test.
const testScripts = [resolve(testPattern)];

function runTestScript(script) {
  return new Promise((resolve, reject) => {
    const child = fork(script, [], {
      env: { ...process.env, NODE_TEST_RUNNER_CHILD: '1' },
      // Keep --test as the last argument since it requires a path.
      execArgv: ['--expose-internals', '--test'],
      silent: true,
    });
    let stdout = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.once('error', (err) => {
      // TODO(cjihrig): Report an error here.
      reject();
    });

    child.once('exit', (code, signal) => {
      if (code !== 0 || signal !== null) {
        process.exitCode = 1;
        reporter.fail('', `- ${script}`);
      } else {
        reporter.ok('', `- ${script}`);
      }

      const lines = stdout.split('\n');

      for (const line of lines) {
        if (tapVersionPattern.test(line)) {
          continue;
        }

        // TODO(cjihrig): Don't use console.log() here.
        console.log('    ' + line);
      }

      resolve();
    });
  });
}

(async function main() {
  reporter.pipe(process.stdout);
  reporter.version();
  reporter.plan('', testScripts.length);

  for (const script of testScripts) {
    await runTestScript(script);
  }

  reporter.push(null);
})();
