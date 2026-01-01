import type { ParsedArgs } from 'minimist'
import minimist from 'minimist'
import { exit } from 'node:process'
import pkg from '../../package.json' with { type: 'json' }
import { defaultProtectedBranches, defaultRemote } from '../program/constants.js'

const options = ['version', 'remote', 'r', '_', 'protected', 'p']

export function establishArgs(): ParsedArgs {
    const argv = minimist(process.argv, {
        string: ['remote', 'protected'],
        boolean: ['version'],
        alias: { r: 'remote', p: 'protected' },
        default: {
            remote: defaultRemote,
            protected: defaultProtectedBranches,
        },
    })

    const hasInvalidParams = Object.keys(argv).some((name) => options.indexOf(name) === -1)

    if (hasInvalidParams) {
        console.info('Usage: git prune-branches [-r|--remote <remote>] [-p|--protected <branches>] [--version]')
        exit(1)
    }

    if (argv.version) {
        console.log(pkg.version)
        exit(0)
    }

    return argv
}
