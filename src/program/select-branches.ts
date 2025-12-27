import groupedCheckbox from 'inquirer-grouped-checkbox'
import { exit } from 'node:process'
import { gray, yellow } from '../utils/colors.js'
import store from './store.js'

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
    await store.findStaleBranches() // This calls preprocess() internally

    // Check if any branches to delete
    const totalDeletable = store.safeToDelete.length + store.requiresForce.length

    if (totalDeletable === 0 && store.infoOnly.length === 0) {
        console.info('✅ No stale branches were found')
        exit(0)
    }

    if (totalDeletable === 0) {
        console.info('✅ No deletable branches were found')
        console.info('\nℹ️ Some branches are renamed locally but still exist on remote:')
        store.infoOnly.forEach((b) => console.info(`  • ${b}`))
        exit(0)
    }

    const groups = []

    // Group 1: Safe to delete
    if (store.safeToDelete.length > 0) {
        groups.push({
            key: 'safe',
            label: 'Safe to delete',
            icon: '✅',
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
            icon: '⚠️',
            choices: store.requiresForce.map((branch) => ({
                value: branch,
                name: `${branch} ${gray(`[${store.getRequiresForceReason(branch)}]`)}`,
                // Restore previous selection if available, otherwise default to NOT pre-selected
                checked: previousSelection ? previousSelection.force.includes(branch) : false,
            })),
        })
    }

    // Group 3: Info only
    if (store.infoOnly.length > 0) {
        groups.push({
            key: 'info',
            label: gray('Info only - renamed branches still on remote'),
            icon: 'ℹ️',
            choices: store.infoOnly.map((branch) => ({
                value: branch,
                name: `${branch} ${gray(`[${store.getInfoOnlyReason(branch)}]`)}`,
                disabled: true, // Cannot select
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
