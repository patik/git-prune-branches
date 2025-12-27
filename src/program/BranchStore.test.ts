import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testSetup } from '../tests/manual/setup.js'
import BranchStore from './BranchStore.js'

// Only mock ora to suppress spinner output during tests
vi.mock('ora', () => ({
    default: vi.fn(() => ({
        start: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
        fail: vi.fn().mockReturnThis(),
        warn: vi.fn().mockReturnThis(),
        color: '',
    })),
}))

describe('BranchStore', () => {
    let workingDir: string
    let originalCwd: string

    beforeAll(() => {
        // Suppress console output during tests
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        // Save original cwd and set up test repo
        originalCwd = process.cwd()
        workingDir = testSetup()
        process.chdir(workingDir)
    })

    afterAll(() => {
        process.chdir(originalCwd)
        vi.restoreAllMocks()
    })

    describe('constructor', () => {
        it('should initialize with provided remote', () => {
            const store = new BranchStore({ remote: 'upstream' })
            expect(store.remote).toBe('upstream')
        })

        it('should initialize arrays as empty', () => {
            const store = new BranchStore({ remote: 'origin' })
            expect(store.remoteBranches).toEqual([])
            expect(store.localOrphanedBranches).toEqual([])
            expect(store.staleBranches).toEqual([])
            expect(store.queuedForDeletion).toEqual([])
            expect(store.queuedForForceDeletion).toEqual([])
            expect(store.failedToDelete).toEqual([])
            expect(store.liveBranches).toEqual([])
            expect(store.unmergedBranches).toEqual([])
            expect(store.neverPushedBranches).toEqual([])
            expect(store.mergedBranches).toEqual([])
            expect(store.safeToDelete).toEqual([])
            expect(store.requiresForce).toEqual([])
            expect(store.infoOnly).toEqual([])
        })

        it('should initialize protected branches', () => {
            const store = new BranchStore({ remote: 'origin' })
            expect(store.protectedBranches).toEqual(['main', 'master', 'develop', 'development'])
        })

        it('should initialize currentBranch as empty string', () => {
            const store = new BranchStore({ remote: 'origin' })
            expect(store.currentBranch).toBe('')
        })

        it('should initialize noConnection as false', () => {
            const store = new BranchStore({ remote: 'origin' })
            expect(store.noConnection).toBe(false)
        })
    })

    describe('setQueuedForDeletion', () => {
        it('should update both queuedForDeletion arrays', () => {
            const store = new BranchStore({ remote: 'origin' })
            const safeBranches = ['branch1', 'branch2']
            const forceBranches = ['branch3']

            store.setQueuedForDeletion(safeBranches, forceBranches)

            expect(store.queuedForDeletion).toEqual(safeBranches)
            expect(store.queuedForForceDeletion).toEqual(forceBranches)
        })
    })

    describe('getCurrentBranch (real git)', () => {
        it('should find the current branch', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.getCurrentBranch()

            // testSetup() ends on 'main' branch
            expect(store.currentBranch).toBe('main')
        })
    })

    describe('findLocalOrphanedBranches (real git)', () => {
        it('should find local branches tracking remote branches', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findAllBranches()
            await store.findLocalOrphanedBranches()

            // These branches were pushed to origin and track it
            const localBranchNames = store.localOrphanedBranches.map((b) => b.localBranch)

            // Should include branches that were pushed to origin
            expect(localBranchNames).toContain('main')
            expect(localBranchNames).toContain('feature/user-avatars')
            expect(localBranchNames).toContain('experiment/graphql-api')

            // Should NOT include branches that were never pushed (no upstream)
            expect(localBranchNames).not.toContain('wip/settings-redesign')
            expect(localBranchNames).not.toContain('chore/update-deps')
        })
    })

    describe('findLiveBranches (real git)', () => {
        it('should throw error when remote is empty', async () => {
            const store = new BranchStore({ remote: '' })
            await expect(store.findLiveBranches()).rejects.toThrow(
                'Remote is empty. Please specify remote with -r parameter',
            )
        })

        it('should find branches that exist on the remote', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findLiveBranches()

            // These branches still exist on remote (were not deleted)
            expect(store.liveBranches).toContain('main')
            expect(store.liveBranches).toContain('hotfix/cache-fix')

            // These were deleted from remote by testSetup()
            expect(store.liveBranches).not.toContain('feature/user-avatars')
            expect(store.liveBranches).not.toContain('experiment/graphql-api')
        })
    })

    describe('findUnmergedBranches (real git)', () => {
        it('should find branches not merged into current branch', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findUnmergedBranches()

            // These branches have commits not merged into main
            expect(store.unmergedBranches).toContain('experiment/graphql-api')
            expect(store.unmergedBranches).toContain('wip/settings-redesign')

            // These were merged into main
            expect(store.unmergedBranches).not.toContain('chore/update-deps')
            expect(store.unmergedBranches).not.toContain('feature/search-filters')
        })
    })

    describe('findRemoteBranches (real git)', () => {
        it('should find cached remote branches', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findRemoteBranches()

            // These exist in git's remote-tracking refs
            expect(store.remoteBranches).toContain('main')
            expect(store.remoteBranches).toContain('hotfix/cache-fix')
        })
    })

    describe('findNeverPushedBranches (real git)', () => {
        it('should find branches with no upstream tracking', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findAllBranches()
            await store.findNeverPushedBranches()

            // These were never pushed (created with -b, no -u)
            expect(store.neverPushedBranches).toContain('wip/settings-redesign')
            expect(store.neverPushedBranches).toContain('chore/update-deps')

            // These have upstream tracking
            expect(store.neverPushedBranches).not.toContain('main')
            expect(store.neverPushedBranches).not.toContain('feature/user-avatars')
        })
    })

    describe('lookupMergedBranches (real git)', () => {
        it('should find branches merged into current branch', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.lookupMergedBranches()

            // These were merged into main
            expect(store.mergedBranches).toContain('chore/update-deps')
            expect(store.mergedBranches).toContain('feature/search-filters')
            expect(store.mergedBranches).toContain('main')

            // These have unmerged commits
            expect(store.mergedBranches).not.toContain('wip/settings-redesign')
            expect(store.mergedBranches).not.toContain('experiment/graphql-api')
        })
    })

    describe('lookupLastCommitTimes (real git)', () => {
        it('should get commit timestamps for all local branches', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.lookupLastCommitTimes()

            // Should have timestamps for all branches
            expect(store.branchLastCommitTimes.size).toBeGreaterThan(0)
            expect(store.branchLastCommitTimes.has('main')).toBe(true)

            // Timestamps should be reasonable (within last hour since testSetup just ran)
            const mainTimestamp = store.branchLastCommitTimes.get('main')
            expect(mainTimestamp).toBeDefined()
            const now = Math.floor(Date.now() / 1000)
            expect(now - mainTimestamp!).toBeLessThan(3600) // Less than 1 hour ago
        })
    })

    describe('getDeletableBranches (real git - full integration)', () => {
        it('should identify branches deleted from remote as stale', async () => {
            const store = new BranchStore({ remote: 'origin' })
            const staleBranches = await store.getDeletableBranches()

            // These were pushed then deleted from remote
            expect(staleBranches).toContain('feature/user-avatars')
            expect(staleBranches).toContain('experiment/graphql-api')
            expect(staleBranches).toContain('fix/#432-modal-close')
            expect(staleBranches).toContain('feature/search-filters')

            // This was never pushed, so it's not "stale" (orphaned from remote)
            expect(staleBranches).not.toContain('wip/settings-redesign')
            expect(staleBranches).not.toContain('chore/update-deps')

            // Main still exists on remote
            expect(staleBranches).not.toContain('main')
        })
    })

    describe('classifyBranches (real git - full integration)', () => {
        it('should correctly classify branches into groups', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.getDeletableBranches()

            // Safe to delete: merged branches that can be deleted without force
            expect(store.safeToDelete).toContain('feature/user-avatars')
            expect(store.safeToDelete).toContain('fix/#432-modal-close')
            expect(store.safeToDelete).toContain('feature/search-filters')
            expect(store.safeToDelete).toContain('chore/update-deps')
            expect(store.safeToDelete).toContain('feature/dark-mode')

            // Requires force: unmerged branches
            expect(store.requiresForce).toContain('experiment/graphql-api')
            expect(store.requiresForce).toContain('wip/settings-redesign')

            // Info only: renamed locally but remote still exists
            expect(store.infoOnly).toContain('bugfix/cache-invalidation')

            // Protected branches should not appear in any group
            expect(store.safeToDelete).not.toContain('main')
            expect(store.safeToDelete).not.toContain('develop')
            expect(store.requiresForce).not.toContain('main')
            expect(store.requiresForce).not.toContain('develop')
        })

        it('should exclude current branch from all groups', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.getDeletableBranches()

            expect(store.currentBranch).toBe('main')
            expect(store.safeToDelete).not.toContain('main')
            expect(store.requiresForce).not.toContain('main')
            expect(store.infoOnly).not.toContain('main')
        })
    })

    describe('reason methods', () => {
        it('should provide reasons for safe-to-delete branches', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.getDeletableBranches()

            // Stale branch (was on remote, now deleted)
            const staleReason = store.getSafeToDeleteReason('feature/user-avatars')
            expect(staleReason).toContain('merged')
            expect(staleReason).toContain('remote deleted')

            // Local-only merged branch
            const localReason = store.getSafeToDeleteReason('chore/update-deps')
            expect(localReason).toContain('merged')
            expect(localReason).toContain('local only')
        })

        it('should provide reasons for requires-force branches', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.getDeletableBranches()

            // Stale but unmerged
            const staleReason = store.getRequiresForceReason('experiment/graphql-api')
            expect(staleReason).toContain('unmerged')
            expect(staleReason).toContain('remote deleted')

            // Local only unmerged
            const localReason = store.getRequiresForceReason('wip/settings-redesign')
            expect(localReason).toContain('unmerged')
            expect(localReason).toContain('local only')
        })

        it('should provide reasons for info-only branches', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.getDeletableBranches()

            const reason = store.getInfoOnlyReason('bugfix/cache-invalidation')
            expect(reason).toContain('renamed locally')
        })
    })

    describe('deleteBranches (real git)', () => {
        it('should return empty arrays when nothing queued', async () => {
            const store = new BranchStore({ remote: 'origin' })
            store.queuedForDeletion = []
            store.queuedForForceDeletion = []

            const result = await store.deleteBranches()

            expect(result.success).toEqual([])
            expect(result.failed).toEqual([])
        })
    })
})

describe('BranchStore - deletion tests (isolated repo)', () => {
    let workingDir: string
    let originalCwd: string

    beforeAll(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        // Create a fresh repo for deletion tests
        originalCwd = process.cwd()
        workingDir = testSetup()
        process.chdir(workingDir)
    })

    afterAll(() => {
        process.chdir(originalCwd)
        vi.restoreAllMocks()
    })

    it('should delete safe branches with -d flag', async () => {
        const store = new BranchStore({ remote: 'origin' })
        await store.getDeletableBranches()

        // Queue a known safe branch
        store.setQueuedForDeletion(['feature/user-avatars'], [])

        const result = await store.deleteBranches()

        expect(result.success).toContain('feature/user-avatars')
        expect(result.failed).toEqual([])
    })

    it('should delete force branches with -D flag', async () => {
        const store = new BranchStore({ remote: 'origin' })
        await store.getDeletableBranches()

        // Queue a branch that requires force
        store.setQueuedForDeletion([], ['wip/settings-redesign'])

        const result = await store.deleteBranches()

        expect(result.success).toContain('wip/settings-redesign')
        expect(result.failed).toEqual([])
    })

    it('should handle branches with special characters', async () => {
        const store = new BranchStore({ remote: 'origin' })
        await store.getDeletableBranches()

        // Queue branch with special chars
        store.setQueuedForDeletion(['fix/#432-modal-close'], [])

        const result = await store.deleteBranches()

        expect(result.success).toContain('fix/#432-modal-close')
        expect(result.failed).toEqual([])
    })

    it('should fail gracefully when branch does not exist', async () => {
        const store = new BranchStore({ remote: 'origin' })

        store.setQueuedForDeletion(['nonexistent-branch-12345'], [])

        const result = await store.deleteBranches()

        expect(result.success).toEqual([])
        expect(result.failed).toHaveLength(1)
        expect(result.failed[0]!.branch).toBe('nonexistent-branch-12345')
        expect(store.failedToDelete).toHaveLength(1)
    })
})
