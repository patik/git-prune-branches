import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import BranchStore from '../utils/BranchStore.js'
import { testSetup } from './manual/setup.js'

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

    describe('findCurrentBranch (real git)', () => {
        it('should find the current branch', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findCurrentBranch()

            // testSetup() ends on 'main' branch
            expect(store.currentBranch).toBe('main')
        })
    })

    describe('findLocalOrphanedBranches (real git)', () => {
        it('should find local branches tracking remote branches', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findLocalOrphanedBranches()

            // These branches were pushed to origin and track it
            const localBranchNames = store.localOrphanedBranches.map((b) => b.localBranch)

            // Should include branches that were pushed to origin
            expect(localBranchNames).toContain('main')
            expect(localBranchNames).toContain('alpha/pushed-then-deleted-from-remote--no-commits')
            expect(localBranchNames).toContain('delta/with-commits--remote-deleted--needs-force')

            // Should NOT include branches that were never pushed (no upstream)
            expect(localBranchNames).not.toContain('charlie/local-never-pushed')
            expect(localBranchNames).not.toContain('bravo/local-merged--never-on-remote')
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
            expect(store.liveBranches).toContain('india/remote-name-diff--not-deleted')

            // These were deleted from remote by testSetup()
            expect(store.liveBranches).not.toContain('alpha/pushed-then-deleted-from-remote--no-commits')
            expect(store.liveBranches).not.toContain('delta/with-commits--remote-deleted--needs-force')
        })
    })

    describe('findUnmergedBranches (real git)', () => {
        it('should find branches not merged into current branch', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findUnmergedBranches()

            // These branches have commits not merged into main
            expect(store.unmergedBranches).toContain('delta/with-commits--remote-deleted--needs-force')
            expect(store.unmergedBranches).toContain('charlie/local-never-pushed')

            // These were merged into main
            expect(store.unmergedBranches).not.toContain('bravo/local-merged--never-on-remote')
            expect(store.unmergedBranches).not.toContain('juliet/pr-merged-on-github')
        })
    })

    describe('findRemoteBranches (real git)', () => {
        it('should find cached remote branches', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findRemoteBranches()

            // These exist in git's remote-tracking refs
            expect(store.remoteBranches).toContain('main')
            expect(store.remoteBranches).toContain('india/remote-name-diff--not-deleted')
        })
    })

    describe('findNeverPushedBranches (real git)', () => {
        it('should find branches with no upstream tracking', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findNeverPushedBranches()

            // These were never pushed (created with -b, no -u)
            expect(store.neverPushedBranches).toContain('charlie/local-never-pushed')
            expect(store.neverPushedBranches).toContain('bravo/local-merged--never-on-remote')

            // These have upstream tracking
            expect(store.neverPushedBranches).not.toContain('main')
            expect(store.neverPushedBranches).not.toContain('alpha/pushed-then-deleted-from-remote--no-commits')
        })
    })

    describe('findMergedBranches (real git)', () => {
        it('should find branches merged into current branch', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findMergedBranches()

            // These were merged into main
            expect(store.mergedBranches).toContain('bravo/local-merged--never-on-remote')
            expect(store.mergedBranches).toContain('juliet/pr-merged-on-github')
            expect(store.mergedBranches).toContain('main')

            // These have unmerged commits
            expect(store.mergedBranches).not.toContain('charlie/local-never-pushed')
            expect(store.mergedBranches).not.toContain('delta/with-commits--remote-deleted--needs-force')
        })
    })

    describe('findBranchLastCommitTimes (real git)', () => {
        it('should get commit timestamps for all local branches', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findBranchLastCommitTimes()

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

    describe('findStaleBranches (real git - full integration)', () => {
        it('should identify branches deleted from remote as stale', async () => {
            const store = new BranchStore({ remote: 'origin' })
            const staleBranches = await store.findStaleBranches()

            // These were pushed then deleted from remote
            expect(staleBranches).toContain('alpha/pushed-then-deleted-from-remote--no-commits')
            expect(staleBranches).toContain('delta/with-commits--remote-deleted--needs-force')
            expect(staleBranches).toContain('#567--echo--special-chars--pushed-then-deleted-from-remote--no-commits')
            expect(staleBranches).toContain('juliet/pr-merged-on-github')

            // This was never pushed, so it's not "stale" (orphaned from remote)
            expect(staleBranches).not.toContain('charlie/local-never-pushed')
            expect(staleBranches).not.toContain('bravo/local-merged--never-on-remote')

            // Main still exists on remote
            expect(staleBranches).not.toContain('main')
        })
    })

    describe('classifyBranches (real git - full integration)', () => {
        it('should correctly classify branches into groups', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findStaleBranches()

            // Safe to delete: merged branches that can be deleted without force
            expect(store.safeToDelete).toContain('alpha/pushed-then-deleted-from-remote--no-commits')
            expect(store.safeToDelete).toContain(
                '#567--echo--special-chars--pushed-then-deleted-from-remote--no-commits',
            )
            expect(store.safeToDelete).toContain('juliet/pr-merged-on-github')
            expect(store.safeToDelete).toContain('bravo/local-merged--never-on-remote')
            expect(store.safeToDelete).toContain('foxtrot/local-name-different--removed--can-be-soft-removed')

            // Requires force: unmerged branches
            expect(store.requiresForce).toContain('delta/with-commits--remote-deleted--needs-force')
            expect(store.requiresForce).toContain('charlie/local-never-pushed')

            // Info only: renamed locally but remote still exists
            expect(store.infoOnly).toContain('golf/renamed-locally--not-deleted-on-remote--not-offered-for-deletion')

            // Protected branches should not appear in any group
            expect(store.safeToDelete).not.toContain('main')
            expect(store.safeToDelete).not.toContain('develop')
            expect(store.requiresForce).not.toContain('main')
            expect(store.requiresForce).not.toContain('develop')
        })

        it('should exclude current branch from all groups', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findStaleBranches()

            expect(store.currentBranch).toBe('main')
            expect(store.safeToDelete).not.toContain('main')
            expect(store.requiresForce).not.toContain('main')
            expect(store.infoOnly).not.toContain('main')
        })
    })

    describe('reason methods', () => {
        it('should provide reasons for safe-to-delete branches', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findStaleBranches()

            // Stale branch (was on remote, now deleted)
            const staleReason = store.getSafeToDeleteReason('alpha/pushed-then-deleted-from-remote--no-commits')
            expect(staleReason).toContain('merged')
            expect(staleReason).toContain('remote deleted')

            // Local-only merged branch
            const localReason = store.getSafeToDeleteReason('bravo/local-merged--never-on-remote')
            expect(localReason).toContain('merged')
            expect(localReason).toContain('local only')
        })

        it('should provide reasons for requires-force branches', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findStaleBranches()

            // Stale but unmerged
            const staleReason = store.getRequiresForceReason('delta/with-commits--remote-deleted--needs-force')
            expect(staleReason).toContain('unmerged')
            expect(staleReason).toContain('remote deleted')

            // Local only unmerged
            const localReason = store.getRequiresForceReason('charlie/local-never-pushed')
            expect(localReason).toContain('unmerged')
            expect(localReason).toContain('local only')
        })

        it('should provide reasons for info-only branches', async () => {
            const store = new BranchStore({ remote: 'origin' })
            await store.findStaleBranches()

            const reason = store.getInfoOnlyReason(
                'golf/renamed-locally--not-deleted-on-remote--not-offered-for-deletion',
            )
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
        await store.findStaleBranches()

        // Queue a known safe branch
        store.setQueuedForDeletion(['alpha/pushed-then-deleted-from-remote--no-commits'], [])

        const result = await store.deleteBranches()

        expect(result.success).toContain('alpha/pushed-then-deleted-from-remote--no-commits')
        expect(result.failed).toEqual([])
    })

    it('should delete force branches with -D flag', async () => {
        const store = new BranchStore({ remote: 'origin' })
        await store.findStaleBranches()

        // Queue a branch that requires force
        store.setQueuedForDeletion([], ['charlie/local-never-pushed'])

        const result = await store.deleteBranches()

        expect(result.success).toContain('charlie/local-never-pushed')
        expect(result.failed).toEqual([])
    })

    it('should handle branches with special characters', async () => {
        const store = new BranchStore({ remote: 'origin' })
        await store.findStaleBranches()

        // Queue branch with special chars
        store.setQueuedForDeletion(['#567--echo--special-chars--pushed-then-deleted-from-remote--no-commits'], [])

        const result = await store.deleteBranches()

        expect(result.success).toContain('#567--echo--special-chars--pushed-then-deleted-from-remote--no-commits')
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
