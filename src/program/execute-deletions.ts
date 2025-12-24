import { green, red, yellow } from '../utils/colors.js'
import store from './store.js'

export async function executeDeletions(safe: string[], force: string[]) {
    store.setQueuedForDeletion(safe, force)
    const results = await store.deleteBranches()

    // Show results
    const totalSuccess = results.success.length
    const totalFailed = results.failed.length
    const totalAttempted = totalSuccess + totalFailed

    console.log('') // Empty line

    if (totalFailed === 0) {
        // All succeeded
        console.info(green(`✅ Successfully deleted ${totalSuccess} branch${totalSuccess === 1 ? '' : 'es'}`))

        const numSafe = safe.filter((b) => results.success.includes(b)).length
        const numForce = force.filter((b) => results.success.includes(b)).length

        if (numSafe > 0 && numForce > 0) {
            console.info(`   • ${numSafe} safe deletion${numSafe === 1 ? '' : 's'}`)
            console.info(`   • ${numForce} force deletion${numForce === 1 ? '' : 's'}`)
        }
    } else if (totalSuccess > 0) {
        // Some succeeded, some failed
        console.info(yellow(`⚠️ Deleted ${totalSuccess} of ${totalAttempted} branches`))

        const numSafe = safe.filter((b) => results.success.includes(b)).length
        const numForce = force.filter((b) => results.success.includes(b)).length

        if (numSafe > 0) console.info(`   • ${numSafe} safe deletion${numSafe === 1 ? '' : 's'}`)
        if (numForce > 0) console.info(`   • ${numForce} force deletion${numForce === 1 ? '' : 's'}`)

        console.log('')
        console.info(red(`❌ Failed to delete:`))
        results.failed.forEach(({ branch, error }) => {
            console.info(`   • ${branch}`)
            console.info(`     ${error}`)
        })

        console.log('')
        console.info("💡 Tip: Check if you're currently on this branch or if it has uncommitted changes")
    } else {
        // All failed
        console.info(red(`❌ Failed to delete all ${totalFailed} branch${totalFailed === 1 ? '' : 'es'}`))

        results.failed.forEach(({ branch, error }) => {
            console.info(`   • ${branch}`)
            console.info(`     ${error}`)
        })

        console.log('')
        console.info("💡 Tip: Check if you're currently on a branch you tried to delete")
    }

    console.log('\n👋 Done!\n')

    return totalFailed === 0 ? 0 : 1
}
