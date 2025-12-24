import { checkbox, confirm, Separator } from '@inquirer/prompts'
import { exit } from 'node:process'
import { bold, green } from '../utils/colors.js'
import store from './store.js'

export async function firstAttempt(): Promise<void> {
    await store.findStaleBranches()

    if (store.staleBranches.length === 0) {
        console.info('✅ No stale branches were found')
        exit(0)
    }

    const merged = store.staleBranches.filter((branch) => !store.unmergedBranches.includes(branch))
    const unmerged = store.unmergedBranches.filter((branch) => store.staleBranches.includes(branch))

    const userSelectedBranches = store.pruneAll
        ? store.staleBranches
        : await checkbox({
              message: 'Select branches to remove',
              pageSize: 40,
              choices: [
                  new Separator(' '),
                  new Separator(bold('✅ Merged Branches')),
                  ...merged.map((branch) => {
                      return { name: branch, value: branch }
                  }),
                  new Separator(' '),
                  new Separator(bold('⚠️ Unmerged Branches')),
                  ...unmerged.map((branch) => {
                      return {
                          name: branch,
                          value: branch,
                      }
                  }),
              ],
              theme: {
                  style: {
                      answer: (text: string) => bold(green(text)),
                  },
                  icon: {
                      checked: '    ◉',
                      unchecked: '    ◯',
                      //   cursor: '   ❯ ',
                  },
              },
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
