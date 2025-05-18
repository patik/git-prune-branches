import FindStale from '../lib/find-stale.js'
import { establishArgs } from './establish-args.js'

const argv = establishArgs()

const worker = new FindStale({
    dryRun: argv['dry-run'],
    pruneAll: argv['prune-all'],
    force: argv.force,
    remote: argv.remote,
})

const skipConfirmation = argv.yes || argv['prune-all']

export { argv, worker, skipConfirmation }
