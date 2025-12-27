import minimist, { ParsedArgs } from 'minimist'
import { exit } from 'node:process'
import pkg from '../../package.json' with { type: 'json' }
import { defaultProtectedBranches, defaultRemote } from '../program/constants.js'

const options = ['version', 'remote', 'r', '_', 'protected']

export function establishArgs(): ParsedArgs {
    const argv = minimist(process.argv, {
        string: 'remote',
        boolean: ['version'],
        alias: { r: 'remote' },
        default: {
            remote: defaultRemote,
            protected: defaultProtectedBranches,
        },
    })

    const hasInvalidParams = Object.keys(argv).some((name) => options.indexOf(name) === -1)

    if (hasInvalidParams) {
        console.info('Usage: git prune-branches [-r|--remote <remote>] [--version]')
        exit(1)
    }

    if (argv.version) {
        console.log(pkg.version)
        exit(0)
    }

    return argv
}
