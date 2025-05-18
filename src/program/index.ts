#!/usr/bin/env -S node

import { checkbox, confirm } from '@inquirer/prompts'
import { exit } from 'node:process'
import { bold, red, yellowBright } from 'yoctocolors'
import FindStale from '../lib/find-stale.js'
import { establishArgs } from './establish-args.js'

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

async function retryFailedDeletions() {
    console.info(
        yellowBright(
            `
⚠️ Not all branches could be removed. You may try again using ${bold('--force')}, or press Ctrl+C to cancel
`,
        ),
    )
    const branchesToRetry = await checkbox({
        message: red('Select branches to forcefully remove'),
        pageSize: 40,
        choices: worker.failedToDelete.map((value) => ({ value })),
    })

    if (branchesToRetry.length === 0) {
        console.info(`
👋 No additional branches were removed.`)
        exit(0)
    }

    const confirmRetry = skipConfirmation
        ? true
        : await confirm({
              message: `Are you sure you want to forcefully remove ${branchesToRetry.length} branch${branchesToRetry.length !== 1 ? 'es' : ''}?`,
              default: false,
          })

    if (!confirmRetry) {
        console.info(`
👋 No additional branches were removed.`)
        exit(0)
    }

    worker.setForce(true)

    await worker.deleteBranches(branchesToRetry)
}

async function firstAttempt(): Promise<void> {
    await worker.findStaleBranches()

    if (worker.staleBranches.length === 0) {
        console.info('✅ No stale branches were found')
        exit(0)
    }

    const userSelectedBranches = worker.pruneAll
        ? worker.staleBranches
        : await checkbox({
              message: 'Select branches to remove',
              pageSize: 40,
              choices: worker.staleBranches.map((value) => ({ value })),
          })
    const confirmAnswer = skipConfirmation
        ? true
        : await confirm({
              message: `Are you sure you want to remove ${userSelectedBranches.length} branch${userSelectedBranches.length !== 1 ? 'es' : ''}?`,
              default: false,
          })

    if (!confirmAnswer) {
        console.info('👋 No branches were removed.')
        exit(0)
    }

    await worker.deleteBranches(userSelectedBranches)
}

export default async function program() {
    try {
        await firstAttempt()

        if (worker.failedToDelete.length > 0) {
            await retryFailedDeletions()
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
