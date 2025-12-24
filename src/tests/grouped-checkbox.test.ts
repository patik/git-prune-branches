import { confirm } from '@inquirer/prompts'
import groupedCheckbox from 'inquirer-grouped-checkbox'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { firstAttempt } from '../program/first-attempt.js'
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

// Mock easy-stdout for git operations
vi.mock('easy-stdout', () => ({
    default: vi.fn(),
}))

// Mock ora spinner
vi.mock('ora', () => ({
    default: vi.fn(() => ({
        start: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
        fail: vi.fn().mockReturnThis(),
        color: '',
    })),
}))

const mockGroupedCheckbox = vi.mocked(groupedCheckbox)
const mockConfirm = vi.mocked(confirm)

// Get mock exit after import
let mockExit: ReturnType<typeof vi.fn>

describe('Grouped Checkbox UI (e2e)', () => {
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
        store.failedToDelete = []
        store.pruneAll = false
        store.skipConfirmation = false
        store.dryRun = false
        store.force = false
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('with merged and unmerged branches', () => {
        it('should display grouped checkbox with merged and unmerged branches (e2e)', async () => {
            // Setup: Configure store with mixed branches
            store.staleBranches = ['feature/merged-1', 'feature/merged-2', 'feature/unmerged-1', 'hotfix/unmerged-2']
            store.unmergedBranches = ['feature/unmerged-1', 'hotfix/unmerged-2']

            // Mock user selecting only merged branches
            mockGroupedCheckbox.mockResolvedValueOnce({
                merged: ['feature/merged-1', 'feature/merged-2'],
                unmerged: [],
            })

            // Mock confirmation
            mockConfirm.mockResolvedValueOnce(true)

            // Mock findStaleBranches to return our test data
            vi.spyOn(store, 'findStaleBranches').mockResolvedValueOnce(store.staleBranches)

            // Mock deleteBranches to succeed
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce()

            await firstAttempt()

            // Verify grouped checkbox was called with correct structure
            expect(mockGroupedCheckbox).toHaveBeenCalledWith({
                message: 'Select branches to remove',
                pageSize: 40,
                groups: [
                    {
                        key: 'merged',
                        label: 'Merged Branches',
                        icon: '✅',
                        choices: [
                            { value: 'feature/merged-1', name: 'feature/merged-1' },
                            { value: 'feature/merged-2', name: 'feature/merged-2' },
                        ],
                    },
                    {
                        key: 'unmerged',
                        label: expect.stringContaining('Unmerged Branches'),
                        icon: '⚠️',
                        choices: [
                            { value: 'feature/unmerged-1', name: 'feature/unmerged-1' },
                            { value: 'hotfix/unmerged-2', name: 'hotfix/unmerged-2' },
                        ],
                    },
                ],
                searchable: true,
            })

            // Verify branches were queued for deletion
            expect(store.queuedForDeletion).toEqual(['feature/merged-1', 'feature/merged-2'])
        })

        it('should display warning message for unmerged branches', async () => {
            store.staleBranches = ['feature/merged', 'feature/unmerged']
            store.unmergedBranches = ['feature/unmerged']

            mockGroupedCheckbox.mockResolvedValueOnce({
                merged: ['feature/merged'],
                unmerged: [],
            })
            mockConfirm.mockResolvedValueOnce(true)

            vi.spyOn(store, 'findStaleBranches').mockResolvedValueOnce(store.staleBranches)
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce()

            await firstAttempt()

            // Verify the unmerged group label contains the warning
            const groupedCheckboxCall = mockGroupedCheckbox.mock.calls[0]?.[0]
            const unmergedGroup = groupedCheckboxCall?.groups.find((g: { key: string }) => g.key === 'unmerged')

            expect(unmergedGroup?.label).toContain('will be removed with --force')
            expect(unmergedGroup?.label).toContain('cannot be undone')
        })

        it('should handle user selecting both merged and unmerged branches', async () => {
            store.staleBranches = ['feature/merged', 'feature/unmerged']
            store.unmergedBranches = ['feature/unmerged']

            // User selects both types
            mockGroupedCheckbox.mockResolvedValueOnce({
                merged: ['feature/merged'],
                unmerged: ['feature/unmerged'],
            })

            mockConfirm.mockResolvedValueOnce(true)

            vi.spyOn(store, 'findStaleBranches').mockResolvedValueOnce(store.staleBranches)
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce()

            await firstAttempt()

            expect(store.queuedForDeletion).toEqual(['feature/merged', 'feature/unmerged'])
        })

        it('should show correct confirmation message for multiple branches', async () => {
            store.staleBranches = ['branch1', 'branch2', 'branch3']
            store.unmergedBranches = []

            mockGroupedCheckbox.mockResolvedValueOnce({
                merged: ['branch1', 'branch2', 'branch3'],
                unmerged: [],
            })

            mockConfirm.mockResolvedValueOnce(true)

            vi.spyOn(store, 'findStaleBranches').mockResolvedValueOnce(store.staleBranches)
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce()

            await firstAttempt()

            // Verify confirmation was called with plural message
            expect(mockConfirm).toHaveBeenCalledWith({
                message: 'Are you sure you want to remove these 3 branches?',
                default: false,
            })
        })

        it('should show correct confirmation message for single branch', async () => {
            store.staleBranches = ['single-branch']
            store.unmergedBranches = []

            mockGroupedCheckbox.mockResolvedValueOnce({
                merged: ['single-branch'],
                unmerged: [],
            })

            mockConfirm.mockResolvedValueOnce(true)

            vi.spyOn(store, 'findStaleBranches').mockResolvedValueOnce(store.staleBranches)
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce()

            await firstAttempt()

            // Verify confirmation was called with singular message
            expect(mockConfirm).toHaveBeenCalledWith({
                message: 'Are you sure you want to remove this 1 branch?',
                default: false,
            })
        })
    })

    describe('user cancels selection', () => {
        it('should exit when user cancels confirmation', async () => {
            store.staleBranches = ['feature/test']
            store.unmergedBranches = []

            mockGroupedCheckbox.mockResolvedValueOnce({
                merged: ['feature/test'],
                unmerged: [],
            })

            // User cancels confirmation
            mockConfirm.mockResolvedValueOnce(false)

            vi.spyOn(store, 'findStaleBranches').mockResolvedValueOnce(store.staleBranches)

            // Expect exit to be called, so wrap in try-catch to handle it
            try {
                await firstAttempt()
            } catch (e) {
                // Exit throws in tests, that's ok
            }

            expect(consoleInfoSpy).toHaveBeenCalledWith('👋 No branches were removed.')
            expect(mockExit).toHaveBeenCalledWith(0)
        })

        it('should not call deleteBranches when user cancels', async () => {
            store.staleBranches = ['feature/test']
            store.unmergedBranches = []

            mockGroupedCheckbox.mockResolvedValueOnce({
                merged: ['feature/test'],
                unmerged: [],
            })
            mockConfirm.mockResolvedValueOnce(false)

            vi.spyOn(store, 'findStaleBranches').mockResolvedValueOnce(store.staleBranches)
            const deleteBranchesSpy = vi.spyOn(store, 'deleteBranches')

            // Expect exit to be called, so wrap in try-catch
            try {
                await firstAttempt()
            } catch (e) {
                // Exit throws in tests, that's ok
            }

            expect(deleteBranchesSpy).not.toHaveBeenCalled()
        })
    })

    describe('only merged branches scenario', () => {
        it('should only show merged group when no unmerged branches exist', async () => {
            store.staleBranches = ['feature/merged-1', 'feature/merged-2', 'hotfix/merged']
            store.unmergedBranches = []

            mockGroupedCheckbox.mockResolvedValueOnce({
                merged: ['feature/merged-1'],
                unmerged: [],
            })
            mockConfirm.mockResolvedValueOnce(true)

            vi.spyOn(store, 'findStaleBranches').mockResolvedValueOnce(store.staleBranches)
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce()

            await firstAttempt()

            const groupedCheckboxCall = mockGroupedCheckbox.mock.calls[0]?.[0]

            // Should have merged group with all branches
            const mergedGroup = groupedCheckboxCall?.groups.find((g: { key: string }) => g.key === 'merged')
            expect(mergedGroup?.choices).toHaveLength(3)

            // Unmerged group should have no choices
            const unmergedGroup = groupedCheckboxCall?.groups.find((g: { key: string }) => g.key === 'unmerged')
            expect(unmergedGroup?.choices).toHaveLength(0)
        })
    })

    describe('only unmerged branches scenario', () => {
        it('should only show unmerged group when no merged branches exist', async () => {
            store.staleBranches = ['feature/unmerged-1', 'feature/unmerged-2']
            store.unmergedBranches = ['feature/unmerged-1', 'feature/unmerged-2']

            mockGroupedCheckbox.mockResolvedValueOnce({
                merged: [],
                unmerged: ['feature/unmerged-1'],
            })
            mockConfirm.mockResolvedValueOnce(true)

            vi.spyOn(store, 'findStaleBranches').mockResolvedValueOnce(store.staleBranches)
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce()

            await firstAttempt()

            const groupedCheckboxCall = mockGroupedCheckbox.mock.calls[0]?.[0]

            // Merged group should have no choices
            const mergedGroup = groupedCheckboxCall?.groups.find((g: { key: string }) => g.key === 'merged')
            expect(mergedGroup?.choices).toHaveLength(0)

            // Should have unmerged group with all branches
            const unmergedGroup = groupedCheckboxCall?.groups.find((g: { key: string }) => g.key === 'unmerged')
            expect(unmergedGroup?.choices).toHaveLength(2)
        })
    })

    describe('no stale branches', () => {
        it('should exit early when no stale branches are found', async () => {
            // Explicitly set store staleBranches to empty AND mock findStaleBranches
            store.staleBranches = []
            const findStaleSpy = vi.spyOn(store, 'findStaleBranches').mockImplementation(async () => {
                store.staleBranches = []
                return []
            })

            // Expect exit to be called, so wrap in try-catch
            try {
                await firstAttempt()
            } catch (e) {
                // Exit throws in tests, that's ok
            }

            expect(findStaleSpy).toHaveBeenCalled()
            expect(consoleInfoSpy).toHaveBeenCalledWith('✅ No stale branches were found')
            expect(mockExit).toHaveBeenCalledWith(0)
            expect(mockGroupedCheckbox).not.toHaveBeenCalled()
        })
    })

    describe('skip confirmation mode', () => {
        it('should skip confirmation when skipConfirmation is true', async () => {
            store.staleBranches = ['feature/test']
            store.unmergedBranches = []
            store.skipConfirmation = true

            mockGroupedCheckbox.mockResolvedValueOnce({
                merged: ['feature/test'],
                unmerged: [],
            })

            vi.spyOn(store, 'findStaleBranches').mockResolvedValueOnce(store.staleBranches)
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce()

            await firstAttempt()

            // Confirmation should not have been called
            expect(mockConfirm).not.toHaveBeenCalled()
            expect(store.queuedForDeletion).toEqual(['feature/test'])
        })
    })

    describe('prune-all mode', () => {
        it('should bypass grouped checkbox when pruneAll is true', async () => {
            store.staleBranches = ['feature/merged', 'feature/unmerged']
            store.unmergedBranches = ['feature/unmerged']
            store.pruneAll = true
            store.skipConfirmation = true

            vi.spyOn(store, 'findStaleBranches').mockResolvedValueOnce(store.staleBranches)
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce()

            await firstAttempt()

            // Grouped checkbox should not be called in prune-all mode
            expect(mockGroupedCheckbox).not.toHaveBeenCalled()
            expect(store.queuedForDeletion).toEqual(['feature/merged', 'feature/unmerged'])
        })
    })

    describe('UI snapshots', () => {
        it('should create grouped checkbox with correct structure for mixed branches', async () => {
            store.staleBranches = [
                'feature/authentication',
                'feature/payment',
                'hotfix/security-patch',
                'feature/unmerged-work',
                'develop',
            ]
            store.unmergedBranches = ['feature/unmerged-work', 'develop']

            mockGroupedCheckbox.mockResolvedValueOnce({
                merged: ['feature/authentication', 'feature/payment'],
                unmerged: [],
            })
            mockConfirm.mockResolvedValueOnce(true)

            vi.spyOn(store, 'findStaleBranches').mockResolvedValueOnce(store.staleBranches)
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce()

            await firstAttempt()

            // Snapshot the grouped checkbox call structure
            expect(mockGroupedCheckbox.mock.calls[0]?.[0]).toMatchInlineSnapshot(`
              {
                "groups": [
                  {
                    "choices": [
                      {
                        "name": "feature/authentication",
                        "value": "feature/authentication",
                      },
                      {
                        "name": "feature/payment",
                        "value": "feature/payment",
                      },
                      {
                        "name": "hotfix/security-patch",
                        "value": "hotfix/security-patch",
                      },
                    ],
                    "icon": "✅",
                    "key": "merged",
                    "label": "Merged Branches",
                  },
                  {
                    "choices": [
                      {
                        "name": "feature/unmerged-work",
                        "value": "feature/unmerged-work",
                      },
                      {
                        "name": "develop",
                        "value": "develop",
                      },
                    ],
                    "icon": "⚠️",
                    "key": "unmerged",
                    "label": "Unmerged Branches — will be removed with --force and cannot be undone",
                  },
                ],
                "message": "Select branches to remove",
                "pageSize": 40,
                "searchable": true,
              }
            `)
        })

        it('should create grouped checkbox with searchable option enabled', async () => {
            store.staleBranches = ['feature/test']
            store.unmergedBranches = []

            mockGroupedCheckbox.mockResolvedValueOnce({
                merged: ['feature/test'],
                unmerged: [],
            })
            mockConfirm.mockResolvedValueOnce(true)

            vi.spyOn(store, 'findStaleBranches').mockResolvedValueOnce(store.staleBranches)
            vi.spyOn(store, 'deleteBranches').mockResolvedValueOnce()

            await firstAttempt()

            const groupedCheckboxCall = mockGroupedCheckbox.mock.calls[0]?.[0]
            expect(groupedCheckboxCall?.searchable).toBe(true)
            expect(groupedCheckboxCall?.pageSize).toBe(40)
        })
    })
})
