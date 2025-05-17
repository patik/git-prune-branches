#!/usr/bin/env -S node

import minimist from 'minimist'
import { exec } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { exit } from 'node:process'
import FindStale from './lib/find-stale.js'
import { checkbox, confirm } from '@inquirer/prompts'

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
    boolean: ['prune', 'force', 'version'],
    alias: { p: 'prune', f: 'force', r: 'remote' },
    default: {
        remote: 'origin',
        force: false,
    },
})

const options = ['version', 'prune', 'p', 'force', 'f', 'remote', 'r', '_']
const hasInvalidParams: boolean = Object.keys(argv).some((name) => options.indexOf(name) == -1)

;(async () => {
    if (hasInvalidParams) {
        console.info('Usage: git removed-branches [-p|--prune] [-f|--force] [-r|--remote <remote>] [--version]')
        return
    }

    if (argv.version) {
        console.log(version)
        exit(0)
    }

    const obj = new FindStale({
        remove: argv.prune,
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
        const options = await obj.findStaleBranches()

        if (options.length === 0) {
            console.info('No stale branches were found')
            exit(0)
        }

        const answer = await checkbox({
            message: 'Select branches to delete',
            pageSize: 40,
            choices: options.map((value) => ({ value })),
        })

        const confirmAnswer = await confirm({
            message: `Are you sure you want to delete all ${answer.length} branche${answer.length !== 1 ? 's' : ''}?`,
            default: false,
        })

        if (confirmAnswer) {
            console.info(`Deleting ${answer.length} branches...`)
            await obj.deleteBranches(answer)
        } else {
            console.info('No branches were deleted')
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
})()
