// Side effects
import './side-effects/check-for-git-repo.js'
import './side-effects/handle-control-c.js'

// Program imports
import { exit } from 'node:process'
import { confirmDeletion } from './confirm-deletion.js'
import { executeDeletions } from './execute-deletions.js'
import { selectBranches } from './select-branches.js'

export default async function program() {
    try {
        // Screen 1: Select branches
        const { safe, force } = await selectBranches()

        // Screen 2: Confirm with command preview
        const confirmed = await confirmDeletion(safe, force)

        if (!confirmed) {
            console.info('👋 No branches were removed.')
            exit(0)
        }

        // Screen 3: Execute and show results (auto-exit)
        const exitCode = await executeDeletions(safe, force)
        exit(exitCode)
    } catch (err: unknown) {
        if (typeof err === 'object' && err) {
            if ('code' in err && typeof err.code === 'number' && err.code === 128) {
                process.stderr.write('ERROR: Not a git repository\r\n')
            } else if ('code' in err && typeof err.code === 'number' && 'message' in err && err.code === 1984) {
                process.stderr.write(`ERROR: ${err.message} \r\n`)
            } else if ('stack' in err) {
                if (err instanceof Error && err.name === 'ExitPromptError') {
                    console.log('\r\n👋 No branches were deleted.')
                    exit(0)
                }

                process.stderr.write((err.stack || err) + '\r\n')
            }
        }

        exit(1)
    }
}
