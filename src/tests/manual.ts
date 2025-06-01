import { testSetup } from './setup.js'

function run() {
    const workingDir = testSetup()

    console.log(`cd ${workingDir}`)
}

run()
