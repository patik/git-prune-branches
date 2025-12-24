import { confirm } from '@inquirer/prompts'
import groupedCheckbox from 'inquirer-grouped-checkbox'
import { exit } from 'node:process'
import { red } from '../utils/colors.js'
import store from './store.js'

export async function firstAttempt(): Promise<void> {
    await store.findStaleBranches()

    if (store.staleBranches.length === 0) {
        console.info('✅ No stale branches were found')
        exit(0)
    }

    const merged = store.staleBranches.filter((branch) => !store.unmergedBranches.includes(branch))
    const unmerged = store.unmergedBranches.filter((branch) => store.staleBranches.includes(branch))

    let branchesToDelete: Array<string> = []

    if (store.pruneAll) {
        branchesToDelete = store.staleBranches
    } else {
        const userSelection = await groupedCheckbox({
            message: 'Select branches to remove',
            pageSize: 40,
            groups: [
                {
                    key: 'merged',
                    label: 'Merged Branches',
                    icon: '✅',
                    choices: merged.map((branch) => {
                        return { value: branch, name: branch }
                    }),
                },
                {
                    key: 'unmerged',
                    label: `Unmerged Branches — ${red('will be removed with --force and cannot be undone')}`,
                    icon: '⚠️',
                    choices: unmerged.map((branch) => {
                        return { value: branch, name: branch }
                    }),
                },
            ],
            searchable: true,
        })

        branchesToDelete = Object.values(userSelection).flat()
    }

    const confirmAnswer = store.skipConfirmation
        ? true
        : await confirm({
              message: `Are you sure you want to remove ${branchesToDelete.length === 1 ? 'this' : 'these'} ${branchesToDelete.length} branch${branchesToDelete.length !== 1 ? 'es' : ''}?`,
              default: false,
          })

    if (!confirmAnswer) {
        console.info('👋 No branches were removed.')
        exit(0)
    }

    store.setQueuedForDeletion(branchesToDelete)

    await store.deleteBranches()
}
