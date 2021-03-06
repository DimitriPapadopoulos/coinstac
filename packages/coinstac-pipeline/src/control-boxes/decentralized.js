'use strict';

module.exports = {
  preIteration(controllerState) {
    if (controllerState.currentOutput
      && controllerState.currentOutput.success
      && controllerState.mode === 'remote') {
      return 'doneRemote';
    } else if (controllerState.currentOutput && controllerState.currentOutput.success) {
      return 'done';
    } else if (controllerState.remoteInitial) {
      return 'firstServerRemote';
    } else if (controllerState.state === 'finished iteration'
    || controllerState.state === 'finished iteration with error') {
      return 'remote';
    }
    return 'nextIteration';
  },
};
