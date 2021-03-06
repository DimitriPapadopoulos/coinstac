'use strict';

const Pipeline = require('./pipeline');
const http = require('http');
const socketIO = require('socket.io');
const socketIOClient = require('socket.io-client');
const _ = require('lodash');
const { promisify } = require('util');
const mkdirp = promisify(require('mkdirp'));
const path = require('path');
const Emitter = require('events');


module.exports = {

  /**
   * A pipeline manager factory, returns a manager in either a remote or local operating
   * mode that then can run and manipulate pipelines.
   * @param  {String} mode                     either local or remote
   * @param  {String} clientId                 the unique ID that identifies this manager
   * @param  {String} [operatingDirectory='./' }] the operating directory
   *                                              for results and other file IO
   * @return {Object}                          A pipeline manager
   */
  create({
    authPlugin,
    authOpts,
    clientId,
    operatingDirectory = './',
    mode,
    remotePathname = '',
    remotePort = 3300,
    remoteProtocol = 'http:',
    remoteURL = 'localhost',
    unauthHandler, // eslint-disable-line no-unused-vars
  }) {
    const activePipelines = {};
    let io;
    let socket;
    const remoteClients = {};
    const missedCache = {};

    const waitingOnForRun = (runId) => {
      const waiters = [];
      for (let [key, val] of Object.entries(remoteClients)) { // eslint-disable-line no-restricted-syntax, max-len, prefer-const
        if (val[runId] && !val[runId].currentOutput) {
          waiters.push(key);
        }
      }
      return waiters;
    };

    const aggregateRun = (runId) => {
      return _.reduce(remoteClients, (memo, client, id) => {
        if (client[runId]) {
          memo[id] = client[runId].currentOutput;
          client[runId].previousOutput = client[runId].currentOutput;
          client[runId].currentOutput = undefined;
        }
        return memo;
      }, {});
    };

    // TODO: secure socket layer
    if (mode === 'remote') {
      const app = http.createServer();
      io = socketIO(app);

      app.listen(remotePort);

      const socketServer = (socket) => {
        // TODO: not the way to do this, as runs would have to
        // always start before clients connected....
        // need proper auth
        // if (!remoteClients[socket.handshake.query.id]) {
        //   // bye 👋
        //   socket.disconnect();
        // }

        socket.emit('hello', { status: 'connected' });

        socket.on('register', (data) => {
          if (!remoteClients[data.id]) {
            remoteClients[data.id] = {};
          }
          remoteClients[data.id].status = 'connected';
          remoteClients[data.id].socketId = socket.id;
          remoteClients[data.id].lastSeen = Math.floor(Date.now() / 1000);
        });

        socket.on('run', (data) => {
          console.log(JSON.stringify(data, null, 2));
          // TODO: probably put in a 'pre-run' route?
          if (remoteClients[data.id] && remoteClients[data.id][data.runId]) {
            socket.join(data.runId);
            remoteClients[data.id].lastSeen = Math.floor(Date.now() / 1000);

            // is the client giving us an error?
            if (!data.error) {
              // has this pipeline error'd out?
              if (!activePipelines[data.runId].error) {
                remoteClients[data.id][data.runId].currentOutput = data.output.output;
                activePipelines[data.runId].state = 'recieved client data';

                const waitingOn = waitingOnForRun(data.runId);
                activePipelines[data.runId].currentState.waitingOn = waitingOn;
                activePipelines[data.runId].stateEmitter
                .emit('update',
                  Object.assign(
                    {},
                    activePipelines[data.runId].pipeline.currentState,
                    activePipelines[data.runId].currentState
                  )
                );

                if (waitingOn.length === 0) {
                  activePipelines[data.runId].state = 'recieved all clients data';
                  console.log('############ AGG');
                  const agg = aggregateRun(data.runId);
                  console.log(JSON.stringify(agg, null, 2))
                  console.log('############ END AGG');
                  activePipelines[data.runId].remote.resolve({ output: agg });
                }
              } else {
                io.of('/').to(data.runId).emit('run', { runId: data.runId, error: activePipelines[data.runId].error });
              }
            } else {
              const runError = Object.assign(
                new Error(),
                data.error,
                {
                  error: `Pipeline error from user: ${data.id}\n Error details: ${data.error.error}`,
                  message: `Pipeline error from user: ${data.id}\n Error details: ${data.error.message}`,
                }
              );
              activePipelines[data.runId].state = 'recieved client error';
              activePipelines[data.runId].error = runError;
              io.of('/').to(data.runId).emit('run', { runId: data.runId, error: runError });
              activePipelines[data.runId].remote.reject(runError);
            }
          }
        });

        socket.on('disconnect', (reason) => {
          const client = _.find(remoteClients, { socketId: socket.id });
          if (client) {
            client.status = 'disconnected';
            client.error = reason;
          }
        });
      };

      if (authPlugin) {
        io.on('connection', authPlugin.authorize(authOpts))
        .on('authenticated', socketServer);
      } else {
        io.on('connection', socketServer);
      }
    } else {
      socket = socketIOClient(`${remoteProtocol}//${remoteURL}:${remotePort}${remotePathname}?id=${clientId}`);
      socket.on('hello', () => {
        socket.emit('register', { id: clientId });
      });
      socket.on('run', (data) => {
        // TODO: step check?
        if (!data.error && activePipelines[data.runId]) {
          activePipelines[data.runId].state = 'recieved central node data';
          activePipelines[data.runId].remote.resolve(data.output);
        } else if (data.error && activePipelines[data.runId]) {
          activePipelines[data.runId].state = 'recieved error';
          activePipelines[data.runId].remote.reject(Object.assign(new Error(), data.error));
        }
      });
    }


    return {
      activePipelines,
      clientId,
      io,
      mode,
      operatingDirectory,
      remoteClients,
      socket,

      /**
       * Starts a pipeline given a pipeline spec, client list and unique ID
       * for that pipeline. The return object is that pipeline and a promise that
       * resolves to the final output of the pipeline.
       * @param  {Object} spec         a valid pipeline specification
       * @param  {Array}  [clients=[]] a list of client IDs particapating in pipeline
       *                               only necessary for decentralized runs
       * @param  {String} runId        unique ID for the pipeline
       * @return {Object}              an object containing the active pipeline and
       *                               Promise for its result
       */
      startPipeline({ spec, clients = [], runId }) {
        activePipelines[runId] = {
          state: 'created',
          pipeline: Pipeline.create(spec, runId, { mode, operatingDirectory, clientId }),
          stateEmitter: new Emitter(),
          currentState: {},
        };
        clients.forEach((client) => {
          remoteClients[client] = Object.assign(
            {
              status: 'unregistered',
              [runId]: {},
            },
            remoteClients[client]
          );
        });

        const communicate = (pipeline, message) => {
          // hold the last step for drops, this only works for one step out
          missedCache[pipeline.id] = {
            pipelineStep: pipeline.currentStep,
            controllerStep: pipeline.pipelineSteps[pipeline.currentStep].controllerState.iteration,
            output: message,
          };
          if (mode === 'remote') {
            if (message instanceof Error) {
              const runError = Object.assign(
                message,
                {
                  error: `Pipeline error from central node\n Error details: ${message.error}`,
                  message: `Pipeline error from central node\n Error details: ${message.message}`,
                }
              );
              activePipelines[pipeline.id].state = 'central node error';
              activePipelines[pipeline.id].error = runError;
              activePipelines[pipeline.id].remote.reject(runError);
              io.of('/').to(pipeline.id).emit('run', { runId: pipeline.id, error: runError });
            } else {
              console.log('############ REMOTE OUT');
              console.log(JSON.stringify(message, null, 2))
              console.log('############ END REMOTE OUT');
              io.of('/').to(pipeline.id).emit('run', { runId: pipeline.id, output: message });
            }
          } else {
            if (message instanceof Error) { // eslint-disable-line no-lonely-if
              socket.emit('run', { id: clientId, runId: pipeline.id, error: message });
            } else {
              socket.emit('run', { id: clientId, runId: pipeline.id, output: message });
            }
          }
        };

        const remoteHandler = ({ input, noop, transmitOnly }) => {
          let proxRes;
          let proxRej;

          const prom = new Promise((resolve, reject) => {
            proxRes = resolve;
            proxRej = reject;
          });
          activePipelines[runId].state = 'waiting for remote';
          activePipelines[runId].remote = {
            resolve: proxRes,
            reject: proxRej,
          };
          if (!noop) {
            if (transmitOnly) {
              proxRes();
            }
            communicate(activePipelines[runId].pipeline, input);
          }
          return prom;
        };

        const pipelineProm = Promise.all([
          mkdirp(path.resolve(operatingDirectory, clientId, runId)),
          mkdirp(path.resolve(operatingDirectory, 'output', clientId, runId)),
          mkdirp(path.resolve(operatingDirectory, 'cache', clientId, runId)),
        ])
        .catch((err) => {
          throw new Error(`Unable to create pipeline directories: ${err}`);
        })
        .then(() => {
          activePipelines[runId].state = 'running';

          this.activePipelines[runId].pipeline.stateEmitter.on('update',
            data => this.activePipelines[runId].stateEmitter
              .emit('update', Object.assign({}, data, activePipelines[runId].currentState)));

          return activePipelines[runId].pipeline.run(remoteHandler)
          .then((res) => {
            activePipelines[runId].state = 'finished';
            return res;
          });
        });

        return {
          pipeline: activePipelines[runId].pipeline,
          result: pipelineProm,
          stateEmitter: activePipelines[runId].stateEmitter,
        };
      },
      getPipelineStateListener(runId) {
        if (!this.activePipelines[runId]) {
          throw new Error('invalid pipeline ID');
        }

        return this.activePipelines[runId].stateEmitter;
      },
      waitingOnForRun,
    };
  },
};
