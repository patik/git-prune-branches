#!/usr/bin/env -S node

import { checkbox, confirm } from '@inquirer/prompts'
import minimist from 'minimist'
import { exec } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { exit } from 'node:process'
import FindStale from './lib/find-stale.js'

process.on('uncaughtException', (error) => {
    if (error instanceof Error && error.name === 'ExitPromptError') {
        console.log('👋 until next time!')
    } else {
        // Rethrow unknown errors
        throw error
    }
})

let version: string = '0.0.0'

try {
    const packageContent = readFileSync(path.join(__dirname, 'package.json'), 'utf-8')
    const info = JSON.parse(packageContent)
    version = info.version
} catch (e) {
    // do not care
}

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

const program = async () => {
    if (hasInvalidParams) {
        console.info(
            'Usage: git removed-branches [-d|--dry-run] [-p|--prune-all] [-f|--force] [-r|--remote <remote>] [--version]',
        )
        return
    }

    if (argv.version) {
        console.log(version)
        exit(0)
    }

    const obj = new FindStale({
        remove: !argv['dry-run'],
        force: argv.force,
        remote: argv.remote,
    })

    // check for git repository
    try {
        exec('git rev-parse --show-toplevel', (err) => {
            if (err) {
                process.stderr.write(err.message + '\r\n')
                exit(1)
            }
        })
        const allStaleBranches = await obj.findStaleBranches()

        if (allStaleBranches.length === 0) {
            console.info('No stale branches were found')
            exit(0)
        }

        const pruneAll = argv['prune-all']

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
                  message: `Are you sure you want to remove all ${userSelectedBranches.length} branche${userSelectedBranches.length !== 1 ? 's' : ''}?`,
                  default: false,
              })

        if (confirmAnswer) {
            console.info(
                `Removing ${userSelectedBranches.length} branch${userSelectedBranches.length !== 1 ? 'es' : ''}...`,
            )
            await obj.deleteBranches(userSelectedBranches)
        } else {
            console.info('No branches were removed.')
        }

        exit(0)
    } catch (err: unknown) {
        if (typeof err === 'object' && err) {
            if ('code' in err && typeof err.code === 'number' && err.code === 128) {
                process.stderr.write('ERROR: Not a git repository\r\n')
            } else if ('code' in err && typeof err.code === 'number' && 'message' in err && err.code === 1984) {
                process.stderr.write(`ERROR: ${err.message} \r\n`)
            } else if ('stack' in err) {
                process.stderr.write((err.stack || err) + '\r\n')
            }
        }
        exit(1)
    }
}

program()
