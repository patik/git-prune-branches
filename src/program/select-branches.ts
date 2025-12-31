import type { GroupedCheckboxConfig } from 'inquirer-grouped-checkbox'
import groupedCheckbox from 'inquirer-grouped-checkbox'
import { exit } from 'node:process'
import { gray, green, yellow } from '../utils/colors.js'
import store from './store/store.js'

/** Previous selection state to restore when returning from confirmation screen */
export interface PreviousSelection {
    safe: string[]
    force: string[]
}

/**
 * Display the branch selection screen with grouped checkboxes.
 * @param previousSelection - Optional previous selection to restore (e.g., when going back from confirmation)
 */
export async function selectBranches(previousSelection?: PreviousSelection): Promise<{
    safe: string[]
    force: string[]
}> {
    await store.getDeletableBranches()

    // Check if any branches to delete
    const totalDeletable = store.safeToDelete.length + store.requiresForce.length

    if (totalDeletable === 0 && store.infoOnly.length === 0) {
        console.info('✅ No stale branches were found')
        exit(0)
    }

    if (totalDeletable === 0) {
        console.info('✅ No deletable branches were found')
        console.info('\nℹ Some branches are renamed locally but still exist on remote:')
        store.infoOnly.forEach((b) => console.info(`  • ${b}`))
        exit(0)
    }

    // Display info-only branches before the prompt
    if (store.infoOnly.length > 0) {
        console.info(`\nℹ Will not be deleted — ${gray('local branches whose remote branches have different names')}`)

        // Show all if few, otherwise show first 3 with count
        if (store.infoOnly.length < 4) {
            store.infoOnly.forEach((branch) => {
                console.info(`    • ${branch} ${gray(`[${store.getInfoOnlyReason(branch)}]`)}`)
            })
        } else {
            store.infoOnly.slice(0, 3).forEach((branch) => {
                console.info(`    • ${branch} ${gray(`[${store.getInfoOnlyReason(branch)}]`)}`)
            })
            console.info(`    • And ${store.infoOnly.length - 3} more branches...`)
        }

        // blank lines before prompt
        console.info()
        console.info()
    }

    const groups: GroupedCheckboxConfig<string>['groups'] = []

    // Group 1: Safe to delete
    if (store.safeToDelete.length > 0) {
        groups.push({
            key: 'safe',
            label: 'Safe to delete',
            icon: green('✔︎'),
            choices: store.safeToDelete.map((branch) => ({
                value: branch,
                name: `${branch} ${gray(`[${store.getSafeToDeleteReason(branch)}]`)}`,
                // Restore previous selection if available, otherwise default to pre-selected
                checked: previousSelection ? previousSelection.safe.includes(branch) : true,
            })),
        })
    }

    // Group 2: Requires force
    if (store.requiresForce.length > 0) {
        groups.push({
            key: 'force',
            label: yellow('Requires force delete — cannot be undone'),
            icon: yellow('⚠︎'),
            choices: store.requiresForce.map((branch) => ({
                value: branch,
                name: `${branch} ${gray(`[${store.getRequiresForceReason(branch)}]`)}`,
                // Restore previous selection if available, otherwise default to NOT pre-selected
                checked: previousSelection ? previousSelection.force.includes(branch) : false,
            })),
        })
    }

    const userSelection = await groupedCheckbox({
        message: 'Select branches to remove',
        pageSize: 40,
        groups,
        searchable: true,
    })

    return {
        safe: userSelection.safe || [],
        force: userSelection.force || [],
    }
}
