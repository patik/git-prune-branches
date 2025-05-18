#!/usr/bin/env -S node

import { checkbox, confirm } from '@inquirer/prompts'
import { exec } from 'node:child_process'
import { exit } from 'node:process'
import { bold, red, yellowBright } from 'yoctocolors'
import FindStale from '../lib/find-stale.js'
import { establishArgs } from './establishArgs.js'

// Side effects
import './handle-control-c.js'

const argv = establishArgs()

const worker = new FindStale({
    dryRun: argv['dry-run'],
    pruneAll: argv['prune-all'],
    force: argv.force,
    remote: argv.remote,
})

async function retry() {
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

    const confirmRetry = worker.pruneAll
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
    const allStaleBranches = await worker.findStaleBranches()

    if (allStaleBranches.length === 0) {
        console.info('✅ No stale branches were found')
        exit(0)
    }

    const userSelectedBranches = worker.pruneAll
        ? allStaleBranches
        : await checkbox({
              message: 'Select branches to remove',
              pageSize: 40,
              choices: allStaleBranches.map((value) => ({ value })),
          })
    const confirmAnswer = worker.pruneAll
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
    // check for git repository
    exec('git rev-parse --show-toplevel', (err) => {
        if (err) {
            process.stderr.write(err.message + '\r\n')
            exit(1)
        }
    })

    try {
        await firstAttempt()

        if (worker.failedToDelete.length > 0) {
            await retry()
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
