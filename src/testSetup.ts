import child_process from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const isCI = process.argv[2]?.split('=')[1] === 'true'

let tempdir: string = process.argv[3]?.split('=')[1] || ''
let workingDir: string = ''

export const testSetup = () => {
    console.log('begin')
    if (isCI) {
        child_process.execSync('git config --global user.email "you@example.com"', { cwd: tempdir })
        child_process.execSync('git config --global user.name "Your Name"', { cwd: tempdir })
    }

    if (!tempdir) {
        const tmp = os.tmpdir()
        tempdir = mkdtempSync(tmp + path.sep + 'git-prune-branches-')
    }

    const bareDir = tempdir + path.sep + 'bare'
    workingDir = tempdir + path.sep + 'working'

    const file = `${workingDir}${path.sep}lolipop`

    mkdirSync(bareDir)

    console.log(`Using "${tempdir}" dir`)

    // create bare repository
    child_process.execSync('git init --bare --initial-branch=main', { cwd: bareDir })

    // clone repository
    child_process.execSync('git clone bare working', { cwd: tempdir })

    // create initial commit
    writeFileSync(file, 'lolipop content')
    child_process.execSync('git add lolipop', { cwd: workingDir })
    child_process.execSync('git commit -m "inital commit"', { cwd: workingDir })

    // create new branch, which will be deleted by -d flag
    child_process.execSync('git branch feature/fast-forwarded', { cwd: workingDir })
    // create another branch with special character
    child_process.execSync('git branch "#333-work"', { cwd: workingDir })
    // create branch with renamed name, which is deleted on remote
    child_process.execSync('git branch chore/local-name-deleted', { cwd: workingDir })
    // create branch with renamed name, which is NOT deleted on remote
    child_process.execSync('git branch chore/local-name-persistent', { cwd: workingDir })
    // create new branch, which can be deleted only with -D flag
    child_process.execSync('git branch not-yet-merged', { cwd: workingDir })

    // checkout working branch
    child_process.execSync('git checkout not-yet-merged', { cwd: workingDir })

    // update file content
    writeFileSync(file, 'lolipop content changed')
    child_process.execSync('git commit -a -m "second commit"', { cwd: workingDir })

    // push all the branches to the remote and update config
    child_process.execSync('git push origin -u main', { cwd: workingDir })
    child_process.execSync('git push origin -u feature/fast-forwarded', { cwd: workingDir })
    child_process.execSync('git push origin -u "#333-work"', { cwd: workingDir })
    child_process.execSync('git push origin -u chore/local-name-deleted:chore/remote-name-deleted', { cwd: workingDir })
    child_process.execSync('git push origin -u chore/local-name-persistent:chore/remote-name-persistent', {
        cwd: workingDir,
    })
    child_process.execSync('git push origin -u not-yet-merged', { cwd: workingDir })

    // remove all the branches from the remote, except for the local-name
    child_process.execSync('git push origin :feature/fast-forwarded', { cwd: workingDir })
    child_process.execSync('git push origin :not-yet-merged', { cwd: workingDir })
    child_process.execSync('git push origin :"#333-work"', { cwd: workingDir })
    child_process.execSync('git push origin :chore/remote-name-deleted', { cwd: workingDir })

    // checkout main branch
    child_process.execSync('git checkout main', { cwd: workingDir })

    console.log('workingDir: ', workingDir)
    return workingDir
}

testSetup()
