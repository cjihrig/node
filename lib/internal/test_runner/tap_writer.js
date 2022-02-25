'use strict';

class TapWriter {
  #buffering;
  #messageBuffer;
  #onDrain;
  #stream;

  constructor(writable) {
    this.#buffering = false;
    this.#messageBuffer = [];
    this.#onDrain = this.#drainHandler.bind(this);
    this.#stream = writable;
    this.#stream.on('error', this.#errorHandler.bind(this));
  }

  bail(message) {
    this.#writeOrBuffer(`Bail out!${message ? ` ${message}` : ''}\n`);
  }

  fail(indent, testNumber, description) {
    this.#test(indent, testNumber, 'not ok', description);
  }

  ok(indent, testNumber, description) {
    this.#test(indent, testNumber, 'ok', description);
  }

  plan(indent, count, explanation) {
    const exp = `${explanation ? ` # ${explanation}` : ''}`;

    this.#writeOrBuffer(`${indent}1..${count}${exp}\n`);
  }

  skip(indent, testNumber, description, reason) {
    const directive = `SKIP${reason ? ` ${reason}` : ''}`;

    this.#test(indent, testNumber, 'ok', description, directive);
  }

  todo(indent, testNumber, description, reason) {
    const directive = `TODO${reason ? ` ${reason}` : ''}`;

    this.#test(indent, testNumber, 'ok', description, directive);
  }

  version() {
    this.#writeOrBuffer('TAP version 13\n');
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
    this.#writeOrBuffer(line);
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

  #errorHandler(err) {
    this.bail(err?.message ?? err);
  }

  #drainHandler() {
    this.#buffering = false;

    while (!this.#buffering && this.#messageBuffer.length > 0) {
      this.#writeOrBuffer(this.#messageBuffer.shift());
    }
  }
}

module.exports = { TapWriter };
