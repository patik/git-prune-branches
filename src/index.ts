#!/usr/bin/env -S node

import fs from 'fs'
import minimist from 'minimist'
import { exec } from 'node:child_process'
import { exit } from 'node:process'
import path from 'path'
import FindStale from './lib/find-stale.js'

let version: string = '0.0.0'

try {
    const packageContent = fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8')
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
        await obj.run()
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
