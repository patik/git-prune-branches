import BranchStore from '../utils/branch-store.js'
import { establishArgs } from '../utils/establish-args.js'

const argv = establishArgs()
const skipConfirmation = argv.yes || argv['prune-all']

const worker = new BranchStore({
    dryRun: argv['dry-run'],
    pruneAll: argv['prune-all'],
    force: argv.force,
    remote: argv.remote,
})

export { skipConfirmation, worker }
