import clipboard from 'clipboardy'
import { green } from '../../utils/colors.js'
import { testSetup } from './setup.js'

function run() {
    // Get repo dir
    const cwd = process.cwd()
    // Setup test repository
    const workingDir = testSetup()
    // Create commands to run the test
    clipboard.write(`cd ${workingDir} && npx tsx ${cwd}/src/index.ts && cd -`)
    console.log(green('\nNow paste the command that’s on your clipboard to run the test\n'))
}

run()
