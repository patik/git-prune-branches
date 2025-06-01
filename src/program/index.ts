// Side effects
import './side-effects/check-for-git-repo.js'
import './side-effects/handle-control-c.js'

// Program imports
import { exit } from 'node:process'
import { green } from 'yoctocolors'
import { firstAttempt } from './first-attempt.js'
import { retryFailedDeletions } from './retry-failed-dletions.js'
import store from './state.js'

export default async function program() {
    try {
        await firstAttempt()

        if (store.failedToDelete.length > 0) {
            await retryFailedDeletions()
        } else {
            const total = store.queuedForDeletion.length
            console.info(green(`✅ Deleted ${total === 1 ? '1' : `all ${total}`} branch${total === 1 ? '' : 'es'}`))
            exit(0)
        }

        if (store.failedToDelete.length > 0) {
            exit(1)
        }
    } catch (err: unknown) {
        if (typeof err === 'object' && err) {
            if ('code' in err && typeof err.code === 'number' && err.code === 128) {
                process.stderr.write('ERROR: Not a git repository\r\n')
            } else if ('code' in err && typeof err.code === 'number' && 'message' in err && err.code === 1984) {
                process.stderr.write(`ERROR: ${err.message} \r\n`)
            } else if ('stack' in err) {
                if (err instanceof Error && err.name === 'ExitPromptError') {
                    console.log('\r\n👋 until next time!')
                    exit(0)
                }

                process.stderr.write((err.stack || err) + '\r\n')
            }
        }

        exit(1)
    }
}
