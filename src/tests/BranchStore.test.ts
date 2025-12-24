import stdoutModule from 'easy-stdout'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BranchStore from '../utils/BranchStore.js'

// Mock the stdout module
vi.mock('easy-stdout', () => ({
    default: vi.fn(() => ({
        stdout: vi.fn(),
    })),
}))

// Mock ora
vi.mock('ora', () => ({
    default: vi.fn(() => ({
        start: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
        fail: vi.fn().mockReturnThis(),
        color: '',
    })),
}))

const mockStdout = vi.mocked(stdoutModule)

describe('BranchStore', () => {
    let branchStore: BranchStore
    let consoleLogSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        branchStore = new BranchStore({
            remote: 'origin',
        })

        // Spy on console methods
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        // Reset mocks
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('constructor', () => {
        it('should initialize with provided options', () => {
            const store = new BranchStore({
                remote: 'upstream',
            })

            expect(store.remote).toBe('upstream')
        })

        it('should initialize arrays as empty', () => {
            expect(branchStore.remoteBranches).toEqual([])
            expect(branchStore.localOrphanedBranches).toEqual([])
            expect(branchStore.staleBranches).toEqual([])
            expect(branchStore.queuedForDeletion).toEqual([])
            expect(branchStore.queuedForForceDeletion).toEqual([])
            expect(branchStore.failedToDelete).toEqual([])
            expect(branchStore.liveBranches).toEqual([])
            expect(branchStore.unmergedBranches).toEqual([])
            expect(branchStore.neverPushedBranches).toEqual([])
            expect(branchStore.mergedBranches).toEqual([])
            expect(branchStore.safeToDelete).toEqual([])
            expect(branchStore.requiresForce).toEqual([])
            expect(branchStore.infoOnly).toEqual([])
        })

        it('should initialize protected branches', () => {
            expect(branchStore.protectedBranches).toEqual(['main', 'master', 'develop', 'development'])
        })

        it('should initialize currentBranch as empty string', () => {
            expect(branchStore.currentBranch).toBe('')
        })

        it('should initialize noConnection as false', () => {
            expect(branchStore.noConnection).toBe(false)
        })
    })

    describe('setQueuedForDeletion', () => {
        it('should update both queuedForDeletion arrays', () => {
            const safeBranches = ['branch1', 'branch2']
            const forceBranches = ['branch3']
            branchStore.setQueuedForDeletion(safeBranches, forceBranches)
            expect(branchStore.queuedForDeletion).toEqual(safeBranches)
            expect(branchStore.queuedForForceDeletion).toEqual(forceBranches)
        })
    })

    describe('findLocalBranches', () => {
        it('should parse local branches with upstream information', async () => {
            const gitOutput = `main@{refs/remotes/origin/main}
feature/test@{refs/remotes/origin/feature/test}
hotfix/bug@{refs/remotes/origin/hotfix/bug}
local-only@{}
another@{refs/remotes/upstream/another}`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findLocalOrphanedBranches()

            expect(branchStore.localOrphanedBranches).toEqual([
                { localBranch: 'main', remoteBranch: 'main' },
                { localBranch: 'feature/test', remoteBranch: 'feature/test' },
                { localBranch: 'hotfix/bug', remoteBranch: 'hotfix/bug' },
            ])
        })

        it('should handle branches with special characters', async () => {
            const gitOutput = `#333-work@{refs/remotes/origin/#333-work}
feature/with-dash@{refs/remotes/origin/feature/with-dash}`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findLocalOrphanedBranches()

            expect(branchStore.localOrphanedBranches).toEqual([
                { localBranch: '#333-work', remoteBranch: '#333-work' },
                { localBranch: 'feature/with-dash', remoteBranch: 'feature/with-dash' },
            ])
        })

        it('should ignore branches without upstream or different remote', async () => {
            const gitOutput = `main@{refs/remotes/origin/main}
local-only@{}
upstream-branch@{refs/remotes/upstream/upstream-branch}`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findLocalOrphanedBranches()

            expect(branchStore.localOrphanedBranches).toEqual([{ localBranch: 'main', remoteBranch: 'main' }])
        })
    })

    describe('findLiveBranches', () => {
        it('should throw error when remote is empty', async () => {
            branchStore.remote = ''

            await expect(branchStore.findLiveBranches()).rejects.toThrow(
                'Remote is empty. Please specify remote with -r parameter',
            )
        })

        it('should set noConnection when remote is not found', async () => {
            mockStdout.mockResolvedValueOnce('upstream\tgit@github.com:user/repo.git (fetch)')

            await branchStore.findLiveBranches()

            expect(branchStore.noConnection).toBe(true)
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('WARNING: Unable to find remote "origin"'),
            )
        })

        it('should parse live branches from git ls-remote output', async () => {
            const remotesOutput = 'origin\tgit@github.com:user/repo.git (fetch)'
            const lsRemoteOutput = `abc123\trefs/heads/main
def456\trefs/heads/feature/test
ghi789\trefs/heads/hotfix/bug`

            mockStdout.mockResolvedValueOnce(remotesOutput).mockResolvedValueOnce(lsRemoteOutput)

            await branchStore.findLiveBranches()

            expect(branchStore.liveBranches).toEqual(['main', 'feature/test', 'hotfix/bug'])
            expect(branchStore.noConnection).toBe(false)
        })

        it('should handle git ls-remote connection error (code 128)', async () => {
            const remotesOutput = 'origin\tgit@github.com:user/repo.git (fetch)'
            const error = new Error('Connection failed')
            // @ts-expect-error - adding custom error code for test
            error.code = '128'

            mockStdout.mockResolvedValueOnce(remotesOutput).mockRejectedValueOnce(error)

            await branchStore.findLiveBranches()

            expect(branchStore.noConnection).toBe(true)
            expect(branchStore.liveBranches).toEqual([])
        })

        it('should re-throw non-128 errors', async () => {
            const remotesOutput = 'origin\tgit@github.com:user/repo.git (fetch)'
            const error = new Error('Other git error')
            // @ts-expect-error - adding custom error code for test
            error.code = '1'

            mockStdout.mockResolvedValueOnce(remotesOutput).mockRejectedValueOnce(error)

            await expect(branchStore.findLiveBranches()).rejects.toThrow('Other git error')
        })
    })

    describe('findUnmergedBranches', () => {
        it('should parse unmerged branches', async () => {
            const gitOutput = `feature/wip
hotfix/incomplete
develop
local-only`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findUnmergedBranches()

            expect(branchStore.unmergedBranches).toEqual(['feature/wip', 'hotfix/incomplete', 'develop', 'local-only'])
        })

        it('should handle branches with special characters', async () => {
            const gitOutput = `#333-work
feature/with-dash`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findUnmergedBranches()

            expect(branchStore.unmergedBranches).toEqual(['#333-work', 'feature/with-dash'])
        })

        it('should include all unmerged branches regardless of upstream', async () => {
            const gitOutput = `feature/wip
local-only
upstream-branch`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findUnmergedBranches()

            expect(branchStore.unmergedBranches).toEqual(['feature/wip', 'local-only', 'upstream-branch'])
        })

        it('should handle empty output when all branches are merged', async () => {
            const gitOutput = ''

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findUnmergedBranches()

            expect(branchStore.unmergedBranches).toEqual([])
        })

        it('should store branch names from git output', async () => {
            const gitOutput = `my-local-branch`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findUnmergedBranches()

            expect(branchStore.unmergedBranches).toEqual(['my-local-branch'])
        })
    })

    describe('findRemoteBranches', () => {
        it('should parse remote branches from git branch -r output', async () => {
            const gitOutput = `  origin/main
  origin/feature/test
  origin/hotfix/bug
  upstream/other-branch`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findRemoteBranches()

            expect(branchStore.remoteBranches).toEqual(['main', 'feature/test', 'hotfix/bug'])
        })

        it('should handle branches with special characters', async () => {
            const gitOutput = `  origin/#333-work
  origin/feature/with-dash
  origin/release/v1.0.0`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findRemoteBranches()

            expect(branchStore.remoteBranches).toEqual(['#333-work', 'feature/with-dash', 'release/v1.0.0'])
        })

        it('should filter out branches from other remotes', async () => {
            const gitOutput = `  origin/main
  upstream/feature
  origin/develop`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findRemoteBranches()

            expect(branchStore.remoteBranches).toEqual(['main', 'develop'])
        })
    })

    describe('preprocess', () => {
        it('should reset all arrays and call all find methods', async () => {
            // Set some initial data
            branchStore.remoteBranches = ['old-data']
            branchStore.localOrphanedBranches = [{ localBranch: 'old', remoteBranch: 'old' }]
            branchStore.staleBranches = ['old-stale']
            branchStore.liveBranches = ['old-live']
            branchStore.unmergedBranches = ['old-unmerged']
            branchStore.noConnection = true

            // Mock all the methods
            const findCurrentBranchSpy = vi.spyOn(branchStore, 'findCurrentBranch').mockResolvedValue()
            const findLiveBranchesSpy = vi.spyOn(branchStore, 'findLiveBranches').mockResolvedValue()
            const findLocalOrphanedBranchesSpy = vi.spyOn(branchStore, 'findLocalOrphanedBranches').mockResolvedValue()
            const findUnmergedBranchesSpy = vi.spyOn(branchStore, 'findUnmergedBranches').mockResolvedValue()
            const findRemoteBranchesSpy = vi.spyOn(branchStore, 'findRemoteBranches').mockResolvedValue()
            const findNeverPushedBranchesSpy = vi.spyOn(branchStore, 'findNeverPushedBranches').mockResolvedValue()
            const findMergedBranchesSpy = vi.spyOn(branchStore, 'findMergedBranches').mockResolvedValue()
            const classifyBranchesSpy = vi.spyOn(branchStore, 'classifyBranches').mockImplementation(() => {})

            await branchStore.preprocess()

            // Check arrays are reset
            expect(branchStore.remoteBranches).toEqual([])
            expect(branchStore.localOrphanedBranches).toEqual([])
            expect(branchStore.staleBranches).toEqual([])
            expect(branchStore.liveBranches).toEqual([])
            expect(branchStore.unmergedBranches).toEqual([])
            expect(branchStore.neverPushedBranches).toEqual([])
            expect(branchStore.mergedBranches).toEqual([])
            expect(branchStore.safeToDelete).toEqual([])
            expect(branchStore.requiresForce).toEqual([])
            expect(branchStore.infoOnly).toEqual([])
            expect(branchStore.noConnection).toBe(false)

            // Check methods are called
            expect(findCurrentBranchSpy).toHaveBeenCalled()
            expect(findLiveBranchesSpy).toHaveBeenCalled()
            expect(findLocalOrphanedBranchesSpy).toHaveBeenCalled()
            expect(findUnmergedBranchesSpy).toHaveBeenCalled()
            expect(findRemoteBranchesSpy).toHaveBeenCalled()
            expect(findNeverPushedBranchesSpy).toHaveBeenCalled()
            expect(findMergedBranchesSpy).toHaveBeenCalled()
            expect(classifyBranchesSpy).toHaveBeenCalled()
        })
    })

    describe('findStaleBranches', () => {
        it('should identify stale branches correctly', async () => {
            // Mock preprocess to manually set the data, then also calculate staleBranches
            const preprocessSpy = vi.spyOn(branchStore, 'preprocess').mockImplementation(async () => {
                branchStore.localOrphanedBranches = [
                    { localBranch: 'main', remoteBranch: 'main' },
                    { localBranch: 'feature/old', remoteBranch: 'feature/old' },
                    { localBranch: 'hotfix/bug', remoteBranch: 'hotfix/bug' },
                    { localBranch: 'feature/new', remoteBranch: 'feature/new' },
                ]
                branchStore.remoteBranches = ['main', 'feature/new']

                // Calculate staleBranches (this now happens in preprocess)
                branchStore.staleBranches = branchStore.localOrphanedBranches
                    .filter(({ remoteBranch }) => !branchStore.remoteBranches.includes(remoteBranch))
                    .map(({ localBranch }) => localBranch)
            })

            const result = await branchStore.findStaleBranches()

            expect(preprocessSpy).toHaveBeenCalled()
            expect(branchStore.staleBranches).toEqual(['feature/old', 'hotfix/bug'])
            expect(result).toEqual(['feature/old', 'hotfix/bug'])
        })

        it('should return empty array when no stale branches', async () => {
            const preprocessSpy = vi.spyOn(branchStore, 'preprocess').mockImplementation(async () => {
                branchStore.localOrphanedBranches = [
                    { localBranch: 'main', remoteBranch: 'main' },
                    { localBranch: 'develop', remoteBranch: 'develop' },
                ]
                branchStore.remoteBranches = ['main', 'develop']

                // Calculate staleBranches (this now happens in preprocess)
                branchStore.staleBranches = branchStore.localOrphanedBranches
                    .filter(({ remoteBranch }) => !branchStore.remoteBranches.includes(remoteBranch))
                    .map(({ localBranch }) => localBranch)
            })

            const result = await branchStore.findStaleBranches()

            expect(preprocessSpy).toHaveBeenCalled()
            expect(result).toEqual([])
        })
    })

    describe('deleteBranches', () => {
        it('should return empty arrays when no branches queued for deletion', async () => {
            branchStore.queuedForDeletion = []
            branchStore.queuedForForceDeletion = []

            const result = await branchStore.deleteBranches()

            expect(result.success).toEqual([])
            expect(result.failed).toEqual([])
        })

        it('should delete safe branches successfully', async () => {
            branchStore.queuedForDeletion = ['branch1', 'branch2']
            branchStore.queuedForForceDeletion = []
            mockStdout.mockResolvedValue('')

            const result = await branchStore.deleteBranches()

            expect(mockStdout).toHaveBeenCalledWith('git branch -d "branch1"')
            expect(mockStdout).toHaveBeenCalledWith('git branch -d "branch2"')
            expect(result.success).toEqual(['branch1', 'branch2'])
            expect(result.failed).toEqual([])
            expect(branchStore.failedToDelete).toEqual([])
        })

        it('should delete force branches with -D flag', async () => {
            branchStore.queuedForDeletion = []
            branchStore.queuedForForceDeletion = ['branch1', 'branch2']
            mockStdout.mockResolvedValue('')

            const result = await branchStore.deleteBranches()

            expect(mockStdout).toHaveBeenCalledWith('git branch -D "branch1"')
            expect(mockStdout).toHaveBeenCalledWith('git branch -D "branch2"')
            expect(result.success).toEqual(['branch1', 'branch2'])
            expect(result.failed).toEqual([])
        })

        it('should delete both safe and force branches', async () => {
            branchStore.queuedForDeletion = ['safe1', 'safe2']
            branchStore.queuedForForceDeletion = ['force1']
            mockStdout.mockResolvedValue('')

            const result = await branchStore.deleteBranches()

            expect(mockStdout).toHaveBeenCalledWith('git branch -d "safe1"')
            expect(mockStdout).toHaveBeenCalledWith('git branch -d "safe2"')
            expect(mockStdout).toHaveBeenCalledWith('git branch -D "force1"')
            expect(result.success).toEqual(['safe1', 'safe2', 'force1'])
            expect(result.failed).toEqual([])
        })

        it('should handle failed deletions', async () => {
            branchStore.queuedForDeletion = ['branch1', 'branch2']
            branchStore.queuedForForceDeletion = []
            mockStdout
                .mockResolvedValueOnce('') // branch1 succeeds
                .mockRejectedValueOnce(new Error('Cannot delete')) // branch2 fails

            const result = await branchStore.deleteBranches()

            expect(result.success).toEqual(['branch1'])
            expect(result.failed).toHaveLength(1)
            expect(result.failed[0]!.branch).toBe('branch2')
            expect(result.failed[0]!.error).toContain('Cannot delete')
            expect(branchStore.failedToDelete).toHaveLength(1)
        })

        it('should handle branches with special characters in names', async () => {
            branchStore.queuedForDeletion = ['#333-work', 'feature/with spaces']
            branchStore.queuedForForceDeletion = []
            mockStdout.mockResolvedValue('')

            await branchStore.deleteBranches()

            expect(mockStdout).toHaveBeenCalledWith('git branch -d "#333-work"')
            expect(mockStdout).toHaveBeenCalledWith('git branch -d "feature/with spaces"')
        })
    })

    describe('integration scenarios', () => {
        it('should handle complete workflow with stale branches', async () => {
            // Mock git command outputs based on command
            mockStdout.mockImplementation(async (command: string) => {
                if (command === 'git fetch origin --prune') {
                    return ''
                }
                if (command === 'git branch --show-current') {
                    return 'main'
                }
                if (command === 'git remote -v') {
                    return 'origin\tgit@github.com:user/repo.git (fetch)'
                }
                if (command === 'git ls-remote -h origin') {
                    return `abc123\trefs/heads/main
def456\trefs/heads/develop`
                }
                if (command === 'git branch --format="%(refname:short)@{%(upstream)}"') {
                    return `main@{refs/remotes/origin/main}
develop@{refs/remotes/origin/develop}
feature/old@{refs/remotes/origin/feature/old}`
                }
                if (command === 'git branch --format="%(refname:short)" --no-merged') {
                    return '' // No unmerged branches
                }
                if (command === 'git branch --format="%(refname:short)" --merged') {
                    return `main
develop
feature/old`
                }
                if (command === 'git branch -r') {
                    return `  origin/main
  origin/develop`
                }
                return ''
            })

            const staleBranches = await branchStore.findStaleBranches()

            expect(staleBranches).toEqual(['feature/old'])
            expect(branchStore.localOrphanedBranches).toHaveLength(3)
        })

        it('should handle no connection scenario', async () => {
            const remotesOutput = 'upstream\tgit@github.com:user/repo.git (fetch)' // Wrong remote

            mockStdout.mockResolvedValueOnce(remotesOutput)

            await branchStore.findLiveBranches()

            expect(branchStore.noConnection).toBe(true)
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('WARNING: Unable to find remote "origin"'),
            )
        })
    })
})
