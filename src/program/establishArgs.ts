import minimist, { ParsedArgs } from 'minimist'
import { exit } from 'node:process'
import pkg from '../../package.json' with { type: 'json' }

export function establishArgs(): ParsedArgs {
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
    const hasInvalidParams = Object.keys(argv).some((name) => options.indexOf(name) === -1)

    if (hasInvalidParams) {
        console.info(
            'Usage: git prune-branches [-d|--dry-run] [-p|--prune-all] [-f|--force] [-r|--remote <remote>] [--version]',
        )
        exit(1)
    }

    if (argv.version) {
        console.log(pkg.version)
        exit(0)
    }

    return argv
}
