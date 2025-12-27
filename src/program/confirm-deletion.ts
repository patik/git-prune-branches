import { createPrompt, isEnterKey, useKeypress, useState } from '@inquirer/core'
import { dim, gray, green, red } from '../utils/colors.js'

/** Result of the confirmation prompt */
export type ConfirmResult = 'confirm' | 'cancel' | 'back'

/**
 * Ensure that the displayed command is something the user could copy-paste into their terminal.
 * Note that this is not the same algorithm that we use to sanitize branch names for actual execution.
 */
function displayBranchName(branch: string): string {
    // If branch name contains special characters or spaces, wrap it in quotes
    if (/[\s"'`\\]/.test(branch)) {
        return `"${branch.replace(/(["\\$`])/g, '\\$1')}"`
    }

    return branch
}

/**
 * Custom confirm prompt that supports Escape key to go back.
 * Returns 'confirm' for yes, 'cancel' for no, 'back' for escape.
 */
const confirmWithEscape = createPrompt<ConfirmResult, { message: string }>((config, done) => {
    const [status, setStatus] = useState<'pending' | 'done'>('pending')

    useKeypress((key) => {
        if (key.name === 'escape') {
            setStatus('done')
            done('back')
        } else if (key.name === 'y') {
            setStatus('done')
            done('confirm')
        } else if (key.name === 'n' || isEnterKey(key)) {
            // Default to 'no' on Enter or explicit 'n'
            setStatus('done')
            done('cancel')
        }
    })

    const hint = gray('(y/N, Esc to go back)')

    if (status === 'done') {
        return ''
    }

    return `? ${config.message} ${hint} `
})

/**
 * Display a confirmation screen showing the commands that will be executed.
 * Returns 'confirm' if user confirms, 'cancel' if they decline, or 'back' if they press Escape.
 */
export async function confirmDeletion(safe: string[], force: string[]): Promise<ConfirmResult> {
    if (safe.length === 0 && force.length === 0) {
        console.info('👋 No branches selected')
        return 'cancel'
    }

    console.log(`\nThe following commands will be executed:\n`)

    if (safe.length > 0) {
        console.log(green(`Safely delete ${safe.length} branch${safe.length === 1 ? '' : 'es'}:`))
        safe.forEach((branch) => console.log(dim(`  git branch -d ${displayBranchName(branch)}`)))
        console.log('')
    }

    if (force.length > 0) {
        console.log(red(`Force delete ${force.length} branch${force.length === 1 ? '' : 'es'}:`))
        force.forEach((branch) => console.log(dim(`  git branch -D ${displayBranchName(branch)}`)))
        console.log('')
    }

    const total = safe.length + force.length

    return confirmWithEscape({
        message: `Delete ${total} branch${total === 1 ? '' : 'es'}?`,
    })
}
