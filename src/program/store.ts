import BranchStore from '../utils/BranchStore.js'
import { establishArgs } from '../utils/establish-args.js'

const argv = establishArgs()

export default new BranchStore({
    dryRun: argv['dry-run'],
    pruneAll: argv['prune-all'],
    force: argv.force,
    remote: argv.remote,
    skipConfirmation: argv.yes || argv['prune-all'],
})
