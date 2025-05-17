import { exec } from 'node:child_process'

/**
 * Returns stdout from the given shell command
 */
export async function stdout(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        return exec(command, (err, stdout, stderr) => {
            if (err || stderr) {
                reject(`getBranch Error: ${err ?? stderr}`)
            } else if (typeof stdout === 'string') {
                resolve(stdout.trim())
            }
        })
    })
}
