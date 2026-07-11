import { execFileSync } from 'node:child_process'

/** Error raised when the command is run outside a Git work tree. */
export class NotGitRepositoryError extends Error {
    code = 128
}

/** Ensure the current directory belongs to a Git work tree before doing any other Git work. */
export function checkForGitRepository(): void {
    try {
        execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' })
    } catch {
        throw new NotGitRepositoryError('Not a git repository')
    }
}
