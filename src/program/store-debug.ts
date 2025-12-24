import stdout from 'easy-stdout'
import store from './store.js'

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
