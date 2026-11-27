// Experiment 03A public surface.
export {loadExperiment, compileExperiment} from './compile.mjs';
export {traverse, contextExecutor} from './traverse.mjs';
export {compileContext} from './context.mjs';
export {resolveContext, checkBindings} from './resolve.mjs';
export {audit, isContextual, ContextError, NAMESPACE} from './boundary.mjs';
export {BridgeError} from '../bridge-conditional/bridge.mjs';
