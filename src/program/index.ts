#!/usr/bin/env -S node

import { exit } from 'node:process'
import FindStale from '../lib/find-stale.js'
import { establishArgs } from './establish-args.js'
import { firstAttempt } from './firstAttempt.js'
import { retryFailedDeletions } from './retryFailedDeletions.js'

// Side effects
import './side-effects/check-for-git-repo.js'
import './side-effects/handle-control-c.js'

const argv = establishArgs()
const skipConfirmation = argv.yes || argv['prune-all']

const worker = new FindStale({
    dryRun: argv['dry-run'],
    pruneAll: argv['prune-all'],
    force: argv.force,
    remote: argv.remote,
})

export default async function program() {
    try {
        await firstAttempt(worker, skipConfirmation)

        if (worker.failedToDelete.length > 0) {
            await retryFailedDeletions(worker, skipConfirmation)
        }
    } catch (err: unknown) {
        if (typeof err === 'object' && err) {
            if ('code' in err && typeof err.code === 'number' && err.code === 128) {
                process.stderr.write('ERROR: Not a git repository\r\n')
            } else if ('code' in err && typeof err.code === 'number' && 'message' in err && err.code === 1984) {
                process.stderr.write(`ERROR: ${err.message} \r\n`)
            } else if ('stack' in err) {
                if (err instanceof Error && err.name === 'ExitPromptError') {
                    console.log('\r\n👋 until next time!')
                    exit(0)
                }

                process.stderr.write((err.stack || err) + '\r\n')
            }
        }

        exit(1)
    }
}
