import { checkbox, confirm } from '@inquirer/prompts'
import { exit } from 'node:process'
import store from './store.js'

export async function firstAttempt(): Promise<void> {
    await store.findStaleBranches()

    if (store.staleBranches.length === 0) {
        console.info('✅ No stale branches were found')
        exit(0)
    }

    const userSelectedBranches = store.pruneAll
        ? store.staleBranches
        : await checkbox({
              message: 'Select branches to remove',
              pageSize: 40,
              choices: store.staleBranches.map((value) => ({ value })),
          })
    const confirmAnswer = store.skipConfirmation
        ? true
        : await confirm({
              message: `Are you sure you want to remove ${userSelectedBranches.length === 1 ? 'this' : 'these'} ${userSelectedBranches.length} branch${userSelectedBranches.length !== 1 ? 'es' : ''}?`,
              default: false,
          })

    if (!confirmAnswer) {
        console.info('👋 No branches were removed.')
        exit(0)
    }

    store.setQueuedForDeletion(userSelectedBranches)

    await store.deleteBranches()
}
