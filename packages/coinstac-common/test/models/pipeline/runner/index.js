'use strict';

const path = require('path');
const glob = require('glob');

const files = glob.sync(path.join(__dirname, '/*.js')).filter((f) => {
    // filter this file!
  return !f.match(/index.js/);
});

files.forEach((file) => {
  const fullPath = path.resolve('./', file);
  require(fullPath); // eslint-disable-line global-require, import/no-dynamic-require
});
