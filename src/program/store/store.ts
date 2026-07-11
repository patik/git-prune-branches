import BranchStore from './BranchStore.js'

const store = new BranchStore()

/** Apply command-line configuration before the store performs any Git operations. */
export function configureStore(options: { remote: string; protected: string }): void {
    store.remote = options.remote
    store.protectedBranches = new Set(options.protected.split(',').map((branch) => branch.trim()))
    store.hasRunPreprocess = false
}

export default store
