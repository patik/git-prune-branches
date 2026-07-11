// Program imports
import { exit } from 'node:process'
import { confirmDeletion, type ConfirmResult } from './confirm-deletion.js'
import { executeDeletions } from './execute-deletions.js'
import { selectBranches, type PreviousSelection } from './select-branches.js'
import { checkForGitRepository } from './side-effects/check-for-git-repo.js'

export default async function program(): Promise<void> {
    try {
        checkForGitRepository()

        let previousSelection: PreviousSelection | undefined
        let confirmResult: ConfirmResult

        // Loop between selection and confirmation screens
        // until user confirms, cancels, or exits
        do {
            // Screen 1: Select branches (restore previous selection if going back)
            const { safe, force } = await selectBranches(previousSelection)

            // Save current selection in case user goes back
            previousSelection = { safe, force }

            // Screen 2: Confirm with command preview
            confirmResult = await confirmDeletion(safe, force)

            if (confirmResult === 'cancel') {
                console.info('👋 No branches were removed.')
                exit(0)
            }

            // If 'back', loop continues and shows selection screen again
        } while (confirmResult === 'back')

        // Screen 3: Execute and show results (auto-exit)
        const exitCode = await executeDeletions(previousSelection.safe, previousSelection.force)
        exit(exitCode)
    } catch (err: unknown) {
        if (typeof err === 'object' && err) {
            if ('code' in err && typeof err.code === 'number' && err.code === 128) {
                process.stderr.write('ERROR: Not a git repository\r\n')
            } else if (
                'code' in err &&
                typeof err.code === 'number' &&
                'message' in err &&
                typeof err.message === 'string' &&
                err.code === 1984
            ) {
                process.stderr.write(`ERROR: ${err.message} \r\n`)
            } else if (err instanceof Error) {
                if (err.name === 'ExitPromptError') {
                    console.log('\r\nℹ️ No branches were deleted.')
                    exit(0)
                }

                process.stderr.write(`${err.stack ?? err.message}\r\n`)
            } else if ('message' in err && typeof err.message === 'string') {
                process.stderr.write(`${err.message}\r\n`)
            }
        }

        exit(1)
    }
}
