const rethink = require('rethinkdb');
const Boom = require('boom');
const GraphQLJSON = require('graphql-type-json');
const helperFunctions = require('../auth-helpers');

/* eslint-disable */
const resolvers = {
  JSON: GraphQLJSON,
  Query: {
    /**
     * Returns all computations. Checks user permissions retrieved from JWT middleware validateFunc.
     */
    fetchAllComputations: ({ auth: { credentials: { permissions } } }, _) => {
      if (!permissions.computations.read) {
        return Boom.forbidden('Action not permitted');
      }

      return helperFunctions.getRethinkConnection()
        .then((connection) =>
          rethink.table('computations').run(connection)
        )
        .then((cursor) => cursor.toArray())
        .then((result) => result);
    },
    /**
     * Returns metadata for specific computation name
     */
    fetchComputation: ({ auth: { credentials: { permissions } } }, args) => {
      if (!permissions.computations.read) {
        return Boom.forbidden('Action not permitted');
      }

      return helperFunctions.getRethinkConnection()
        .then((connection) =>
          rethink.table('computations').filter({ meta: { name: args.computationName } })
            .run(connection)
        )
        .then((cursor) => cursor.toArray())
        .then((result) => result[0]);
    },
    validateComputation: (_, args) => {
      return new Promise();
    },
    fetchConsortiumById: (_, args) => {
      return new Promise();
    },
    fetchRunForConsortium: (_, args) => {
      return new Promise();
    },
    fetchRunForUser: (_, args) => {
      return new Promise();
    },
    fetchRunById: () => {
      return new Promise();
    },
  },
  Mutation: {
    /**
     * Add computation to RethinkDB
     */
    addComputation: ({ auth: { credentials: { permissions } } }, args) => {
      if (!permissions.computations.write) {
        return Boom.forbidden('Action not permitted');
      }

      return helperFunctions.getRethinkConnection()
        .then((connection) =>
          rethink.table('computations').insert(
            args.computationSchema,
            { 
              conflict: "replace",
              returnChanges: true,
            }
          )
          .run(connection)
        )
        .then((result) => {
          return result.changes[0].new_val;
        })
    },
    removeComputation: (_, args) => {
      return new Promise();
    },
    deleteConsortiumById: (_, args) => {
      return new Promise();
    },
    joinConsortium: (_, args) => {
      return new Promise();
    },
    setActiveComputation: (_, args) => {
      return new Promise();
    },
    setComputationInputs: (_, args) => {
      return new Promise();
    },
    leaveConsortium: (_, args) => {
      return new Promise();
    },
    saveConsortium: (_, args) => {
      return new Promise();
    },
  },
};

module.exports = resolvers;