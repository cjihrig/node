'use strict';

class TapWriter {
  #buffering;
  #messageBuffer;
  #onDrain;
  #testNumber;
  #stream;

  constructor(writable) {
    this.#buffering = false;
    this.#messageBuffer = [];
    // TODO(cjihrig): Need an error handler on the writable stream.
    this.#onDrain = this.#drainHandler.bind(this);
    this.#testNumber = 1;
    this.#stream = writable;
  }

  bail(message) {
    this.#writeOrBuffer(`Bail out!${message ? ` ${message}` : ''}\n`);
  }

  fail(description) {
    this.#test('not ok', description);
  }

  ok(description) {
    this.#test('ok', description);
  }

  plan(count, explanation) {
    const exp = `${explanation ? ` # ${explanation}` : ''}`;

    this.#writeOrBuffer(`1..${count}${exp}\n`);
  }

  skip(description, reason) {
    this.#test('ok', description, `SKIP${reason ? ` ${reason}` : ''}`);
  }

  todo(description, reason) {
    this.#test('ok', description, `TODO${reason ? ` ${reason}` : ''}`);
  }

  version() {
    this.#writeOrBuffer('TAP version 13\n');
  }

  #test(status, description, directive) {
    let line = `${status} ${this.#testNumber}`;

    if (description) {
      line += ` ${description}`;
    }

    if (directive) {
      line += ` # ${directive}`;
    }

    line += '\n';
    this.#writeOrBuffer(line);
    this.#testNumber++;
  }

  #writeOrBuffer(message) {
    // If the stream is already being buffered, continue buffering new messages.
    if (this.#buffering) {
      this.#messageBuffer.push(message);
      return;
    }

    if (!this.#stream.write(message)) {
      this.#buffering = true;
      this.#stream.once('drain', this.#onDrain);
    }
  }

  #drainHandler() {
    this.#buffering = false;

    while (!this.#buffering && this.#messageBuffer.length > 0) {
      this.#writeOrBuffer(this.#messageBuffer.shift());
    }
  }
}

module.exports = { TapWriter };
