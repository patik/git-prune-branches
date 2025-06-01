import { checkbox, confirm } from '@inquirer/prompts'
import { exit } from 'node:process'
import { bold, green, red, yellowBright } from 'yoctocolors'
import store from './state.js'

function getCountsText() {
    const numFailed = store.failedToDelete.length
    const numAttempted = store.queuedForDeletion.length

    if (numFailed < numAttempted) {
        return `Could not remove ${numFailed} of those ${numAttempted} branch${numAttempted === 1 ? '' : 'es'}`
    }

    return `Could not remove  ${numAttempted === 1 ? 'that' : 'any of those'} branch${numAttempted === 1 ? '' : 'es'}`
}

export async function retryFailedDeletions() {
    const numDeletedInFirstRun = store.queuedForDeletion.length - store.failedToDelete.length
    console.info(
        yellowBright(
            `⚠️ ${getCountsText()}.\nYou may try again using ${bold('--force')}, or cancel by pressing Ctrl+C\n`,
        ),
    )
    const branchesToRetry = await checkbox({
        message: red('Select branches to forcefully remove'),
        pageSize: 40,
        choices: store.failedToDelete.map((value) => ({ value })),
    })

    if (branchesToRetry.length === 0) {
        console.info(`
            👋 No additional branches were removed. ${numDeletedInFirstRun} ${numDeletedInFirstRun === 1 ? 'was' : 'were'} previously deleted without --force.`)
        exit(0)
    }

    const numRetried = branchesToRetry.length
    const confirmRetry = store.skipConfirmation
        ? true
        : await confirm({
              message: `Are you sure you want to forcefully remove ${numRetried} branch${numRetried !== 1 ? 'es' : ''}?`,
              default: false,
          })

    if (!confirmRetry) {
        console.info(`
👋 No additional branches were removed. ${numDeletedInFirstRun} ${numDeletedInFirstRun === 1 ? 'was' : 'were'} previously deleted without --force.`)
        exit(0)
    }

    store.setForce(true)
    store.setQueuedForDeletion(branchesToRetry)
    await store.deleteBranches()

    const stillNotDeleted = store.failedToDelete.length
    const total = numDeletedInFirstRun + numRetried

    if (stillNotDeleted === 0) {
        console.info(
            green(
                `✅ Deleted ${
                    total
                } branch${total === 1 ? '' : 'es'} in total: ${numRetried} with --force, and ${numDeletedInFirstRun} without --force.`,
            ),
        )
        return
    }

    console.info(
        green(`
⛔ Still could not delete ${stillNotDeleted} branch${stillNotDeleted === 1 ? '' : 'es'}, even with --force.

Did delete: ${numRetried} with --force, and ${numDeletedInFirstRun} without --force.`),
    )
}
