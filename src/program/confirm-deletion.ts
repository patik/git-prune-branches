import { confirm } from '@inquirer/prompts'
import { bold, green, red } from '../utils/colors.js'

export async function confirmDeletion(safe: string[], force: string[]): Promise<boolean> {
    if (safe.length === 0 && force.length === 0) {
        console.info('👋 No branches selected')
        return false
    }

    console.log(`\n${bold('The following commands will be executed:')}\n`)

    if (safe.length > 0) {
        console.log(green(`Safe deletes (${safe.length} branch${safe.length === 1 ? '' : 'es'}):`))
        safe.forEach((branch) => console.log(`  git branch -d ${branch}`))
        console.log('')
    }

    if (force.length > 0) {
        console.log(red(`Force deletes (${force.length} branch${force.length === 1 ? '' : 'es'}):`))
        force.forEach((branch) => console.log(`  git branch -D ${branch}`))
        console.log('')
    }

    const total = safe.length + force.length
    const answer = await confirm({
        message: `Delete ${total} branch${total === 1 ? '' : 'es'}?`,
        default: false,
    })

    return answer
}
