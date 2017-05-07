'use strict';

const CoinstacDatabaseRegistry =
  require('../src/coinstac-database-registry.js');
const os = require('os');
const path = require('path');
const pouchy = require('../src/pouchy.js');
const sinon = require('sinon');
const tape = require('tape');

const factory = () => new CoinstacDatabaseRegistry({
  auth: {
    password: 'password',
    username: 'username',
  },
  isRemote: false,
  path: path.join(__dirname, '../.tmp'),
  url: 'http://localhost:5985',
});

tape('coinstac-database-registry factory remote', (t) => {
  const dbRegistry = CoinstacDatabaseRegistry.factory({
    auth: {
      password: 'bananas',
      username: 'mangos',
    },
    isRemote: true,
  });

  t.ok(
    dbRegistry instanceof CoinstacDatabaseRegistry,
    'returns CoinstacDatabaseRegistry instance'
  );
  t.ok(dbRegistry.isRemote, 'sets isRemote property');
  t.ok(
    dbRegistry.path.indexOf(os.tmpdir()) === 0,
    'configures path to system temporary directory'
  );
  t.equal(
    dbRegistry.url,
    'http://mangos:bananas@localhost:5984',
    'sets URL with HTTP authentication'
  );

  t.end();
});

tape('coinstac-database-registry factory local', (t) => {
  const auth = {
    password: 'oranges',
    username: 'blueberries',
  };
  const dbRegistry = CoinstacDatabaseRegistry.factory({
    auth,
  });

  t.equal(dbRegistry.auth, auth, 'sets auth property');
  t.notOk(dbRegistry.isRemote, 'doesn\'t set isRemote property');
  t.ok(
    dbRegistry.path.indexOf(os.homedir()) === 0,
    'configures path to user\'s home directory'
  );
  t.equal(dbRegistry.url, 'http://localhost:5984', 'sets URL');

  t.end();
});

tape('coinstac-database-registry getSyncSettings', (t) => {
  t.ok(
    typeof CoinstacDatabaseRegistry.getSyncSettings() === 'object',
    'returns sync object'
  );
  t.end();
});

tape('coinstac-database-registry destroy', (t) => {
  const dbRegistry = factory();
  const dbStubs = [{
    destroy: sinon.stub().returns(Promise.resolve()),
    name: 'test-1',
  }, {
    destroy: sinon.stub().returns(Promise.resolve()),
    name: 'test-2',
  }];

  const addStubs = () => dbStubs.forEach((dbStub) => {
    dbRegistry.databases.set(dbStub.name, dbStub);
  });

  addStubs();

  t.plan(3);

  dbRegistry.destroy()
    .then(() => {
      t.notOk(
        dbRegistry.databases.size,
        'clears databases from internal store'
      );
      t.ok(
        dbStubs.every(({ destroy }) => !destroy.called),
        'doesn\'t destroy Pouchy instances'
      );

      addStubs();

      return dbRegistry.destroy(true);
    })
    .then(() => {
      t.ok(
        dbStubs.every(({ destroy }) => destroy.called),
        'destroyes Pouchy instances'
      );
    })
    .catch(t.end);
});

tape('coinstac-database-registry get', (t) => {
  const dbRegistry = factory();
  const mockPouchy = {};
  const pouchyStub = sinon.stub(pouchy, 'Pouchy').returns(mockPouchy);

  t.equal(
    dbRegistry.get('consortia'),
    mockPouchy,
    'returns a Pouchy instance'
  );
  t.ok(
    dbRegistry.databases.has('consortia'),
    'caches Pouchy instance'
  );

  pouchyStub.restore();

  t.end();
});

tape('coinstac-database-registry get config', (t) => {
  const ajax = {
    password: 'wholesome',
    username: 'memes',
  };
  const dbUrl = 'http://localhost:5985';
  const dbPath = path.join(__dirname, '../.tmp');
  const databases = {
    computations: {
      local: {
        path: dbPath,
        pouchConfig: {
          adapter: 'memory',
          ajax,
        },
        replicate: {
          in: CoinstacDatabaseRegistry.getSyncSettings(),
        },
        url: `${dbUrl}/computations`,
      },
      remote: {
        path: dbPath,
        pouchConfig: {
          adapter: 'leveldb',
        },
        replicate: {
          out: CoinstacDatabaseRegistry.getSyncSettings(),
        },
        url: `${dbUrl}/computations`,
      },
    },
    consortia: {
      local: {
        path: dbPath,
        pouchConfig: {
          adapter: 'memory',
          ajax,
        },
        replicate: {
          sync: CoinstacDatabaseRegistry.getSyncSettings(),
        },
        url: `${dbUrl}/consortia`,
      },
      remote: {
        path: dbPath,
        pouchConfig: {
          adapter: 'leveldb',
        },
        replicate: {
          sync: CoinstacDatabaseRegistry.getSyncSettings(),
        },
        url: `${dbUrl}/consortia`,
      },
    },
    'local-consortium-123': {
      local: {
        path: dbPath,
        pouchConfig: {
          adapter: 'leveldb',
          ajax,
        },
        replicate: {
          out: CoinstacDatabaseRegistry.getSyncSettings(),
        },
        url: `${dbUrl}/local-consortium-123`,
      },
      remote: {
        path: dbPath,
        pouchConfig: {
          adapter: 'leveldb',
        },
        replicate: {
          in: CoinstacDatabaseRegistry.getSyncSettings(),
        },
        url: `${dbUrl}/local-consortium-123`,
      },
    },
    'remote-consortium-456': {
      local: {
        path: dbPath,
        pouchConfig: {
          adapter: 'memory',
          ajax,
        },
        replicate: {
          in: CoinstacDatabaseRegistry.getSyncSettings(),
        },
        url: `${dbUrl}/remote-consortium-456`,
      },
      remote: {
        path: dbPath,
        pouchConfig: {
          adapter: 'leveldb',
        },
        replicate: {
          out: CoinstacDatabaseRegistry.getSyncSettings(),
        },
        url: `${dbUrl}/remote-consortium-456`,
      },
    },
    projects: {
      local: {
        path: dbPath,
        pouchConfig: {
          adapter: 'leveldb',
        },
      },
      remote: {
        path: dbPath,
        pouchConfig: {
          adapter: 'leveldb',
        },
        replicate: {
          sync: CoinstacDatabaseRegistry.getSyncSettings(),
        },
        url: `${dbUrl}/projects`,
      },
    },
  };
  const localDbRegistry = new CoinstacDatabaseRegistry({
    auth: ajax,
    isRemote: false,
    path: dbPath,
    url: dbUrl,
  });
  const remoteDbRegistry = new CoinstacDatabaseRegistry({
    isRemote: true,
    path: dbPath,
    url: dbUrl,
  });
  const pouchyStub = sinon.stub(pouchy, 'Pouchy');

  Object.keys(databases).forEach((name) => {
    localDbRegistry.get(name);

    t.deepEqual(
      pouchyStub.lastCall.args[0],
      databases[name].local,
      `local config for "${name}" database`
    );

    remoteDbRegistry.get(name);

    t.deepEqual(
      pouchyStub.lastCall.args[0],
      databases[name].remote,
      `remote config for "${name}" database`
    );
  });

  pouchyStub.restore();

  t.end();
});
