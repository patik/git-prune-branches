import type { ParsedArgs } from 'minimist'
import minimist from 'minimist'
import { exit } from 'node:process'
import pkg from '../../package.json' with { type: 'json' }
import { DEFAULT_PROTECTED_BRANCHES, DEFAULT_REMOTE } from '../program/constants.js'

const VALID_OPTIONS = new Set(['version', 'help', 'remote', 'r', '_', 'protected', 'p', 'h'])
export const USAGE = 'Usage: git prune-branches [-r|--remote <remote>] [-p|--protected <branches>] [--version] [--help]'

/** Parse and validate command-line options, handling informational flags immediately. */
export function establishArgs(args: string[] = process.argv.slice(2)): ParsedArgs {
    const argv = minimist(args, {
        string: ['remote', 'protected'],
        boolean: ['version', 'help'],
        alias: { r: 'remote', p: 'protected', h: 'help' },
        default: {
            remote: DEFAULT_REMOTE,
            protected: DEFAULT_PROTECTED_BRANCHES,
        },
    })

    const hasInvalidParams = Object.keys(argv).some((name) => !VALID_OPTIONS.has(name)) || argv._.length > 0

    if (hasInvalidParams) {
        console.info(USAGE)
        exit(1)
    }

    if (argv.help) {
        console.log(USAGE)
        exit(0)
    }

    if (argv.version) {
        console.log(pkg.version)
        exit(0)
    }

    return argv
}
