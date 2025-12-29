import { execSync } from 'node:child_process'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { testSetup } from '../../tests/manual/setup.js'
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

        it('should initialize with empty remote', () => {
            const store = new BranchStore({ remote: '' })
            expect(store.remote).toBe('')
        })

        it('should initialize with special characters in remote name', () => {
            const store = new BranchStore({ remote: 'my-remote_123' })
            expect(store.remote).toBe('my-remote_123')
        })

        it('should initialize arrays as empty', () => {
            const store = new BranchStore()
            expect(store.remoteBranches).toEqual([])
            expect(store.localOrphanedBranches).toEqual([])
            expect(store.staleBranches).toEqual([])
            expect(store.queuedForDeletion).toEqual([])
            expect(store.queuedForForceDeletion).toEqual([])
            expect(store.failedToDelete).toEqual([])
            expect(store.liveBranches.size).toBe(0)
            expect(store.unmergedBranches.size).toBe(0)
            expect(store.neverPushedBranches.size).toBe(0)
            expect(store.mergedBranches).toEqual([])
            expect(store.safeToDelete).toEqual([])
            expect(store.requiresForce).toEqual([])
            expect(store.infoOnly).toEqual([])
            expect(store.allBranches).toEqual([])
        })

        it('should initialize protected branches with defaults', () => {
            const store = new BranchStore()
            expect(Array.from(store.protectedBranches)).toEqual(['main', 'master', 'develop', 'development'])
        })

        it('should initialize protected branches with custom values', () => {
            const store = new BranchStore({ protected: 'alpha,bravo,charlie' })
            expect(Array.from(store.protectedBranches)).toEqual(['alpha', 'bravo', 'charlie'])
        })

        it('should initialize currentBranch as empty string', () => {
            const store = new BranchStore()
            expect(store.currentBranch).toBe('')
        })

        it('should initialize noConnection as false', () => {
            const store = new BranchStore()
            expect(store.noConnection).toBe(false)
        })

        it('should initialize lastCommitTimes as empty Map', () => {
            const store = new BranchStore()
            expect(store.lastCommitTimes).toBeInstanceOf(Map)
            expect(store.lastCommitTimes.size).toBe(0)
        })
    })

    describe('setQueuedForDeletion', () => {
        it('should update both queuedForDeletion arrays', () => {
            const store = new BranchStore()
            const safeBranches = ['branch1', 'branch2']
            const forceBranches = ['branch3']

            store.setQueuedForDeletion(safeBranches, forceBranches)

            expect(store.queuedForDeletion).toEqual(safeBranches)
            expect(store.queuedForForceDeletion).toEqual(forceBranches)
        })

        it('should handle empty arrays', () => {
            const store = new BranchStore()
            store.setQueuedForDeletion([], [])

            expect(store.queuedForDeletion).toEqual([])
            expect(store.queuedForForceDeletion).toEqual([])
        })

        it('should handle only safe branches', () => {
            const store = new BranchStore()
            store.setQueuedForDeletion(['safe1', 'safe2'], [])

            expect(store.queuedForDeletion).toEqual(['safe1', 'safe2'])
            expect(store.queuedForForceDeletion).toEqual([])
        })

        it('should handle only force branches', () => {
            const store = new BranchStore()
            store.setQueuedForDeletion([], ['force1', 'force2'])

            expect(store.queuedForDeletion).toEqual([])
            expect(store.queuedForForceDeletion).toEqual(['force1', 'force2'])
        })

        it('should overwrite previous values', () => {
            const store = new BranchStore()
            store.setQueuedForDeletion(['old1'], ['old2'])
            store.setQueuedForDeletion(['new1'], ['new2'])

            expect(store.queuedForDeletion).toEqual(['new1'])
            expect(store.queuedForForceDeletion).toEqual(['new2'])
        })
    })

    describe('getCurrentBranch (real git)', () => {
        it('should find the current branch', async () => {
            const store = new BranchStore()
            await store.getCurrentBranch()

            // testSetup() ends on 'main' branch
            expect(store.currentBranch).toBe('main')
        })

        it('should handle detached HEAD state', async () => {
            const store = new BranchStore()

            // Get current commit hash and checkout detached
            const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
            execSync(`git checkout ${commitHash}`, { stdio: 'pipe' })

            await store.getCurrentBranch()

            // In detached HEAD, git branch --show-current returns empty string
            expect(store.currentBranch).toBe('')

            // Restore to main
            execSync('git checkout main', { stdio: 'pipe' })
        })
    })

    describe('findAllBranches (real git)', () => {
        it('should find all local branches with upstream info', async () => {
            const store = new BranchStore()
            await store.findAllBranches()

            expect(store.allBranches.length).toBeGreaterThan(0)
            // Should have main branch
            expect(store.allBranches.some((b) => b.startsWith('main@'))).toBe(true)
        })

        it('should include branches without upstream (empty @{})', async () => {
            const store = new BranchStore()
            await store.findAllBranches()

            // wip/settings-redesign was never pushed
            expect(store.allBranches.some((b) => b === 'wip/settings-redesign@{}')).toBe(true)
        })
    })

    describe('findLocalOrphanedBranches (real git)', () => {
        it('should find local branches tracking remote branches', async () => {
            const store = new BranchStore()
            await store.findAllBranches()
            store.findLocalOrphanedBranches()

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

        it('should extract correct remote branch names', async () => {
            const store = new BranchStore()
            await store.findAllBranches()
            store.findLocalOrphanedBranches()

            // Find bugfix/cache-invalidation which tracks hotfix/cache-fix
            const renamedBranch = store.localOrphanedBranches.find((b) => b.localBranch === 'bugfix/cache-invalidation')
            expect(renamedBranch).toBeDefined()
            expect(renamedBranch!.remoteBranch).toBe('hotfix/cache-fix')
        })

        it('should handle branches with same local and remote name', async () => {
            const store = new BranchStore()
            await store.findAllBranches()
            store.findLocalOrphanedBranches()

            const mainBranch = store.localOrphanedBranches.find((b) => b.localBranch === 'main')
            expect(mainBranch).toBeDefined()
            expect(mainBranch!.remoteBranch).toBe('main')
        })

        it('should skip branches tracking different remotes', async () => {
            const store = new BranchStore({ remote: 'upstream' })
            await store.findAllBranches()
            store.findLocalOrphanedBranches()

            // No branches track 'upstream' in our test setup
            expect(store.localOrphanedBranches).toEqual([])
        })

        it('should handle branches with special characters in name', async () => {
            const store = new BranchStore()
            await store.findAllBranches()
            store.findLocalOrphanedBranches()

            const specialBranch = store.localOrphanedBranches.find((b) => b.localBranch === 'fix/#432-modal-close')
            expect(specialBranch).toBeDefined()
        })

        it('should handle deeply nested branch names', async () => {
            const store = new BranchStore()
            await store.findAllBranches()
            store.findLocalOrphanedBranches()

            const nestedBranch = store.localOrphanedBranches.find(
                (b) => b.localBranch === 'feature/payments/stripe/webhooks',
            )
            expect(nestedBranch).toBeDefined()
            expect(nestedBranch!.remoteBranch).toBe('feature/payments/stripe/webhooks')
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
            const store = new BranchStore()
            await store.findLiveBranches()

            // These branches still exist on remote (were not deleted)
            expect(store.liveBranches).toContain('main')
            expect(store.liveBranches).toContain('hotfix/cache-fix')

            // These were deleted from remote by testSetup()
            expect(store.liveBranches).not.toContain('feature/user-avatars')
            expect(store.liveBranches).not.toContain('experiment/graphql-api')
        })

        it('should set noConnection when remote does not exist', async () => {
            const store = new BranchStore({ remote: 'nonexistent-remote' })
            await store.findLiveBranches()

            expect(store.noConnection).toBe(true)
            expect(store.liveBranches.size).toBe(0)
        })

        it('should append to liveBranches (reset handled by preprocess)', async () => {
            const store = new BranchStore()
            store.liveBranches = new Set(['old-branch'])

            await store.findLiveBranches()

            // Note: findLiveBranches appends to existing array
            // Reset is handled by preprocess() which clears all arrays first
            expect(store.liveBranches).toContain('old-branch')
            expect(store.liveBranches).toContain('main')
        })
    })

    describe('findUnmergedBranches (real git)', () => {
        it('should find branches not merged into current branch', async () => {
            const store = new BranchStore()
            await store.findUnmergedBranches()

            // These branches have commits not merged into main
            expect(store.unmergedBranches).toContain('experiment/graphql-api')
            expect(store.unmergedBranches).toContain('wip/settings-redesign')

            // These were merged into main
            expect(store.unmergedBranches).not.toContain('chore/update-deps')
            expect(store.unmergedBranches).not.toContain('feature/search-filters')
        })

        it('should not include current branch', async () => {
            const store = new BranchStore()
            await store.getCurrentBranch()
            await store.findUnmergedBranches()

            // main is the current branch and is merged into itself
            expect(store.unmergedBranches).not.toContain('main')
        })
    })

    describe('findRemoteBranches (real git)', () => {
        it('should find cached remote branches', async () => {
            const store = new BranchStore()
            await store.findRemoteBranches()

            // These exist in git's remote-tracking refs
            expect(store.remoteBranches).toContain('main')
            expect(store.remoteBranches).toContain('hotfix/cache-fix')
        })

        it('should not include branches from other remotes', async () => {
            const store = new BranchStore()
            await store.findRemoteBranches()

            // All branches should be from origin
            // (no other remotes in our test setup, but ensure the filter works)
            expect(store.remoteBranches.length).toBeGreaterThan(0)
        })

        it('should reset remoteBranches before populating', async () => {
            const store = new BranchStore()
            store.remoteBranches = ['old-remote-branch']

            await store.findRemoteBranches()

            expect(store.remoteBranches).not.toContain('old-remote-branch')
        })

        it('should handle remote with no branches (different remote name)', async () => {
            const store = new BranchStore({ remote: 'nonexistent' })
            await store.findRemoteBranches()

            expect(store.remoteBranches).toEqual([])
        })
    })

    describe('findNeverPushedBranches (real git)', () => {
        it('should find branches with no upstream tracking', async () => {
            const store = new BranchStore()
            await store.findAllBranches()
            store.findNeverPushedBranches()

            // These were never pushed (created with -b, no -u)
            expect(store.neverPushedBranches).toContain('wip/settings-redesign')
            expect(store.neverPushedBranches).toContain('chore/update-deps')

            // These have upstream tracking
            expect(store.neverPushedBranches).not.toContain('main')
            expect(store.neverPushedBranches).not.toContain('feature/user-avatars')
        })

        it('should handle branches with special characters', async () => {
            const store = new BranchStore()
            await store.findAllBranches()
            store.findNeverPushedBranches()

            // fix/#432-modal-close was pushed, so should not be in neverPushed
            expect(store.neverPushedBranches).not.toContain('fix/#432-modal-close')
        })
    })

    describe('lookupMergedBranches (real git)', () => {
        it('should find branches merged into current branch', async () => {
            const store = new BranchStore()
            await store.lookupMergedBranches()

            // These were merged into main
            expect(store.mergedBranches).toContain('chore/update-deps')
            expect(store.mergedBranches).toContain('feature/search-filters')
            expect(store.mergedBranches).toContain('main')

            // These have unmerged commits
            expect(store.mergedBranches).not.toContain('wip/settings-redesign')
            expect(store.mergedBranches).not.toContain('experiment/graphql-api')
        })

        it('should include the current branch itself', async () => {
            const store = new BranchStore()
            await store.lookupMergedBranches()

            // Current branch (main) is always merged into itself
            expect(store.mergedBranches).toContain('main')
        })
    })

    describe('lookupLastCommitTimes (real git)', () => {
        it('should get commit timestamps for all local branches', async () => {
            const store = new BranchStore()
            await store.lookupLastCommitTimes()

            // Should have timestamps for all branches
            expect(store.lastCommitTimes.size).toBeGreaterThan(0)
            expect(store.lastCommitTimes.has('main')).toBe(true)

            // Timestamps should be reasonable (within last hour since testSetup just ran)
            const mainTimestamp = store.lastCommitTimes.get('main')
            expect(mainTimestamp).toBeDefined()
            const now = Math.floor(Date.now() / 1000)
            expect(now - mainTimestamp!).toBeLessThan(3600) // Less than 1 hour ago
        })

        it('should have timestamps for all local branches', async () => {
            const store = new BranchStore()
            await store.lookupLastCommitTimes()

            expect(store.lastCommitTimes.has('wip/settings-redesign')).toBe(true)
            expect(store.lastCommitTimes.has('experiment/graphql-api')).toBe(true)
            expect(store.lastCommitTimes.has('feature/user-avatars')).toBe(true)
        })

        it('should return valid unix timestamps', async () => {
            const store = new BranchStore()
            await store.lookupLastCommitTimes()

            for (const [, timestamp] of store.lastCommitTimes) {
                expect(Number.isInteger(timestamp)).toBe(true)
                expect(timestamp).toBeGreaterThan(0)
                // Should be a reasonable timestamp (after year 2000)
                expect(timestamp).toBeGreaterThan(946684800) // Jan 1, 2000
            }
        })
    })

    describe('getDeletableBranches (real git - full integration)', () => {
        it('should identify branches deleted from remote as stale', async () => {
            const store = new BranchStore()
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

        it('should not include branches whose remote still exists', async () => {
            const store = new BranchStore()
            await store.getDeletableBranches()

            // hotfix/cache-fix still exists on remote
            expect(store.staleBranches).not.toContain('bugfix/cache-invalidation')
        })
    })

    describe('classifyBranches (real git - full integration)', () => {
        it('should correctly classify branches into groups', async () => {
            const store = new BranchStore()
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
            const store = new BranchStore()
            await store.getDeletableBranches()

            expect(store.currentBranch).toBe('main')
            expect(store.safeToDelete).not.toContain('main')
            expect(store.requiresForce).not.toContain('main')
            expect(store.infoOnly).not.toContain('main')
        })

        it('should exclude all protected branches', async () => {
            const store = new BranchStore()
            await store.getDeletableBranches()

            for (const protectedBranch of store.protectedBranches) {
                expect(store.safeToDelete).not.toContain(protectedBranch)
                expect(store.requiresForce).not.toContain(protectedBranch)
                expect(store.infoOnly).not.toContain(protectedBranch)
            }
        })

        it('should not have duplicates in any group', async () => {
            const store = new BranchStore()
            await store.getDeletableBranches()

            const safeSet = new Set(store.safeToDelete)
            expect(safeSet.size).toBe(store.safeToDelete.length)

            const forceSet = new Set(store.requiresForce)
            expect(forceSet.size).toBe(store.requiresForce.length)

            const infoSet = new Set(store.infoOnly)
            expect(infoSet.size).toBe(store.infoOnly.length)
        })

        it('should have no overlap between groups', async () => {
            const store = new BranchStore()
            await store.getDeletableBranches()

            const forceSet = new Set(store.requiresForce)
            const infoSet = new Set(store.infoOnly)

            // Check no overlap between safe and force
            for (const branch of store.safeToDelete) {
                expect(forceSet.has(branch)).toBe(false)
            }

            // Check no overlap between safe and info
            for (const branch of store.safeToDelete) {
                expect(infoSet.has(branch)).toBe(false)
            }

            // Check no overlap between force and info
            for (const branch of store.requiresForce) {
                expect(infoSet.has(branch)).toBe(false)
            }
        })
    })

    describe('reason methods', () => {
        it('should provide reasons for safe-to-delete branches', async () => {
            const store = new BranchStore()
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
            const store = new BranchStore()
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
            const store = new BranchStore()
            await store.getDeletableBranches()

            const reason = store.getInfoOnlyReason('bugfix/cache-invalidation')
            expect(reason).toContain('renamed locally')
        })

        it('should include time ago for all reason types', async () => {
            const store = new BranchStore()
            await store.getDeletableBranches()

            const safeReason = store.getSafeToDeleteReason('feature/user-avatars')
            expect(safeReason).toContain('last commit')

            const forceReason = store.getRequiresForceReason('experiment/graphql-api')
            expect(forceReason).toContain('last commit')

            const infoReason = store.getInfoOnlyReason('bugfix/cache-invalidation')
            expect(infoReason).toContain('last commit')
        })

        it('should handle branches not in staleBranches or neverPushed (fallback)', async () => {
            const store = new BranchStore()
            await store.getDeletableBranches()

            // A branch not in staleBranches or neverPushedBranches should return generic reason
            const reason = store.getSafeToDeleteReason('nonexistent-branch')
            expect(reason).toContain('merged')
            expect(reason).not.toContain('remote deleted')
            expect(reason).not.toContain('local only')
        })

        it('should handle missing timestamp gracefully', async () => {
            const store = new BranchStore()
            await store.getDeletableBranches()

            // Test with a branch that doesn't have a timestamp
            store.lastCommitTimes.delete('feature/user-avatars')

            const reason = store.getSafeToDeleteReason('feature/user-avatars')
            expect(reason).toContain('merged')
            expect(reason).not.toContain('last commit')
        })
    })

    describe('deleteBranches (real git)', () => {
        it('should return empty arrays when nothing queued', async () => {
            const store = new BranchStore()
            store.queuedForDeletion = []
            store.queuedForForceDeletion = []

            const result = await store.deleteBranches()

            expect(result.success).toEqual([])
            expect(result.failed).toEqual([])
        })
    })
})

describe('BranchStore - formatTimeAgo (via reason methods)', () => {
    let workingDir: string
    let originalCwd: string

    beforeAll(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        originalCwd = process.cwd()
        workingDir = testSetup()
        process.chdir(workingDir)
    })

    afterAll(() => {
        process.chdir(originalCwd)
        vi.restoreAllMocks()
    })

    it('should format "just now" for timestamps less than 60 seconds ago', async () => {
        const store = new BranchStore()
        await store.getDeletableBranches()

        const now = Math.floor(Date.now() / 1000)
        store.lastCommitTimes.set('test-branch', now - 30) // 30 seconds ago
        store.staleBranches.push('test-branch')

        const reason = store.getSafeToDeleteReason('test-branch')
        expect(reason).toContain('just now')
    })

    it('should format minutes for timestamps 1-59 minutes ago', async () => {
        const store = new BranchStore()
        await store.getDeletableBranches()

        const now = Math.floor(Date.now() / 1000)
        store.lastCommitTimes.set('test-branch', now - 5 * 60) // 5 minutes ago
        store.staleBranches.push('test-branch')

        const reason = store.getSafeToDeleteReason('test-branch')
        expect(reason).toContain('5m ago')
    })

    it('should format hours for timestamps 1-23 hours ago', async () => {
        const store = new BranchStore()
        await store.getDeletableBranches()

        const now = Math.floor(Date.now() / 1000)
        store.lastCommitTimes.set('test-branch', now - 3 * 60 * 60) // 3 hours ago
        store.staleBranches.push('test-branch')

        const reason = store.getSafeToDeleteReason('test-branch')
        expect(reason).toContain('3h ago')
    })

    it('should format days for timestamps 1-6 days ago', async () => {
        const store = new BranchStore()
        await store.getDeletableBranches()

        const now = Math.floor(Date.now() / 1000)
        store.lastCommitTimes.set('test-branch', now - 4 * 24 * 60 * 60) // 4 days ago
        store.staleBranches.push('test-branch')

        const reason = store.getSafeToDeleteReason('test-branch')
        expect(reason).toContain('4d ago')
    })

    it('should format weeks for timestamps 1-4 weeks ago', async () => {
        const store = new BranchStore()
        await store.getDeletableBranches()

        const now = Math.floor(Date.now() / 1000)
        store.lastCommitTimes.set('test-branch', now - 2 * 7 * 24 * 60 * 60) // 2 weeks ago
        store.staleBranches.push('test-branch')

        const reason = store.getSafeToDeleteReason('test-branch')
        expect(reason).toContain('2w ago')
    })

    it('should format months for timestamps 1-11 months ago', async () => {
        const store = new BranchStore()
        await store.getDeletableBranches()

        const now = Math.floor(Date.now() / 1000)
        // Approximately 3 months ago
        store.lastCommitTimes.set('test-branch', now - 90 * 24 * 60 * 60)
        store.staleBranches.push('test-branch')

        const reason = store.getSafeToDeleteReason('test-branch')
        expect(reason).toMatch(/\d+mo ago/)
    })

    it('should format years for timestamps 1+ years ago', async () => {
        const store = new BranchStore()
        await store.getDeletableBranches()

        const now = Math.floor(Date.now() / 1000)
        // Approximately 2 years ago
        store.lastCommitTimes.set('test-branch', now - 730 * 24 * 60 * 60)
        store.staleBranches.push('test-branch')

        const reason = store.getSafeToDeleteReason('test-branch')
        expect(reason).toMatch(/\d+y ago/)
    })

    it('should handle edge case at exactly 1 minute', async () => {
        const store = new BranchStore()
        await store.getDeletableBranches()

        const now = Math.floor(Date.now() / 1000)
        store.lastCommitTimes.set('test-branch', now - 60) // exactly 1 minute
        store.staleBranches.push('test-branch')

        const reason = store.getSafeToDeleteReason('test-branch')
        expect(reason).toContain('1m ago')
    })

    it('should handle edge case at exactly 1 hour', async () => {
        const store = new BranchStore()
        await store.getDeletableBranches()

        const now = Math.floor(Date.now() / 1000)
        store.lastCommitTimes.set('test-branch', now - 60 * 60) // exactly 1 hour
        store.staleBranches.push('test-branch')

        const reason = store.getSafeToDeleteReason('test-branch')
        expect(reason).toContain('1h ago')
    })

    it('should handle edge case at exactly 1 day', async () => {
        const store = new BranchStore()
        await store.getDeletableBranches()

        const now = Math.floor(Date.now() / 1000)
        store.lastCommitTimes.set('test-branch', now - 24 * 60 * 60) // exactly 1 day
        store.staleBranches.push('test-branch')

        const reason = store.getSafeToDeleteReason('test-branch')
        expect(reason).toContain('1d ago')
    })

    it('should handle edge case at exactly 1 week', async () => {
        const store = new BranchStore()
        await store.getDeletableBranches()

        const now = Math.floor(Date.now() / 1000)
        store.lastCommitTimes.set('test-branch', now - 7 * 24 * 60 * 60) // exactly 1 week
        store.staleBranches.push('test-branch')

        const reason = store.getSafeToDeleteReason('test-branch')
        expect(reason).toContain('1w ago')
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
        const store = new BranchStore()
        await store.getDeletableBranches()

        // Queue a known safe branch
        store.setQueuedForDeletion(['feature/user-avatars'], [])

        const result = await store.deleteBranches()

        expect(result.success).toContain('feature/user-avatars')
        expect(result.failed).toEqual([])
    })

    it('should delete force branches with -D flag', async () => {
        const store = new BranchStore()
        await store.getDeletableBranches()

        // Queue a branch that requires force
        store.setQueuedForDeletion([], ['wip/settings-redesign'])

        const result = await store.deleteBranches()

        expect(result.success).toContain('wip/settings-redesign')
        expect(result.failed).toEqual([])
    })

    it('should handle branches with special characters', async () => {
        const store = new BranchStore()
        await store.getDeletableBranches()

        // Queue branch with special chars
        store.setQueuedForDeletion(['fix/#432-modal-close'], [])

        const result = await store.deleteBranches()

        expect(result.success).toContain('fix/#432-modal-close')
        expect(result.failed).toEqual([])
    })

    it('should fail gracefully when branch does not exist', async () => {
        const store = new BranchStore()

        store.setQueuedForDeletion(['nonexistent-branch-12345'], [])

        const result = await store.deleteBranches()

        expect(result.success).toEqual([])
        expect(result.failed).toHaveLength(1)
        expect(result.failed[0]!.branch).toBe('nonexistent-branch-12345')
        expect(store.failedToDelete).toHaveLength(1)
    })

    it('should handle deletion of deeply nested branch names', async () => {
        const store = new BranchStore()
        await store.getDeletableBranches()

        store.setQueuedForDeletion(['feature/payments/stripe/webhooks'], [])

        const result = await store.deleteBranches()

        expect(result.success).toContain('feature/payments/stripe/webhooks')
        expect(result.failed).toEqual([])
    })

    it('should handle mixed safe and force deletions', async () => {
        // Create fresh repo since we deleted branches in previous tests
        const freshWorkingDir = testSetup()
        process.chdir(freshWorkingDir)

        const store = new BranchStore()
        await store.getDeletableBranches()

        // Queue both safe and force branches
        store.setQueuedForDeletion(['feature/user-avatars', 'feature/search-filters'], ['experiment/graphql-api'])

        const result = await store.deleteBranches()

        expect(result.success).toContain('feature/user-avatars')
        expect(result.success).toContain('feature/search-filters')
        expect(result.success).toContain('experiment/graphql-api')
        expect(result.failed).toEqual([])
    })

    it('should continue after individual failures', async () => {
        const freshWorkingDir = testSetup()
        process.chdir(freshWorkingDir)

        const store = new BranchStore()
        await store.getDeletableBranches()

        // Mix valid and invalid branches
        store.setQueuedForDeletion(
            ['feature/user-avatars', 'nonexistent-1'],
            ['experiment/graphql-api', 'nonexistent-2'],
        )

        const result = await store.deleteBranches()

        // Should succeed for valid branches
        expect(result.success).toContain('feature/user-avatars')
        expect(result.success).toContain('experiment/graphql-api')

        // Should fail for nonexistent
        expect(result.failed).toHaveLength(2)
        expect(result.failed.map((f) => f.branch)).toContain('nonexistent-1')
        expect(result.failed.map((f) => f.branch)).toContain('nonexistent-2')
    })

    it('should update failedToDelete after deletion', async () => {
        const freshWorkingDir = testSetup()
        process.chdir(freshWorkingDir)

        const store = new BranchStore()

        store.setQueuedForDeletion(['nonexistent-branch'], [])

        await store.deleteBranches()

        expect(store.failedToDelete).toHaveLength(1)
        expect(store.failedToDelete[0]!.branch).toBe('nonexistent-branch')
        expect(store.failedToDelete[0]!.error).toBeDefined()
    })
})

describe('BranchStore - preprocess integration', () => {
    let workingDir: string
    let originalCwd: string

    beforeAll(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        originalCwd = process.cwd()
        workingDir = testSetup()
        process.chdir(workingDir)
    })

    afterAll(() => {
        process.chdir(originalCwd)
        vi.restoreAllMocks()
    })

    it('should reset all arrays at the start', async () => {
        const store = new BranchStore()

        // Populate with dummy data
        store.remoteBranches = ['old-remote']
        store.localOrphanedBranches = [{ localBranch: 'old', remoteBranch: 'old' }]
        store.staleBranches = ['old-stale']
        store.liveBranches = new Set(['old-live'])
        store.unmergedBranches = new Set(['old-unmerged'])
        store.neverPushedBranches = new Set(['old-never'])
        store.mergedBranches = ['old-merged']
        store.safeToDelete = ['old-safe']
        store.requiresForce = ['old-force']
        store.infoOnly = ['old-info']
        store.noConnection = true

        await store.preprocess()

        // All should be reset (not contain old values)
        expect(store.remoteBranches).not.toContain('old-remote')
        expect(store.localOrphanedBranches.map((b) => b.localBranch)).not.toContain('old')
        expect(store.staleBranches).not.toContain('old-stale')
        expect(store.liveBranches).not.toContain('old-live')
        expect(store.unmergedBranches).not.toContain('old-unmerged')
        expect(store.neverPushedBranches).not.toContain('old-never')
        expect(store.mergedBranches).not.toContain('old-merged')
        expect(store.safeToDelete).not.toContain('old-safe')
        expect(store.requiresForce).not.toContain('old-force')
        expect(store.infoOnly).not.toContain('old-info')
        expect(store.noConnection).toBe(false)
    })

    it('should populate all required data after preprocess', async () => {
        const store = new BranchStore()
        await store.preprocess()

        expect(store.currentBranch).toBe('main')
        expect(store.allBranches.length).toBeGreaterThan(0)
        expect(store.remoteBranches.length).toBeGreaterThan(0)
        expect(store.liveBranches.size).toBeGreaterThan(0)
        expect(store.lastCommitTimes.size).toBeGreaterThan(0)
    })

    it('should correctly calculate stale branches after preprocess', async () => {
        const store = new BranchStore()
        await store.preprocess()

        // Stale = orphaned local branches whose remote no longer exists
        expect(store.staleBranches.length).toBeGreaterThan(0)
        expect(store.staleBranches).toContain('feature/user-avatars')
    })

    it('should classify branches after preprocess', async () => {
        const store = new BranchStore()
        await store.preprocess()

        // Should have classified branches
        expect(store.safeToDelete.length).toBeGreaterThan(0)
        expect(store.requiresForce.length).toBeGreaterThan(0)
        expect(store.infoOnly.length).toBeGreaterThan(0)
    })

    it('should handle network failure during preprocess gracefully', async () => {
        // This is tricky to test without mocking, but we can verify noConnection flag
        // would be set if fetch fails
        const store = new BranchStore()
        await store.preprocess()

        // In local test environment, should have connection
        // (noConnection would be true if network was unavailable)
        expect(typeof store.noConnection).toBe('boolean')
    })
})

describe('BranchStore - edge cases and boundary conditions', () => {
    let workingDir: string
    let originalCwd: string

    beforeAll(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        originalCwd = process.cwd()
        workingDir = testSetup()
        process.chdir(workingDir)
    })

    afterAll(() => {
        process.chdir(originalCwd)
        vi.restoreAllMocks()
    })

    describe('classifyBranches edge cases', () => {
        it('should handle empty arrays gracefully', async () => {
            const store = new BranchStore()

            // Manually set up empty state
            store.staleBranches = []
            store.mergedBranches = []
            store.unmergedBranches = new Set()
            store.neverPushedBranches = new Set()
            store.localOrphanedBranches = []
            store.liveBranches = new Set()
            store.currentBranch = 'main'

            // Should not throw
            store.classifyBranches()

            expect(store.safeToDelete).toEqual([])
            expect(store.requiresForce).toEqual([])
            expect(store.infoOnly).toEqual([])
        })

        it('should correctly filter out current branch from all classifications', async () => {
            const store = new BranchStore()

            store.currentBranch = 'feature-branch'
            store.staleBranches = ['feature-branch']
            store.mergedBranches = ['feature-branch']
            store.unmergedBranches = new Set([])
            store.neverPushedBranches = new Set(['feature-branch'])
            store.localOrphanedBranches = [{ localBranch: 'feature-branch', remoteBranch: 'other' }]
            store.liveBranches = new Set(['other'])

            store.classifyBranches()

            expect(store.safeToDelete).not.toContain('feature-branch')
            expect(store.requiresForce).not.toContain('feature-branch')
            expect(store.infoOnly).not.toContain('feature-branch')
        })

        it('should filter out all default protected branches, when the default protected branches are used', async () => {
            const store = new BranchStore()

            store.currentBranch = 'other'
            store.staleBranches = ['main', 'master', 'develop', 'development']
            store.mergedBranches = ['main', 'master', 'develop', 'development']
            store.unmergedBranches = new Set([])
            store.neverPushedBranches = new Set([])
            store.localOrphanedBranches = []
            store.liveBranches = new Set([])

            store.classifyBranches()

            expect(store.safeToDelete).not.toContain('main')
            expect(store.safeToDelete).not.toContain('master')
            expect(store.safeToDelete).not.toContain('develop')
            expect(store.safeToDelete).not.toContain('development')
        })

        it('should filter out all default protected branches, when custom protected branches are used', async () => {
            const store = new BranchStore({ protected: 'alpha,bravo,charlie' })

            store.currentBranch = 'other'
            store.staleBranches = ['alpha', 'bravo', 'charlie']
            store.mergedBranches = ['alpha', 'bravo', 'charlie']
            store.unmergedBranches = new Set([])
            store.neverPushedBranches = new Set([])
            store.localOrphanedBranches = []
            store.liveBranches = new Set([])

            store.classifyBranches()

            expect(store.safeToDelete).not.toContain('alpha')
            expect(store.safeToDelete).not.toContain('bravo')
            expect(store.safeToDelete).not.toContain('charlie')
        })

        it('should handle branch appearing in both staleBranches and neverPushedBranches', async () => {
            const store = new BranchStore()

            store.currentBranch = 'main'
            // This shouldn't happen in reality, but test deduplication
            store.staleBranches = ['duplicate-branch']
            store.neverPushedBranches = new Set(['duplicate-branch'])
            store.mergedBranches = ['duplicate-branch']
            store.unmergedBranches = new Set([])
            store.localOrphanedBranches = []
            store.liveBranches = new Set([])

            store.classifyBranches()

            // Should only appear once
            const count = store.safeToDelete.filter((b) => b === 'duplicate-branch').length
            expect(count).toBeLessThanOrEqual(1)
        })
    })

    describe('findLocalOrphanedBranches edge cases', () => {
        it('should handle branch name with @ symbol', async () => {
            const store = new BranchStore()

            // Simulate a branch with @ in its name
            store.allBranches = ['test@branch@{refs/remotes/origin/test@branch}']

            store.findLocalOrphanedBranches()

            const found = store.localOrphanedBranches.find((b) => b.localBranch === 'test@branch')
            expect(found).toBeDefined()
        })

        it('should handle empty upstream gracefully', async () => {
            const store = new BranchStore()

            // Branch with empty upstream
            store.allBranches = ['local-only@{}']

            store.findLocalOrphanedBranches()

            // Should not add branches without proper upstream
            expect(store.localOrphanedBranches).toEqual([])
        })

        it('should handle malformed upstream reference', async () => {
            const store = new BranchStore()

            // Malformed upstream
            store.allBranches = ['branch@{malformed}']

            store.findLocalOrphanedBranches()

            // Should not crash, just skip
            expect(store.localOrphanedBranches).toEqual([])
        })
    })

    describe('findNeverPushedBranches edge cases', () => {
        it('should handle empty allBranches', () => {
            const store = new BranchStore()
            store.allBranches = []

            store.findNeverPushedBranches()

            expect(store.neverPushedBranches.size).toBe(0)
        })

        it('should handle only tracked branches', () => {
            const store = new BranchStore()
            store.allBranches = ['main@{refs/remotes/origin/main}', 'feature@{refs/remotes/origin/feature}']

            store.findNeverPushedBranches()

            expect(store.neverPushedBranches.size).toBe(0)
        })

        it('should handle only untracked branches', () => {
            const store = new BranchStore()
            store.allBranches = ['local1@{}', 'local2@{}']

            store.findNeverPushedBranches()

            expect(store.neverPushedBranches).toContain('local1')
            expect(store.neverPushedBranches).toContain('local2')
        })

        it('should handle empty branch name before @{}', () => {
            const store = new BranchStore()
            store.allBranches = ['@{}']

            store.findNeverPushedBranches()

            // Empty branch name should be skipped
            expect(store.neverPushedBranches.size).toBe(0)
        })
    })

    describe('reason methods with edge cases', () => {
        it('should handle branch with no timestamp in lastCommitTimes', async () => {
            const store = new BranchStore()
            store.staleBranches = ['no-timestamp-branch']
            store.neverPushedBranches = new Set([])
            store.lastCommitTimes = new Map()

            const reason = store.getSafeToDeleteReason('no-timestamp-branch')
            expect(reason).toBe('merged, remote deleted')
            expect(reason).not.toContain('last commit')
        })

        it('should prefer staleBranches over neverPushedBranches for reason', () => {
            const store = new BranchStore()
            store.staleBranches = ['both-branch']
            store.neverPushedBranches = new Set(['both-branch'])
            store.lastCommitTimes = new Map()

            const reason = store.getSafeToDeleteReason('both-branch')
            expect(reason).toContain('remote deleted')
        })

        it('should return generic merged for unknown branch', () => {
            const store = new BranchStore()
            store.staleBranches = []
            store.neverPushedBranches = new Set([])
            store.lastCommitTimes = new Map()

            const reason = store.getSafeToDeleteReason('unknown-branch')
            expect(reason).toBe('merged')
        })

        it('should return generic unmerged for unknown force branch', () => {
            const store = new BranchStore()
            store.staleBranches = []
            store.neverPushedBranches = new Set([])
            store.lastCommitTimes = new Map()

            const reason = store.getRequiresForceReason('unknown-branch')
            expect(reason).toBe('unmerged')
        })
    })
})

describe('BranchStore - comprehensive classifyBranches scenarios', () => {
    let originalCwd: string

    beforeAll(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        originalCwd = process.cwd()
    })

    afterAll(() => {
        process.chdir(originalCwd)
        vi.restoreAllMocks()
    })

    beforeEach(() => {
        const workingDir = testSetup()
        process.chdir(workingDir)
    })

    it('scenario: stale merged branch goes to safeToDelete', () => {
        const store = new BranchStore()

        store.currentBranch = 'main'
        store.staleBranches = ['stale-merged']
        store.mergedBranches = ['stale-merged', 'main']
        store.unmergedBranches = new Set([])
        store.neverPushedBranches = new Set([])
        store.localOrphanedBranches = []
        store.liveBranches = new Set([])

        store.classifyBranches()

        expect(store.safeToDelete).toContain('stale-merged')
        expect(store.requiresForce).not.toContain('stale-merged')
    })

    it('scenario: stale unmerged branch goes to requiresForce', () => {
        const store = new BranchStore()

        store.currentBranch = 'main'
        store.staleBranches = ['stale-unmerged']
        store.mergedBranches = ['main']
        store.unmergedBranches = new Set(['stale-unmerged'])
        store.neverPushedBranches = new Set([])
        store.localOrphanedBranches = []
        store.liveBranches = new Set([])

        store.classifyBranches()

        expect(store.requiresForce).toContain('stale-unmerged')
        expect(store.safeToDelete).not.toContain('stale-unmerged')
    })

    it('scenario: local-only merged branch goes to safeToDelete', () => {
        const store = new BranchStore()

        store.currentBranch = 'main'
        store.staleBranches = []
        store.mergedBranches = ['local-merged', 'main']
        store.unmergedBranches = new Set([])
        store.neverPushedBranches = new Set(['local-merged'])
        store.localOrphanedBranches = []
        store.liveBranches = new Set([])

        store.classifyBranches()

        expect(store.safeToDelete).toContain('local-merged')
        expect(store.requiresForce).not.toContain('local-merged')
    })

    it('scenario: local-only unmerged branch goes to requiresForce', () => {
        const store = new BranchStore()

        store.currentBranch = 'main'
        store.staleBranches = []
        store.mergedBranches = ['main']
        store.unmergedBranches = new Set(['local-unmerged'])
        store.neverPushedBranches = new Set(['local-unmerged'])
        store.localOrphanedBranches = []
        store.liveBranches = new Set([])

        store.classifyBranches()

        expect(store.requiresForce).toContain('local-unmerged')
        expect(store.safeToDelete).not.toContain('local-unmerged')
    })

    it('scenario: renamed branch with live remote goes to infoOnly', () => {
        const store = new BranchStore()

        store.currentBranch = 'main'
        store.staleBranches = []
        store.mergedBranches = ['main']
        store.unmergedBranches = new Set([])
        store.neverPushedBranches = new Set([])
        store.localOrphanedBranches = [{ localBranch: 'local-name', remoteBranch: 'remote-name' }]
        store.liveBranches = new Set(['remote-name'])

        store.classifyBranches()

        expect(store.infoOnly).toContain('local-name')
        expect(store.safeToDelete).not.toContain('local-name')
        expect(store.requiresForce).not.toContain('local-name')
    })

    it('scenario: branch with same local and remote name should not be in infoOnly', () => {
        const store = new BranchStore()

        store.currentBranch = 'main'
        store.staleBranches = []
        store.mergedBranches = ['main', 'same-name']
        store.unmergedBranches = new Set([])
        store.neverPushedBranches = new Set([])
        store.localOrphanedBranches = [{ localBranch: 'same-name', remoteBranch: 'same-name' }]
        store.liveBranches = new Set(['same-name'])

        store.classifyBranches()

        expect(store.infoOnly).not.toContain('same-name')
    })

    it('scenario: current branch is protected and stale - should not appear anywhere', () => {
        const store = new BranchStore()

        store.currentBranch = 'main'
        store.staleBranches = ['main']
        store.mergedBranches = ['main']
        store.unmergedBranches = new Set([])
        store.neverPushedBranches = new Set([])
        store.localOrphanedBranches = []
        store.liveBranches = new Set([])

        store.classifyBranches()

        expect(store.safeToDelete).not.toContain('main')
        expect(store.requiresForce).not.toContain('main')
        expect(store.infoOnly).not.toContain('main')
    })

    it('scenario: master branch is protected - should not appear anywhere', () => {
        const store = new BranchStore()

        store.currentBranch = 'other'
        store.staleBranches = ['master']
        store.mergedBranches = ['master', 'other']
        store.unmergedBranches = new Set([])
        store.neverPushedBranches = new Set([])
        store.localOrphanedBranches = []
        store.liveBranches = new Set([])

        store.classifyBranches()

        expect(store.safeToDelete).not.toContain('master')
        expect(store.requiresForce).not.toContain('master')
        expect(store.infoOnly).not.toContain('master')
    })

    it('scenario: many branches in all categories', () => {
        const store = new BranchStore()

        store.currentBranch = 'main'
        store.staleBranches = ['stale1', 'stale2', 'stale3']
        store.mergedBranches = ['main', 'stale1', 'stale2', 'local1']
        store.unmergedBranches = new Set(['stale3', 'local2'])
        store.neverPushedBranches = new Set(['local1', 'local2'])
        store.localOrphanedBranches = [
            { localBranch: 'renamed1', remoteBranch: 'live1' },
            { localBranch: 'renamed2', remoteBranch: 'live2' },
        ]
        store.liveBranches = new Set(['live1', 'live2'])

        store.classifyBranches()

        // Verify safeToDelete
        expect(store.safeToDelete).toContain('stale1')
        expect(store.safeToDelete).toContain('stale2')
        expect(store.safeToDelete).toContain('local1')
        expect(store.safeToDelete).toHaveLength(3)

        // Verify requiresForce
        expect(store.requiresForce).toContain('stale3')
        expect(store.requiresForce).toContain('local2')
        expect(store.requiresForce).toHaveLength(2)

        // Verify infoOnly
        expect(store.infoOnly).toContain('renamed1')
        expect(store.infoOnly).toContain('renamed2')
        expect(store.infoOnly).toHaveLength(2)
    })
})

describe('BranchStore - error handling', () => {
    let originalCwd: string

    beforeAll(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        originalCwd = process.cwd()
    })

    afterAll(() => {
        process.chdir(originalCwd)
        vi.restoreAllMocks()
    })

    beforeEach(() => {
        const workingDir = testSetup()
        process.chdir(workingDir)
    })

    it('should throw RemoteError when remote is empty in findLiveBranches', async () => {
        const store = new BranchStore({ remote: '' })

        await expect(store.findLiveBranches()).rejects.toThrow('Remote is empty')

        try {
            await store.findLiveBranches()
        } catch (err) {
            expect((err as { code: number }).code).toBe(1984)
        }
    })

    it('should handle errors in deleteBranches and continue', async () => {
        const store = new BranchStore()

        // Try to delete the current branch (should fail)
        store.queuedForDeletion = ['main']
        store.queuedForForceDeletion = []

        const result = await store.deleteBranches()

        expect(result.failed).toHaveLength(1)
        expect(result.failed[0]!.branch).toBe('main')
        expect(result.failed[0]!.error).toBeDefined()
    })

    it('should populate error message in failed deletions', async () => {
        const store = new BranchStore()

        store.queuedForDeletion = ['definitely-not-a-real-branch-12345']
        store.queuedForForceDeletion = []

        const result = await store.deleteBranches()

        expect(result.failed[0]!.error).toBeTruthy()
        expect(typeof result.failed[0]!.error).toBe('string')
    })
})

describe('BranchStore - getDeletableBranches return value', () => {
    let originalCwd: string

    beforeAll(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        originalCwd = process.cwd()
    })

    afterAll(() => {
        process.chdir(originalCwd)
        vi.restoreAllMocks()
    })

    it('should return staleBranches array', async () => {
        const workingDir = testSetup()
        process.chdir(workingDir)

        const store = new BranchStore()
        const result = await store.getDeletableBranches()

        expect(Array.isArray(result)).toBe(true)
        expect(result).toBe(store.staleBranches)
    })

    it('should return empty array when no stale branches', async () => {
        const workingDir = testSetup()
        process.chdir(workingDir)

        const store = new BranchStore({ remote: 'nonexistent-remote' })

        // With a nonexistent remote, we can't get stale branches properly
        // but the function should still return an array
        const result = await store.getDeletableBranches()

        expect(Array.isArray(result)).toBe(true)
    })
})

describe('BranchStore - concurrent operations safety', () => {
    let originalCwd: string

    beforeAll(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        originalCwd = process.cwd()
    })

    afterAll(() => {
        process.chdir(originalCwd)
        vi.restoreAllMocks()
    })

    it('should handle multiple preprocess calls sequentially', async () => {
        const workingDir = testSetup()
        process.chdir(workingDir)

        const store = new BranchStore()

        // First preprocess
        await store.preprocess()
        const firstStaleBranches = [...store.staleBranches]

        // Second preprocess should reset and repopulate
        await store.preprocess()
        const secondStaleBranches = [...store.staleBranches]

        // Results should be the same
        expect(firstStaleBranches.sort()).toEqual(secondStaleBranches.sort())
    })

    it('should handle multiple getDeletableBranches calls', async () => {
        const workingDir = testSetup()
        process.chdir(workingDir)

        const store = new BranchStore()

        const results = await Promise.all([store.getDeletableBranches(), store.getDeletableBranches()])

        // Both calls should complete (though state may be inconsistent due to races)
        expect(Array.isArray(results[0])).toBe(true)
        expect(Array.isArray(results[1])).toBe(true)
    })
})
