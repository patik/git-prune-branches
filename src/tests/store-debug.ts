import stdout from 'easy-stdout'
import store from '../program/store.js'

/**
 *
 * #567--echo--special-chars--pushed-then-deleted-from-remote--no-commits
 * Version 1 offers to delete? Yes
 * Needs force to delete? No
 *
 *
 * alpha/pushed-then-deleted-from-remote--no-commits
 * Version 1 offers to delete? Yes
 * Version 2 should offer to delete? Yes
 * Needs force to delete? No
 *
 *
 * bravo/local-merged--never-on-remote
 * Version 1 offers to delete? No
 * Version 2 should offer to delete? Yes
 * Needs force to delete? No
 *
 *
 * charlie/local-never-pushed
 * Version 1 offers to delete? No
 * Version 2 should offer to delete? Yes
 * Needs force to delete? Yes
 *
 *
 * delta/with-commits--remote-deleted--needs-force
 * Version 1 offers to delete? Yes
 * Version 2 should offer to delete? Yes
 * Needs force to delete? Yes
 *
 *
 * foxtrot/local-name-different--removed--can-be-soft-removed
 * Version 1 offers to delete? Yes
 * Version 2 should offer to delete? Yes
 * Needs force to delete? No
 *
 *
 * golf/renamed-locally--not-deleted-on-remote--not-offered-for-deletion
 * Version 1 offers to delete? No
 * Version 2 should offer to delete? Yes
 * Needs force to delete? No
 *
 *
 * india/remote-name-diff--not-deleted
 * Version 1 offers to delete? No
 * Version 2 should offer to delete? No
 * Needs force to delete? N/A
 *
 *
 *
 * Version 1 status quo:
 * All stale branches will be offered for deletion, but only those that do not also appear in `unmergedBranches` will be deletable without `--force`.
 *
 * Version 2 addition:
 * First list (no force) is stale MINUS unmerged
 * Second list (needs force) is stale AND unmerged
 * Third list: (never pushed, no force) bravo and golf
 * Fourth list: (never pushed, needs force) charlie
 * Fifth list: (renamed locally, no force, just FYI) india should not appear at all
 */

async function run() {
    const findLocalOrphanedBranches = await stdout('git branch --format="%(refname:short)@{%(upstream)}"')
    console.log('findLocalOrphanedBranches will find these:\n', findLocalOrphanedBranches, '\n\n\n')

    const findUnmergedBranches = await stdout('git branch --format="%(refname:short)@{%(upstream)}" --no-merged')
    console.log('findUnmergedBranches will find these:\n', findUnmergedBranches, '\n\n\n')

    await store.findStaleBranches()
    console.log('remoteBranches:\n', store.remoteBranches, '\n\n\n')
    console.log('localOrphanedBranches:\n', store.localOrphanedBranches, '\n\n\n')
    console.log('staleBranches:\n', store.staleBranches, '\n\n\n')
    console.log('liveBranches:\n', store.liveBranches, '\n\n\n')
    console.log('unmergedBranches:\n', store.unmergedBranches, '\n\n\n')
}

run()
