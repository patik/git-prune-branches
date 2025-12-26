import { confirm } from '@inquirer/prompts'
import groupedCheckbox from 'inquirer-grouped-checkbox'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmDeletion } from '../program/confirm-deletion.js'
import { executeDeletions } from '../program/execute-deletions.js'
import { selectBranches } from '../program/select-branches.js'
import store from '../program/store.js'

// Mock process.exit to throw an error to stop execution
vi.mock('node:process', async () => {
    const actual = await vi.importActual('node:process')
    return {
        ...actual,
        exit: vi.fn(() => {
            throw new Error('process.exit called')
        }),
    }
})

// Mock inquirer modules
vi.mock('@inquirer/prompts', () => ({
    confirm: vi.fn(),
}))

vi.mock('inquirer-grouped-checkbox', () => ({
    default: vi.fn(),
}))

// Mock simple-stdout for git operations
vi.mock('simple-stdout', () => ({
    default: vi.fn(),
}))

// Mock ora spinner
vi.mock('ora', () => ({
    default: vi.fn(() => ({
        start: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
        fail: vi.fn().mockReturnThis(),
        warn: vi.fn().mockReturnThis(),
        color: '',
    })),
}))

const mockGroupedCheckbox = vi.mocked(groupedCheckbox)
const mockConfirm = vi.mocked(confirm)

// Get mock exit after import
let mockExit: ReturnType<typeof vi.fn>

describe('Grouped Checkbox UI V2 (e2e)', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>
    let consoleInfoSpy: ReturnType<typeof vi.spyOn>

    beforeEach(async () => {
        // Get the mock exit function
        const process = await import('node:process')
        mockExit = vi.mocked(process.exit)

        // Spy on console methods
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

        // Reset mocks
        mockExit.mockClear()
        mockGroupedCheckbox.mockClear()
        mockConfirm.mockClear()
        consoleLogSpy.mockClear()
        consoleInfoSpy.mockClear()

        // Reset store state
        store.staleBranches = []
        store.unmergedBranches = []
        store.queuedForDeletion = []
        store.queuedForForceDeletion = []
        store.failedToDelete = []
        store.safeToDelete = []
        store.requiresForce = []
        store.infoOnly = []
        store.currentBranch = ''
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('selectBranches - 3 group structure', () => {
        it('should display 3 groups: safe, force, and info', async () => {
            store.safeToDelete = ['feature/safe-1', 'feature/safe-2']
            store.requiresForce = ['feature/unmerged']
            store.infoOnly = ['feature/renamed']

            mockGroupedCheckbox.mockResolvedValueOnce({
                safe: ['feature/safe-1'],
                force: [],
                info: [],
            })

            vi.spyOn(store, 'findStaleBranches').mockImplementation(async () => [])

            await selectBranches()

            expect(mockGroupedCheckbox).toHaveBeenCalledWith({
                message: 'Select branches to remove',
                pageSize: 40,
                groups: [
                    {
                        key: 'safe',
                        label: 'Safe to delete',
                        icon: '✅',
                        choices: expect.arrayContaining([
                            expect.objectContaining({ value: 'feature/safe-1', checked: true }),
                            expect.objectContaining({ value: 'feature/safe-2', checked: true }),
                        ]),
                    },
                    {
                        key: 'force',
                        label: expect.stringContaining('Requires force delete'),
                        icon: '⚠️',
                        choices: expect.arrayContaining([
                            expect.objectContaining({ value: 'feature/unmerged', checked: false }),
                        ]),
                    },
                    {
                        key: 'info',
                        label: expect.stringContaining('Info only'),
                        icon: 'ℹ️',
                        choices: expect.arrayContaining([
                            expect.objectContaining({ value: 'feature/renamed', disabled: true }),
                        ]),
                    },
                ],
                searchable: true,
            })
        })

        it('should pre-select safe branches by default', async () => {
            store.safeToDelete = ['branch1', 'branch2']
            store.requiresForce = []
            store.infoOnly = []
            store.staleBranches = ['branch1', 'branch2']

            mockGroupedCheckbox.mockResolvedValueOnce({ safe: ['branch1', 'branch2'], force: [], info: [] })
            vi.spyOn(store, 'findStaleBranches').mockImplementation(async () => [])

            await selectBranches()

            const call = mockGroupedCheckbox.mock.calls[0]?.[0]
            const safeGroup = call?.groups.find((g: { key: string }) => g.key === 'safe')

            expect(safeGroup?.choices).toEqual([
                { value: 'branch1', name: expect.stringContaining('branch1'), checked: true },
                { value: 'branch2', name: expect.stringContaining('branch2'), checked: true },
            ])
        })

        it('should NOT pre-select force branches', async () => {
            store.safeToDelete = []
            store.requiresForce = ['unmerged1', 'unmerged2']
            store.infoOnly = []
            store.staleBranches = ['unmerged1', 'unmerged2']

            mockGroupedCheckbox.mockResolvedValueOnce({ safe: [], force: [], info: [] })
            vi.spyOn(store, 'findStaleBranches').mockImplementation(async () => [])

            await selectBranches()

            const call = mockGroupedCheckbox.mock.calls[0]?.[0]
            const forceGroup = call?.groups.find((g: { key: string }) => g.key === 'force')

            expect(forceGroup?.choices).toEqual([
                { value: 'unmerged1', name: expect.stringContaining('unmerged1'), checked: false },
                { value: 'unmerged2', name: expect.stringContaining('unmerged2'), checked: false },
            ])
        })

        it('should disable info-only branches', async () => {
            store.safeToDelete = ['safe-branch'] // Need at least one deletable branch so UI is shown
            store.requiresForce = []
            store.infoOnly = ['renamed-branch']
            store.staleBranches = ['safe-branch']

            mockGroupedCheckbox.mockResolvedValueOnce({ safe: [], force: [], info: [] })
            vi.spyOn(store, 'findStaleBranches').mockImplementation(async () => [])

            await selectBranches()

            const call = mockGroupedCheckbox.mock.calls[0]?.[0]
            const infoGroup = call?.groups.find((g: { key: string }) => g.key === 'info')

            expect(infoGroup?.choices).toEqual([
                { value: 'renamed-branch', name: expect.stringContaining('renamed-branch'), disabled: true },
            ])
        })
    })

    describe('confirmDeletion - command preview', () => {
        it('should show git commands for both safe and force deletions', async () => {
            mockConfirm.mockResolvedValueOnce(true)

            await confirmDeletion(['safe1', 'safe2'], ['force1'])

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('The following commands will be executed'),
            )
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Safe deletes (2 branches)'))
            expect(consoleLogSpy).toHaveBeenCalledWith('  git branch -d safe1')
            expect(consoleLogSpy).toHaveBeenCalledWith('  git branch -d safe2')
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Force deletes (1 branch)'))
            expect(consoleLogSpy).toHaveBeenCalledWith('  git branch -D force1')
        })

        it('should return false when no branches selected', async () => {
            const result = await confirmDeletion([], [])

            expect(result).toBe(false)
            expect(consoleInfoSpy).toHaveBeenCalledWith('👋 No branches selected')
            expect(mockConfirm).not.toHaveBeenCalled()
        })

        it('should show correct message for single branch', async () => {
            mockConfirm.mockResolvedValueOnce(true)

            await confirmDeletion(['single'], [])

            expect(mockConfirm).toHaveBeenCalledWith({
                message: 'Delete 1 branch?',
                default: false,
            })
        })

        it('should show correct message for multiple branches', async () => {
            mockConfirm.mockResolvedValueOnce(true)

            await confirmDeletion(['b1', 'b2'], ['b3'])

            expect(mockConfirm).toHaveBeenCalledWith({
                message: 'Delete 3 branches?',
                default: false,
            })
        })
    })

    describe('executeDeletions - results and cleanup', () => {
        it('should call setQueuedForDeletion with both arrays', async () => {
            const setQueuedSpy = vi.spyOn(store, 'setQueuedForDeletion')
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce({ success: ['b1'], failed: [] })

            await executeDeletions(['b1'], ['b2'])

            expect(setQueuedSpy).toHaveBeenCalledWith(['b1'], ['b2'])
        })

        it('should show success message when all deletions succeed', async () => {
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce({
                success: ['b1', 'b2', 'b3'],
                failed: [],
            })

            await executeDeletions(['b1', 'b2'], ['b3'])

            expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully deleted 3 branch'))
        })

        it('should show failure message with details when some fail', async () => {
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce({
                success: ['b1'],
                failed: [{ branch: 'b2', error: 'Branch not fully merged' }],
            })

            await executeDeletions(['b1'], ['b2'])

            expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Deleted 1 of 2 branches'))
            expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to delete'))
            expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('b2'))
        })
    })

    describe('no stale branches', () => {
        it('should exit early when no branches to delete', async () => {
            store.safeToDelete = []
            store.requiresForce = []
            store.infoOnly = []

            vi.spyOn(store, 'findStaleBranches').mockImplementation(async () => {
                // Branches already set above
                return []
            })

            try {
                await selectBranches()
            } catch (e) {
                // Exit throws in tests
            }

            expect(consoleInfoSpy).toHaveBeenCalledWith('✅ No stale branches were found')
            expect(mockExit).toHaveBeenCalledWith(0)
            expect(mockGroupedCheckbox).not.toHaveBeenCalled()
        })

        it('should show info-only branches when no deletable branches exist', async () => {
            store.safeToDelete = []
            store.requiresForce = []
            store.infoOnly = ['renamed1', 'renamed2']

            vi.spyOn(store, 'findStaleBranches').mockImplementation(async () => [])

            try {
                await selectBranches()
            } catch (e) {
                // Exit throws in tests
            }

            expect(consoleInfoSpy).toHaveBeenCalledWith('✅ No deletable branches were found')
            expect(consoleInfoSpy).toHaveBeenCalledWith(
                expect.stringContaining('Some branches are renamed locally but still exist on remote'),
            )
            expect(mockExit).toHaveBeenCalledWith(0)
        })
    })

    describe('full e2e flow', () => {
        it('should work end-to-end with safe and force branches', async () => {
            // Setup
            store.safeToDelete = ['safe1', 'safe2']
            store.requiresForce = ['force1']
            store.infoOnly = []

            // User selects some branches
            mockGroupedCheckbox.mockResolvedValueOnce({
                safe: ['safe1'],
                force: ['force1'],
                info: [],
            })

            // User confirms
            mockConfirm.mockResolvedValueOnce(true)

            // Mock successful deletions
            vi.spyOn(store, 'findStaleBranches').mockImplementation(async () => [])
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce({
                success: ['safe1', 'force1'],
                failed: [],
            })

            // Execute flow
            const { safe, force } = await selectBranches()
            const confirmed = await confirmDeletion(safe, force)
            expect(confirmed).toBe(true)

            const exitCode = await executeDeletions(safe, force)

            // Verify
            expect(safe).toEqual(['safe1'])
            expect(force).toEqual(['force1'])
            expect(exitCode).toBe(0)
            expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully deleted 2 branch'))
        })

        it('should handle user cancellation', async () => {
            store.safeToDelete = ['branch1']
            store.requiresForce = []
            store.infoOnly = []

            mockGroupedCheckbox.mockResolvedValueOnce({ safe: ['branch1'], force: [], info: [] })
            mockConfirm.mockResolvedValueOnce(false) // User cancels

            vi.spyOn(store, 'findStaleBranches').mockImplementation(async () => [])

            const { safe, force } = await selectBranches()
            const confirmed = await confirmDeletion(safe, force)

            expect(confirmed).toBe(false)
            expect(safe).toEqual(['branch1'])
        })
    })
})
