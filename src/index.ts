#!/usr/bin/env -S node

import { checkbox, confirm } from '@inquirer/prompts'
import minimist from 'minimist'
import { exec } from 'node:child_process'
import { exit } from 'node:process'
import { bold, red } from 'yoctocolors'
import pkg from '../package.json' with { type: 'json' }
import FindStale from './lib/find-stale.js'

process.on('uncaughtException', (error) => {
    if (error instanceof Error && error.name === 'ExitPromptError') {
        console.log('👋 until next time!')
    } else {
        // Rethrow unknown errors
        throw error
    }
})

const argv = minimist(process.argv, {
    string: 'remote',
    boolean: ['dry-run', 'prune-all', 'force', 'version'],
    alias: { d: 'dry-run', p: 'prune-all', f: 'force', r: 'remote' },
    default: {
        remote: 'origin',
        force: false,
    },
})

const options = ['version', 'dry-run', 'd', 'prune-all', 'p', 'force', 'f', 'remote', 'r', '_']
const hasInvalidParams: boolean = Object.keys(argv).some((name) => options.indexOf(name) == -1)

const obj = new FindStale({
    remove: !argv['dry-run'],
    force: argv.force,
    remote: argv.remote,
})
const pruneAll = argv['prune-all']

const retry = async ({ obj, failed, pruneAll }: { obj: FindStale; failed: string[]; pruneAll: boolean }) => {
    console.info(
        `
⚠️ Not all branches could be removed. You may try again using ${bold('--force')}, or press Ctrl+C to cancel
`,
    )
    const branchesToRetry = await checkbox({
        message: red('Select branches to forcefully remove'),
        pageSize: 40,
        choices: failed.map((value) => ({ value })),
    })

    if (branchesToRetry.length === 0) {
        console.info(`
👋 No additional branches were removed.`)
        exit(0)
    }

    const confirmRetry = pruneAll
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

    obj.setForce(true)

    await obj.deleteBranches(branchesToRetry)
}

const firstAttempt = async ({ obj, pruneAll }: { obj: FindStale; pruneAll: boolean }): Promise<Array<string>> => {
    const allStaleBranches = await obj.findStaleBranches()

    if (allStaleBranches.length === 0) {
        console.info('✅ No stale branches were found')
        exit(0)
    }

    const userSelectedBranches = pruneAll
        ? allStaleBranches
        : await checkbox({
              message: 'Select branches to remove',
              pageSize: 40,
              choices: allStaleBranches.map((value) => ({ value })),
          })
    const confirmAnswer = pruneAll
        ? true
        : await confirm({
              message: `Are you sure you want to remove ${userSelectedBranches.length} branch${userSelectedBranches.length !== 1 ? 'es' : ''}?`,
              default: false,
          })

    if (!confirmAnswer) {
        console.info('👋 No branches were removed.')
        exit(0)
    }

    console.info(`Removing ${userSelectedBranches.length} branch${userSelectedBranches.length !== 1 ? 'es' : ''}...`)

    const failed = await obj.deleteBranches(userSelectedBranches)

    return failed
}

const program = async () => {
    if (hasInvalidParams) {
        console.info(
            'Usage: git prune-branches [-d|--dry-run] [-p|--prune-all] [-f|--force] [-r|--remote <remote>] [--version]',
        )
        return
    }

    if (argv.version) {
        console.log(pkg.version)
        exit(0)
    }

    // check for git repository
    exec('git rev-parse --show-toplevel', (err) => {
        if (err) {
            process.stderr.write(err.message + '\r\n')
            exit(1)
        }
    })

    try {
        const failed = await firstAttempt({ obj, pruneAll })

        if (failed.length > 0) {
            await retry({ obj, failed, pruneAll })
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

program()
