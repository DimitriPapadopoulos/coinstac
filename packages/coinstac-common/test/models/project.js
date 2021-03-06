'use strict';

const File = require('../../src/models/file.js');
const test = require('tape');

test('model::project', (t) => {
  const f1 = new File({
    filename: 'free-surfer-dummy-1.txt',
    sha: 'abcef0123456789',
    tags: {},
    modified: 1,
    size: 1,
  });
  t.ok(f1.serialize(), 'serializes project');
  t.end();
});
