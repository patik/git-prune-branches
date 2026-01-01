import child_process from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'

let tempdir: string = process.env.TEMP_DIR || ''
let workingDir: string = ''

// Helper function to execute git commands with a specific date
const execWithDate = (command: string, daysAgo: number, options: { cwd: string }): Buffer => {
    const date = new Date()
    date.setDate(date.getDate() - daysAgo)
    const dateStr = date.toISOString()

    const env = {
        ...process.env,
        GIT_AUTHOR_DATE: dateStr,
        GIT_COMMITTER_DATE: dateStr,
    }

    return child_process.execSync(command, { ...options, env })
}

export const testSetup = (): string => {
    if (isCI) {
        try {
            child_process.execSync('git config --global user.email "ci@example.com"')
            child_process.execSync('git config --global user.name "CI User"')
        } catch (error) {
            console.warn('Failed to configure git user:', error)
        }
    }

    if (!tempdir) {
        const tmp = os.tmpdir()
        tempdir = mkdtempSync(`${tmp + path.sep}git-prune-branches-`)
    } else {
        // In CI, ensure the temp directory exists and create our subdirectory
        tempdir = mkdtempSync(`${tempdir + path.sep}git-prune-branches-`)
    }

    const bareDir = `${tempdir + path.sep}bare`
    workingDir = `${tempdir + path.sep}working`

    const file = `${workingDir}${path.sep}lolipop`

    mkdirSync(bareDir)

    console.log(`Using temp dir "${tempdir}"`)

    // create bare repository
    child_process.execSync('git init --bare --initial-branch=main', { cwd: bareDir })

    // clone repository
    child_process.execSync('git clone bare working', { cwd: tempdir })

    // create initial commit (28 days ago)
    writeFileSync(file, 'lolipop content')
    child_process.execSync('git add lolipop', { cwd: workingDir })
    execWithDate('git commit -m "initial commit"', 28, { cwd: workingDir })

    // Simple feature branch - merged, remote deleted (recent: 3 hours ago)
    child_process.execSync('git checkout -b feature/user-avatars', { cwd: workingDir })
    writeFileSync(file, 'user avatars feature')
    execWithDate('git commit -a -m "add user avatars"', 0.125, { cwd: workingDir }) // 0.125 days = 3 hours
    child_process.execSync('git checkout main', { cwd: workingDir })
    execWithDate('git merge feature/user-avatars', 0.125, { cwd: workingDir })

    // Deep nested path (tests multiple slashes in branch name)
    child_process.execSync('git branch feature/payments/stripe/webhooks', { cwd: workingDir })

    // Release branch with version (dots are common)
    child_process.execSync('git branch release/v2.1.0', { cwd: workingDir })

    // Branch with special character (issue number)
    child_process.execSync('git branch "fix/#432-modal-close"', { cwd: workingDir })

    // Branch with different local/remote name - remote deleted (can be soft removed)
    child_process.execSync('git branch feature/dark-mode', { cwd: workingDir })

    // Branch with different local/remote name - remote NOT deleted (info only)
    child_process.execSync('git branch bugfix/cache-invalidation', { cwd: workingDir })

    // Unmerged branch with commits - needs force delete
    child_process.execSync('git branch experiment/graphql-api', { cwd: workingDir })

    // checkout working branch for unmerged commits
    child_process.execSync('git checkout experiment/graphql-api', { cwd: workingDir })

    // update file content (14 days ago)
    writeFileSync(file, 'lolipop content changed')
    execWithDate('git commit -a -m "second commit"', 14, { cwd: workingDir })

    // Local-only branch with commits, not merged (needs force) (7 days ago)
    child_process.execSync('git checkout -b wip/settings-redesign', { cwd: workingDir })
    writeFileSync(file, 'local only branch content')
    execWithDate('git commit -a -m "local only commit"', 7, { cwd: workingDir })

    // Local-only branch that IS merged into main (safe to delete) (5 days ago)
    child_process.execSync('git checkout main', { cwd: workingDir })
    child_process.execSync('git checkout -b chore/update-deps', { cwd: workingDir })
    writeFileSync(file, 'local merged branch content')
    execWithDate('git commit -a -m "local merged commit"', 5, { cwd: workingDir })
    child_process.execSync('git checkout main', { cwd: workingDir })
    execWithDate('git merge chore/update-deps', 5, { cwd: workingDir })

    // Typical PR workflow: create, push, merge via GitHub, remote deleted (3 days ago)
    child_process.execSync('git checkout -b feature/search-filters', { cwd: workingDir })
    writeFileSync(file, 'PR branch content')
    execWithDate('git commit -a -m "PR commit"', 3, { cwd: workingDir })
    child_process.execSync('git checkout main', { cwd: workingDir })
    execWithDate('git merge feature/search-filters', 3, { cwd: workingDir })

    // Protected branch (develop) - should be excluded from deletion (2 days ago)
    child_process.execSync('git checkout -b develop', { cwd: workingDir })
    writeFileSync(file, 'develop branch content')
    execWithDate('git commit -a -m "develop commit"', 2, { cwd: workingDir })
    child_process.execSync('git checkout main', { cwd: workingDir })
    execWithDate('git merge develop', 2, { cwd: workingDir })

    // Push all branches to remote
    child_process.execSync('git push origin -u main', { cwd: workingDir })
    child_process.execSync('git push origin -u feature/user-avatars', { cwd: workingDir })
    child_process.execSync('git push origin -u feature/payments/stripe/webhooks', { cwd: workingDir })
    child_process.execSync('git push origin -u release/v2.1.0', { cwd: workingDir })
    child_process.execSync('git push origin -u "fix/#432-modal-close"', { cwd: workingDir })
    // Push with different remote name
    child_process.execSync('git push origin -u feature/dark-mode:feature/ui-dark-theme', { cwd: workingDir })
    child_process.execSync('git push origin -u bugfix/cache-invalidation:hotfix/cache-fix', { cwd: workingDir })
    child_process.execSync('git push origin -u experiment/graphql-api', { cwd: workingDir })
    child_process.execSync('git push origin -u feature/search-filters', { cwd: workingDir })
    child_process.execSync('git push origin -u develop', { cwd: workingDir })

    // Push merged main (simulating GitHub PR merge)
    child_process.execSync('git push origin main', { cwd: workingDir })

    // Delete branches from remote (simulating PR merges or cleanup)
    child_process.execSync('git push origin :feature/user-avatars', { cwd: workingDir })
    child_process.execSync('git push origin :feature/payments/stripe/webhooks', { cwd: workingDir })
    child_process.execSync('git push origin :release/v2.1.0', { cwd: workingDir })
    child_process.execSync('git push origin :experiment/graphql-api', { cwd: workingDir })
    child_process.execSync('git push origin :"fix/#432-modal-close"', { cwd: workingDir })
    child_process.execSync('git push origin :feature/ui-dark-theme', { cwd: workingDir })
    child_process.execSync('git push origin :feature/search-filters', { cwd: workingDir })
    child_process.execSync('git push origin :develop', { cwd: workingDir })

    // checkout main branch
    child_process.execSync('git checkout main', { cwd: workingDir })

    return workingDir
}
