import assert from 'assert'
import child_process, { execFileSync } from 'node:child_process'
import path from 'node:path'
import { argv } from 'node:process'
import { fileURLToPath } from 'node:url'
import { green } from 'yoctocolors'
import { testSetup } from './setup.js'

const onlyPrepare = argv.find((one) => one === '--prepare')
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const bin = path.join(__dirname, '../../dist/index.js')

const workingDir = testSetup()

const test_nothing = () => {
    const output = execFileSync('node', [bin, '--prune-all', '--dry-run'], {
        cwd: workingDir,
        encoding: 'utf8',
    })

    console.log(`------ test_nothing ------
${output}
-------------------`)

    assert.equal(output.indexOf('chore/local-name-persistent'), -1)
    assert.notEqual(output.indexOf(' chore/local-name-deleted'), -1)
    assert.notEqual(output.indexOf(' #333-work'), -1)
    assert.notEqual(output.indexOf(' feature/fast-forwarded'), -1)
    assert.notEqual(output.indexOf(' no-ff'), -1)
}

const testing_prune = () => {
    const output = child_process.execFileSync('node', [bin, '--prune-all'], {
        cwd: workingDir,
        encoding: 'utf8',
    })

    console.log(`------ test_prune ------
${output}
-------------------`)

    assert.notEqual(output.indexOf('Could not remove 1 of those 4 branches'), -1)
    assert.notEqual(output.indexOf(' no-ff'), -1)
    assert.equal(output.indexOf('feature/fast-forwarded'), -1)
    assert.equal(output.indexOf('#333-work'), -1)
}

const testing_force = () => {
    const output = child_process.execFileSync('node', [bin, '--prune-all', '--force'], {
        cwd: workingDir,
        encoding: 'utf8',
    })

    console.log(`------ test_force ------
${output}
-------------------`)

    assert.notEqual(output.indexOf('Deleted 1 branch'), -1)
}

if (onlyPrepare) {
    console.log(`All prepared

${workingDir}
`)
} else {
    test_nothing()
    testing_prune()
    testing_force()
    console.log(green('All tests passed!'))
}
