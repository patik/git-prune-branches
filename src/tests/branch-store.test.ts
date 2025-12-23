import stdoutModule from 'easy-stdout'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BranchStore from '../utils/branch-store.js'

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
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>
    let consoleInfoSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        branchStore = new BranchStore({
            remote: 'origin',
            force: false,
            dryRun: false,
            pruneAll: false,
            skipConfirmation: false,
        })

        // Spy on console methods
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

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
                force: true,
                dryRun: true,
                pruneAll: true,
                skipConfirmation: true,
            })

            expect(store.remote).toBe('upstream')
            expect(store.force).toBe(true)
            expect(store.dryRun).toBe(true)
            expect(store.pruneAll).toBe(true)
            expect(store.skipConfirmation).toBe(true)
        })

        it('should initialize arrays as empty', () => {
            expect(branchStore.remoteBranches).toEqual([])
            expect(branchStore.localBranches).toEqual([])
            expect(branchStore.staleBranches).toEqual([])
            expect(branchStore.queuedForDeletion).toEqual([])
            expect(branchStore.failedToDelete).toEqual([])
            expect(branchStore.liveBranches).toEqual([])
            expect(branchStore.unmergedBranches).toEqual([])
        })

        it('should initialize noConnection as false', () => {
            expect(branchStore.noConnection).toBe(false)
        })
    })

    describe('setForce', () => {
        it('should update the force property', () => {
            expect(branchStore.force).toBe(false)
            branchStore.setForce(true)
            expect(branchStore.force).toBe(true)
        })
    })

    describe('setQueuedForDeletion', () => {
        it('should update the queuedForDeletion array', () => {
            const branches = ['branch1', 'branch2']
            branchStore.setQueuedForDeletion(branches)
            expect(branchStore.queuedForDeletion).toEqual(branches)
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

            await branchStore.findLocalBranches()

            expect(branchStore.localBranches).toEqual([
                { localBranch: 'main', remoteBranch: 'main' },
                { localBranch: 'feature/test', remoteBranch: 'feature/test' },
                { localBranch: 'hotfix/bug', remoteBranch: 'hotfix/bug' },
            ])
        })

        it('should handle branches with special characters', async () => {
            const gitOutput = `#333-work@{refs/remotes/origin/#333-work}
feature/with-dash@{refs/remotes/origin/feature/with-dash}`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findLocalBranches()

            expect(branchStore.localBranches).toEqual([
                { localBranch: '#333-work', remoteBranch: '#333-work' },
                { localBranch: 'feature/with-dash', remoteBranch: 'feature/with-dash' },
            ])
        })

        it('should ignore branches without upstream or different remote', async () => {
            const gitOutput = `main@{refs/remotes/origin/main}
local-only@{}
upstream-branch@{refs/remotes/upstream/upstream-branch}`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findLocalBranches()

            expect(branchStore.localBranches).toEqual([{ localBranch: 'main', remoteBranch: 'main' }])
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
        it('should parse unmerged branches with upstream information', async () => {
            const gitOutput = `feature/wip@{refs/remotes/origin/feature/wip}
hotfix/incomplete@{refs/remotes/origin/hotfix/incomplete}
develop@{refs/remotes/origin/develop}
local-only@{}
another@{refs/remotes/upstream/another}`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findUnmergedBranches()

            expect(branchStore.unmergedBranches).toEqual(['feature/wip', 'hotfix/incomplete', 'develop'])
        })

        it('should handle branches with special characters', async () => {
            const gitOutput = `#333-work@{refs/remotes/origin/#333-work}
feature/with-dash@{refs/remotes/origin/feature/with-dash}`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findUnmergedBranches()

            expect(branchStore.unmergedBranches).toEqual(['#333-work', 'feature/with-dash'])
        })

        it('should ignore branches without upstream or different remote', async () => {
            const gitOutput = `feature/wip@{refs/remotes/origin/feature/wip}
local-only@{}
upstream-branch@{refs/remotes/upstream/upstream-branch}`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findUnmergedBranches()

            expect(branchStore.unmergedBranches).toEqual(['feature/wip'])
        })

        it('should handle empty output when all branches are merged', async () => {
            const gitOutput = ''

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findUnmergedBranches()

            expect(branchStore.unmergedBranches).toEqual([])
        })

        it('should only store local branch names, not remote branch names', async () => {
            const gitOutput = `my-local-name@{refs/remotes/origin/different-remote-name}`

            mockStdout.mockResolvedValueOnce(gitOutput)

            await branchStore.findUnmergedBranches()

            expect(branchStore.unmergedBranches).toEqual(['my-local-name'])
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

    describe('analyzeLiveAndCache', () => {
        beforeEach(() => {
            branchStore.remoteBranches = ['main', 'feature/old', 'hotfix/bug']
            branchStore.liveBranches = ['main', 'develop', 'feature/new']
        })

        it('should warn when no connection and return early', async () => {
            branchStore.noConnection = true

            await branchStore.analyzeLiveAndCache()

            expect(consoleWarnSpy).toHaveBeenCalledWith('WARNING: Unable to connect to remote host')
            // remoteBranches should not be updated
            expect(branchStore.remoteBranches).toEqual(['main', 'feature/old', 'hotfix/bug'])
        })

        it('should warn about outdated branches and update remoteBranches', async () => {
            await branchStore.analyzeLiveAndCache()

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('WARNING: Your git repository is outdated'),
            )
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('- feature/old'))
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('- hotfix/bug'))
            expect(branchStore.remoteBranches).toEqual(['main', 'develop', 'feature/new'])
        })

        it('should not warn when all remote branches are live', async () => {
            branchStore.remoteBranches = ['main']
            branchStore.liveBranches = ['main', 'develop']

            await branchStore.analyzeLiveAndCache()

            expect(consoleWarnSpy).not.toHaveBeenCalled()
            expect(branchStore.remoteBranches).toEqual(['main', 'develop'])
        })

        it('should ignore HEAD branch in comparison', async () => {
            branchStore.remoteBranches = ['main', 'HEAD', 'feature/old']
            branchStore.liveBranches = ['main', 'develop']

            await branchStore.analyzeLiveAndCache()

            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('- feature/old'))
            expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining('- HEAD'))
        })
    })

    describe('preprocess', () => {
        it('should reset all arrays and call all find methods', async () => {
            // Set some initial data
            branchStore.remoteBranches = ['old-data']
            branchStore.localBranches = [{ localBranch: 'old', remoteBranch: 'old' }]
            branchStore.staleBranches = ['old-stale']
            branchStore.liveBranches = ['old-live']
            branchStore.unmergedBranches = ['old-unmerged']
            branchStore.noConnection = true

            // Mock all the methods
            const findLiveBranchesSpy = vi.spyOn(branchStore, 'findLiveBranches').mockResolvedValue()
            const findLocalBranchesSpy = vi.spyOn(branchStore, 'findLocalBranches').mockResolvedValue()
            const findUnmergedBranchesSpy = vi.spyOn(branchStore, 'findUnmergedBranches').mockResolvedValue()
            const findRemoteBranchesSpy = vi.spyOn(branchStore, 'findRemoteBranches').mockResolvedValue()
            const analyzeLiveAndCacheSpy = vi.spyOn(branchStore, 'analyzeLiveAndCache').mockResolvedValue()

            await branchStore.preprocess()

            // Check arrays are reset
            expect(branchStore.remoteBranches).toEqual([])
            expect(branchStore.localBranches).toEqual([])
            expect(branchStore.staleBranches).toEqual([])
            expect(branchStore.liveBranches).toEqual([])
            expect(branchStore.unmergedBranches).toEqual([])
            expect(branchStore.noConnection).toBe(false)

            // Check methods are called in correct order
            expect(findLiveBranchesSpy).toHaveBeenCalled()
            expect(findLocalBranchesSpy).toHaveBeenCalled()
            expect(findUnmergedBranchesSpy).toHaveBeenCalled()
            expect(findRemoteBranchesSpy).toHaveBeenCalled()
            expect(analyzeLiveAndCacheSpy).toHaveBeenCalled()
        })
    })

    describe('findStaleBranches', () => {
        it('should identify stale branches correctly', async () => {
            const preprocessSpy = vi.spyOn(branchStore, 'preprocess').mockResolvedValue()

            branchStore.localBranches = [
                { localBranch: 'main', remoteBranch: 'main' },
                { localBranch: 'feature/old', remoteBranch: 'feature/old' },
                { localBranch: 'hotfix/bug', remoteBranch: 'hotfix/bug' },
                { localBranch: 'feature/new', remoteBranch: 'feature/new' },
            ]
            branchStore.remoteBranches = ['main', 'feature/new']

            const result = await branchStore.findStaleBranches()

            expect(preprocessSpy).toHaveBeenCalled()
            expect(branchStore.staleBranches).toEqual(['feature/old', 'hotfix/bug'])
            expect(result).toEqual(['feature/old', 'hotfix/bug'])
        })

        it('should return empty array when no stale branches', async () => {
            const preprocessSpy = vi.spyOn(branchStore, 'preprocess').mockResolvedValue()

            branchStore.localBranches = [
                { localBranch: 'main', remoteBranch: 'main' },
                { localBranch: 'develop', remoteBranch: 'develop' },
            ]
            branchStore.remoteBranches = ['main', 'develop']

            const result = await branchStore.findStaleBranches()

            expect(preprocessSpy).toHaveBeenCalled()
            expect(result).toEqual([])
        })
    })

    describe('deleteBranches', () => {
        it('should log message when no branches queued for deletion', async () => {
            branchStore.queuedForDeletion = []

            await branchStore.deleteBranches()

            expect(consoleInfoSpy).toHaveBeenCalledWith('No remotely removed branches found')
        })

        it('should show branches in dry run mode', async () => {
            branchStore.dryRun = true
            branchStore.queuedForDeletion = ['branch1', 'branch2']

            await branchStore.deleteBranches()

            expect(consoleLogSpy).toHaveBeenCalledWith('Found remotely removed branches:')

            // Check all info calls in order
            expect(consoleInfoSpy).toHaveBeenNthCalledWith(1, '  - branch1')
            expect(consoleInfoSpy).toHaveBeenNthCalledWith(2, '  - branch2')
            expect(consoleInfoSpy).toHaveBeenNthCalledWith(3) // Empty call
            expect(consoleInfoSpy).toHaveBeenNthCalledWith(4, 'ℹ️ To remove branches, don’t include the --dry-run flag')
        })

        it('should delete branches successfully without force', async () => {
            branchStore.queuedForDeletion = ['branch1', 'branch2']
            mockStdout.mockResolvedValue('')

            await branchStore.deleteBranches()

            expect(mockStdout).toHaveBeenCalledWith('git branch -d "branch1"')
            expect(mockStdout).toHaveBeenCalledWith('git branch -d "branch2"')
            expect(branchStore.failedToDelete).toEqual([])
        })

        it('should delete branches with force flag', async () => {
            branchStore.force = true
            branchStore.queuedForDeletion = ['branch1']
            mockStdout.mockResolvedValue('')

            await branchStore.deleteBranches()

            expect(mockStdout).toHaveBeenCalledWith('git branch -D "branch1"')
        })

        it('should handle failed deletions', async () => {
            branchStore.queuedForDeletion = ['branch1', 'branch2']
            mockStdout
                .mockResolvedValueOnce('') // branch1 succeeds
                .mockRejectedValueOnce(new Error('Cannot delete')) // branch2 fails

            await branchStore.deleteBranches()

            expect(branchStore.failedToDelete).toEqual(['branch2'])
        })

        it('should handle branches with special characters in names', async () => {
            branchStore.queuedForDeletion = ['#333-work', 'feature/with spaces']
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
                if (command === 'git branch --format="%(refname:short)@{%(upstream)}" --no-merged') {
                    return '' // No unmerged branches
                }
                if (command === 'git branch -r') {
                    return `  origin/main
  origin/develop
  origin/feature/old`
                }
                return ''
            })

            const staleBranches = await branchStore.findStaleBranches()

            expect(staleBranches).toEqual(['feature/old'])
            expect(branchStore.localBranches).toHaveLength(3)
            expect(branchStore.remoteBranches).toEqual(['main', 'develop']) // Updated by analyzeLiveAndCache
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
