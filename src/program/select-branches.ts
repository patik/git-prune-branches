import groupedCheckbox from 'inquirer-grouped-checkbox'
import { exit } from 'node:process'
import { gray, yellow } from '../utils/colors.js'
import store from './store.js'

export async function selectBranches(): Promise<{
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
                checked: true, // Pre-selected
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
                checked: false, // NOT pre-selected
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
