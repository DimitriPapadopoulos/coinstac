'use strict';

const CoinstacDatabaseRegistry =
  require('../src/coinstac-database-registry.js');
const path = require('path');
const Pouchy = require('pouchy');
const spawnPouchDBServer = require('spawn-pouchdb-server');
const tape = require('tape');

let server;

tape('coinstac-database-registry integration setup', (t) => {
  t.plan(1);

  spawnPouchDBServer({
    port: 5859,
    backend: false,
    log: {
      file: false,
    },
    config: {
      file: false,
    },
  }, (error, serv) => {
    if (error) {
      t.end(error);
    } else {
      server = serv;
      t.pass('PouchDB server setup');
    }
  });
});


tape('coinstac-database-registry integration', (t) => {
  const dbRegistry = new CoinstacDatabaseRegistry({
    isRemote: false,
    path: path.join(__dirname, '../.tmp'),
    url: 'http://localhost:5895',
  });
  const consortiaDb = dbRegistry.get('consortia');
  const doc = {
    label: '#1 Consortium',
    description: 'It\'s great!',
  };

  t.plan(2);

  t.ok(
    consortiaDb instanceof Pouchy,
    'returns Pouchy instance'
  );

  consortiaDb.save(doc)
    .then(() => consortiaDb.all())
    .then((docs) => {
      t.deepEqual(docs, [doc], 'saves document');

      return dbRegistry.destroy(true);
    })
    .catch(t.end);
});


tape('coinstac-database-registry integration teardown', (t) => {
  t.plan(1);

  server.stop(() => {
    t.pass('PouchDB server teardown');
  });
});

