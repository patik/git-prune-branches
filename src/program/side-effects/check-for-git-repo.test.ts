import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkForGitRepository, NotGitRepositoryError } from './check-for-git-repo.js'

describe('checkForGitRepository', () => {
    const originalCwd = process.cwd()

    afterEach(() => {
        process.chdir(originalCwd)
    })

    it('should accept a Git work tree', () => {
        const workingDirectory = mkdtempSync(path.join(os.tmpdir(), 'git-prune-branches-worktree-'))
        execFileSync('git', ['init', '--initial-branch=main'], { cwd: workingDirectory })
        process.chdir(workingDirectory)

        expect(checkForGitRepository).not.toThrow()
    })

    it('should reject a bare Git repository', () => {
        const bareDirectory = mkdtempSync(path.join(os.tmpdir(), 'git-prune-branches-bare-'))
        execFileSync('git', ['init', '--bare'], { cwd: bareDirectory })
        process.chdir(bareDirectory)

        expect(checkForGitRepository).toThrow(NotGitRepositoryError)
    })
})
