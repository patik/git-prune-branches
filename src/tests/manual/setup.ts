import child_process from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'

let tempdir: string = process.env.TEMP_DIR || ''
let workingDir: string = ''

export const testSetup = () => {
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
        tempdir = mkdtempSync(tmp + path.sep + 'git-prune-branches-')
    } else {
        // In CI, ensure the temp directory exists and create our subdirectory
        tempdir = mkdtempSync(tempdir + path.sep + 'git-prune-branches-')
    }

    const bareDir = tempdir + path.sep + 'bare'
    workingDir = tempdir + path.sep + 'working'

    const file = `${workingDir}${path.sep}lolipop`

    mkdirSync(bareDir)

    console.log(`Using temp dir "${tempdir}"`)

    // create bare repository
    child_process.execSync('git init --bare --initial-branch=main', { cwd: bareDir })

    // clone repository
    child_process.execSync('git clone bare working', { cwd: tempdir })

    // create initial commit
    writeFileSync(file, 'lolipop content')
    child_process.execSync('git add lolipop', { cwd: workingDir })
    child_process.execSync('git commit -m "inital commit"', { cwd: workingDir })

    // create new branch, which will be deleted by -d flag
    child_process.execSync('git branch alpha/pushed-then-deleted-from-remote--no-commits', { cwd: workingDir })

    // create branch with deep nested path (tests multiple slashes in branch name)
    child_process.execSync('git branch feature/team/auth/oauth-refresh-token', { cwd: workingDir })

    // create branch with version-like name (dots are common in release branches)
    child_process.execSync('git branch release/v2.0.0', { cwd: workingDir })
    // create another branch with special character
    child_process.execSync('git branch "#567--echo--special-chars--pushed-then-deleted-from-remote--no-commits"', {
        cwd: workingDir,
    })
    // create branch with renamed name, which is deleted on remote
    child_process.execSync('git branch foxtrot/local-name-different--removed--can-be-soft-removed', { cwd: workingDir })
    // create branch with renamed name, which is NOT deleted on remote
    child_process.execSync('git branch golf/renamed-locally--not-deleted-on-remote--not-offered-for-deletion', {
        cwd: workingDir,
    })
    // create new branch, which can be deleted only with -D flag
    child_process.execSync('git branch delta/with-commits--remote-deleted--needs-force', { cwd: workingDir })

    // checkout working branch
    child_process.execSync('git checkout delta/with-commits--remote-deleted--needs-force', { cwd: workingDir })

    // update file content
    writeFileSync(file, 'lolipop content changed')
    child_process.execSync('git commit -a -m "second commit"', { cwd: workingDir })

    // Create local-only branch, with commits, that is not merged into main
    child_process.execSync('git checkout -b charlie/local-never-pushed', { cwd: workingDir })
    writeFileSync(file, 'local only branch content')
    child_process.execSync('git commit -a -m "local only commit"', { cwd: workingDir })

    // Create local-only branch, with commits, that is merged into main
    child_process.execSync('git checkout main', { cwd: workingDir })
    child_process.execSync('git checkout -b bravo/local-merged--never-on-remote', { cwd: workingDir })
    writeFileSync(file, 'local merged branch content')
    child_process.execSync('git commit -a -m "local merged commit"', { cwd: workingDir })
    child_process.execSync('git checkout main', { cwd: workingDir })
    child_process.execSync('git merge bravo/local-merged--never-on-remote', { cwd: workingDir })

    // Create a branch that simulates PR merge workflow:
    // 1. Create branch with commits
    // 2. Push to remote
    // 3. Merge to main (simulating GitHub PR merge)
    // 4. Delete remote branch
    // This is the most common real-world scenario
    child_process.execSync('git checkout -b juliet/pr-merged-on-github', { cwd: workingDir })
    writeFileSync(file, 'PR branch content')
    child_process.execSync('git commit -a -m "PR commit"', { cwd: workingDir })
    child_process.execSync('git checkout main', { cwd: workingDir })
    child_process.execSync('git merge juliet/pr-merged-on-github', { cwd: workingDir })

    // Create a protected branch (develop) that would otherwise be deletable
    // This tests that protected branches are excluded from deletion
    child_process.execSync('git checkout -b develop', { cwd: workingDir })
    writeFileSync(file, 'develop branch content')
    child_process.execSync('git commit -a -m "develop commit"', { cwd: workingDir })
    child_process.execSync('git checkout main', { cwd: workingDir })
    child_process.execSync('git merge develop', { cwd: workingDir })

    // push all the branches to the remote and update config
    child_process.execSync('git push origin -u main', { cwd: workingDir })
    child_process.execSync('git push origin -u alpha/pushed-then-deleted-from-remote--no-commits', { cwd: workingDir })
    child_process.execSync('git push origin -u feature/team/auth/oauth-refresh-token', { cwd: workingDir })
    child_process.execSync('git push origin -u release/v2.0.0', { cwd: workingDir })
    child_process.execSync(
        'git push origin -u "#567--echo--special-chars--pushed-then-deleted-from-remote--no-commits"',
        {
            cwd: workingDir,
        },
    )
    child_process.execSync(
        'git push origin -u foxtrot/local-name-different--removed--can-be-soft-removed:hotel/remote-for-foxtrot-but-diff-name--deleted-from-remote',
        { cwd: workingDir },
    )
    child_process.execSync(
        'git push origin -u golf/renamed-locally--not-deleted-on-remote--not-offered-for-deletion:india/remote-name-diff--not-deleted',
        {
            cwd: workingDir,
        },
    )
    child_process.execSync('git push origin -u delta/with-commits--remote-deleted--needs-force', { cwd: workingDir })
    child_process.execSync('git push origin -u juliet/pr-merged-on-github', { cwd: workingDir })
    child_process.execSync('git push origin -u develop', { cwd: workingDir })

    // For juliet/pr-merged-on-github: merge to main on remote first (simulating GitHub PR merge)
    // Then delete the branch - this is the typical PR workflow
    child_process.execSync('git push origin main', { cwd: workingDir }) // Push the merged main

    // remove all the branches from the remote, except for the local-name and protected branches
    child_process.execSync('git push origin :alpha/pushed-then-deleted-from-remote--no-commits', { cwd: workingDir })
    child_process.execSync('git push origin :feature/team/auth/oauth-refresh-token', { cwd: workingDir })
    child_process.execSync('git push origin :release/v2.0.0', { cwd: workingDir })
    child_process.execSync('git push origin :delta/with-commits--remote-deleted--needs-force', { cwd: workingDir })
    child_process.execSync(
        'git push origin :"#567--echo--special-chars--pushed-then-deleted-from-remote--no-commits"',
        {
            cwd: workingDir,
        },
    )
    child_process.execSync('git push origin :hotel/remote-for-foxtrot-but-diff-name--deleted-from-remote', {
        cwd: workingDir,
    })
    child_process.execSync('git push origin :juliet/pr-merged-on-github', { cwd: workingDir })
    child_process.execSync('git push origin :develop', { cwd: workingDir })

    // checkout main branch
    child_process.execSync('git checkout main', { cwd: workingDir })

    return workingDir
}
