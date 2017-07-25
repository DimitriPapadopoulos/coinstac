'use strict';

const Computation = require('./computation.js');
const joi = require('joi');
const dockerManager = require('../../services/docker-manager.js');

/**
 * @class DockerComputation
 * @constructor
 * @extends Computation
 * @property {function} name docker image name
 * @property {string} type always "function"
 */
class DockerComputation extends Computation {
  /**
   * @description run a docker computation
   * @param {object} opts
   * @returns {Promise}
   */
  run(opts) {
    return dockerManager.queueJob(opts);
  }
}

DockerComputation.schema = Object.assign({
  fn: joi.func().arity(1).required(),
  type: joi.string().valid('function').required(),
}, Computation.schema);

module.exports = DockerComputation;
