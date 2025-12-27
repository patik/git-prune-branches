import { confirm } from '@inquirer/prompts'
import { dim, green, red } from '../utils/colors.js'

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

export async function confirmDeletion(safe: string[], force: string[]): Promise<boolean> {
    if (safe.length === 0 && force.length === 0) {
        console.info('👋 No branches selected')
        return false
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
    const answer = await confirm({
        message: `Delete ${total} branch${total === 1 ? '' : 'es'}?`,
        default: false,
    })

    return answer
}
