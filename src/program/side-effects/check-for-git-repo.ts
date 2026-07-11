import { execFileSync } from 'node:child_process'

/** Error raised when the command is run outside a Git work tree. */
export class NotGitRepositoryError extends Error {
    code = 128
}

/** Ensure the current directory belongs to a Git work tree before doing any other Git work. */
export function checkForGitRepository(): void {
    try {
        const output = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' })
        if (output.trim() !== 'true') {
            throw new Error('Current directory is not a Git work tree')
        }
    } catch {
        throw new NotGitRepositoryError('Not a git repository')
    }
}
