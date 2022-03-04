'use strict';
const {
  ArrayPrototypeJoin,
  ArrayPrototypePush,
  ArrayPrototypeShift,
  StringPrototypeReplaceAll,
  StringPrototypeSplit,
} = primordials;
const { isError } = require('internal/util');
const { Readable } = require('stream');
const { inspect } = require('util');
const inspectOptions = { colors: false, breakLength: Infinity };
const lineBreakRegExp = /\n|\r\n/;

class TapStream extends Readable {
  #buffer;
  #canPush;

  constructor() {
    super();
    this.#buffer = [];
    this.#canPush = true;
  }

  _read() {
    this.#canPush = true;

    while (this.#buffer.length > 0) {
      const line = ArrayPrototypeShift(this.#buffer);

      if (!this.#tryPush(line)) {
        return;
      }
    }
  }

  bail(message) {
    this.#tryPush(`Bail out!${message ? ` ${message}` : ''}\n`);
  }

  fail(indent, testNumber, description, directive) {
    this.#test(indent, testNumber, 'not ok', description, directive);
  }

  ok(indent, testNumber, description, directive) {
    this.#test(indent, testNumber, 'ok', description, directive);
  }

  plan(indent, count, explanation) {
    const exp = `${explanation ? ` # ${explanation}` : ''}`;

    this.#tryPush(`${indent}1..${count}${exp}\n`);
  }

  getSkip(reason) {
    return `SKIP${reason ? ` ${reason}` : ''}`;
  }

  getTodo(reason) {
    return `TODO${reason ? ` ${reason}` : ''}`;
  }

  details(indent, duration, error) {
    let details = `${indent}  ---\n`;

    details += `${indent}  duration_ms: ${duration}\n`;

    if (isError(error)) {
      const {
        failureType,
        message = '<unknown error>',
        stack,
      } = error;
      // TODO(cjihrig): Use error.cause if it is the real error.

      details += `${indent}  error: ${message}\n`;

      if (failureType) {
        details += `${indent}  failureType: ${failureType}\n`;
      }

      if (typeof stack === 'string') {
        const frames = StringPrototypeSplit(
          StringPrototypeReplaceAll(stack, '    at ', ''),
          lineBreakRegExp
        );

        // The first frame repeats the message, which is already displayed.
        ArrayPrototypeShift(frames);

        if (frames.length > 0) {
          const frameDelimiter = `\n${indent}    `;

          details += `${indent}  stack: |-${frameDelimiter}`;
          details += `${ArrayPrototypeJoin(frames, `${frameDelimiter}`)}\n`;
        }
      }
    } else if (error !== null && error !== undefined) {
      details += `${indent}  error: ${inspect(error, inspectOptions)}\n`;
    }

    details += `${indent}  ...\n`;
    this.#tryPush(details);
  }

  diagnostic(indent, message) {
    this.#tryPush(`${indent}# ${message}\n`);
  }

  version() {
    this.#tryPush('TAP version 13\n');
  }

  #test(indent, testNumber, status, description, directive) {
    let line = `${indent}${status} ${testNumber}`;

    if (description) {
      line += ` ${description}`;
    }

    if (directive) {
      line += ` # ${directive}`;
    }

    line += '\n';
    this.#tryPush(line);
  }

  #tryPush(message) {
    if (this.#canPush) {
      this.#canPush = this.push(message);
    } else {
      ArrayPrototypePush(this.#buffer, message);
    }

    return this.#canPush;
  }
}

module.exports = { TapStream };
