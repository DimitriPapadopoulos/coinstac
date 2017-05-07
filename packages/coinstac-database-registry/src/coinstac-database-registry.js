'use strict';

const PouchDBAdapterMemory = require('pouchdb-adapter-memory');
const pouchy = require('./pouchy.js');
const os = require('os');
const path = require('path');
const url = require('url');

pouchy.Pouchy.plugin(PouchDBAdapterMemory);

/**
 * COINSTAC database registry.
 *
 * @param {Object} options
 * @param {Object} options.auth Authentication passed to PouchDB's `ajax`
 * property. {@link https://pouchdb.com/api.html#create_database}
 * @param {string} options.auth.password Password for HTTP authentication
 * @param {string} options.auth.username Username for HTTP authentication
 * @param {boolean} [options.isRemote=false]
 * @param {string} options.path Full path for local LevelDB storage
 * @param {string} options.url Base URL for remote databases
 * @property {Map} databases Collection of registered databases
 */
class CoinstacDatabaseRegistry {
  /**
   * COINSTAC database registry factory.
   * @static
   *
   * @todo Don't hard-code URLs to `http://localhost:5984` or
   * `https://coinstac.mrn.org`.
   *
   * @param {Object} options
   * @param {Object} [options.auth] Plain HTTP authentication credentials. Only
   * necessary if `isRemote` is `false`
   * @param {boolean} [options.isRemote=false]
   * @param {string} [options.username] Client's username for isolating locally
   * stored database files per user. Only necessary if `isRemote` is `false`.
   * @returns {CoinstacDatabaseRegistry}
   */
  static factory({ auth, isRemote, username }) {
    if (!isRemote) {
      return new CoinstacDatabaseRegistry({
        auth,
        isRemote: false,
        path: path.join(os.homedir(), `/.coinstac/${username}/dbs`),
        url: process.env.NODE_ENV === 'production' ?
          'https://coinstac.mrn.org' :
          'http://localhost:5984',
      });
    }

    const dbURL = auth && auth.username && auth.password ?
      `http://${auth.username}:${auth.password}@localhost:5984` :
      'http://localhost:5984';

    return new CoinstacDatabaseRegistry({
      isRemote: true,
      path: path.join(os.tmpdir(), '/coinstac/dbs'),
      url: dbURL,
    });
  }

  /**
   * Get sync settings passed to PouchDB's `PouchDB#changes` API.
   * @static
   * @private
   *
   * {@link https://pouchdb.com/api.html#create_database}
   *
   * @returns {Object}
   */
  static getSyncSettings() {
    return {
      heartbeat: 5000,
      live: true,
      retry: true,
    };
  }

  constructor(options) {
    this.auth = options.auth;
    this.databases = new Map();
    this.isRemote = options.isRemote;
    this.path = options.path;
    this.url = options.url;
  }

  /**
   * Destroy instance.
   *
   * @param {boolean} [deleteDatabases=false]
   * @returns {Promise}
   */
  destroy(deleteDatabases) {
    return Promise.all(Array.from(this.databases).map(([name, database]) => {
      const remove = () => this.databases.delete(name);

      return deleteDatabases ?
        database.destroy().then(remove) :
        remove();
    }));
  }

  /**
   * Get a database by name.
   *
   * @param {string} name
   * @returns {Pouchy}
   */
  get(name) {
    if (this.databases.has(name)) {
      return this.databases.get(name);
    }

    const config = {
      path: this.path,
      pouchConfig: {
        adapter: 'memory',
      },
    };
    let replicateKey;

    /**
     * @todo Make Pouchy configuration itself configurable in via the
     * constructor.
     */
    if (this.isRemote) {
      // Remote (server) config
      config.pouchConfig.adapter = 'leveldb';

      if (name.includes('local-consortium-')) {
        replicateKey = 'in';
      } else if (
        name === 'computations' ||
        name.includes('remote-consortium-')
      ) {
        replicateKey = 'out';
      } else {
        replicateKey = 'sync';
      }
    } else {
      // Local (client) config
      if (name === 'consortia') {
        replicateKey = 'sync';
      } else if (
        name === 'computations' ||
        name.includes('remote-consortium-')
      ) {
        replicateKey = 'in';
      } else {
        config.pouchConfig.adapter = 'leveldb';

        if (name.includes('local-consortium-')) {
          replicateKey = 'out';
        }
      }
    }

    if (replicateKey) {
      if (this.auth) {
        config.pouchConfig.ajax = this.auth;
      }

      config.replicate = {
        [replicateKey]: CoinstacDatabaseRegistry.getSyncSettings(),
      };
      config.url = url.resolve(this.url, name);
    }

    const database = new pouchy.Pouchy(config);

    this.databases.set(name, database);

    return database;
  }
}

CoinstacDatabaseRegistry.Pouchy = pouchy.Pouchy;

module.exports = CoinstacDatabaseRegistry;
