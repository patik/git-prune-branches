# Version 2 Implementation Plan

## Overview

This document provides a complete implementation plan for Version 2 of `git-prune-branches`. The goal is to create a more streamlined, user-friendly interactive CLI tool with modern UX while keeping long-term maintenance low.

## Key Changes from V1

### User Experience Improvements

- **Simplified flow**: 2 screens instead of multi-step process
- **Clearer branch categorization**: 3 groups instead of unclear stale/unmerged distinction
- **Better visibility**: Show actual git commands before execution
- **Smarter defaults**: Auto-prune and pre-select safe branches

### Technical Simplifications

- **Remove CLI flags**: No more `--force`, `--dry-run`, `--prune-all`, `--yes` flags
- **Auto-prune by default**: Always run `git fetch --prune` at startup
- **Single pass deletion**: Handle both safe and force deletions in one flow

## New User Flow

### Screen 1: Branch Selection (Interactive Checkbox)

Display branches in 3 groups:

1. **"Safe to delete"** (✅ icon, green)
    - Pre-selected by default
    - Merged branches deleted from remote, no force needed
    - Local merged branches never pushed to remote
    - Renamed branches that were deleted from remote

2. **"Requires force delete"** (⚠️ icon, red/orange)
    - NOT selected by default
    - Unmerged branches with commits
    - Never-pushed branches with commits
    - Visual warning: "⚠️ Cannot be undone"

3. **"Info only - not available for deletion"** (ℹ️ icon, gray)
    - Disabled checkboxes (or plain text list)
    - Renamed branches still active on remote
    - Only shown for completeness/transparency

**Features:**

- Searchable list
- "Select all" only selects group 1 (safe branches)
- Separate "Select all dangerous" action for group 2
- Show branch name and brief context (e.g., "deleted from origin", "never pushed", "3 commits")

### Screen 2: Confirmation with Command Preview

Show grouped list of commands that will be executed:

```
Are you sure you want to delete these branches?

Safe deletes (6 branches):
  git branch -d alpha/pushed-then-deleted-from-remote
  git branch -d bravo/local-merged--never-on-remote
  git branch -d foxtrot/local-name-different
  git branch -d golf/renamed-locally
  git branch -d #567--echo--special-chars
  git branch -d other-branch

Force deletes (2 branches):
  git branch -D charlie/local-never-pushed
  git branch -D delta/with-commits--remote-deleted

[Yes] [No]
```

### Screen 3: Execution Report (Auto-exit)

After execution, show results and exit automatically:

```
✅ Successfully deleted 8 branches
   • 6 safe deletions
   • 2 force deletions

👋 Done!
```

If any failures occur:

```
⚠️ Deleted 7 of 8 branches
   • 6 safe deletions
   • 1 force deletion

❌ Failed to delete:
   • some-branch (error: <git error message>)

Tip: Check if you're currently on this branch or if it has uncommitted changes
```

## Branch Classification Logic

### Data Collection (BranchStore.preprocess)

The following data is already collected:

- `liveBranches`: Branches that exist on remote (via `git ls-remote`)
- `localOrphanedBranches`: Local branches tracking remotes that no longer exist
- `unmergedBranches`: Branches not merged into current branch (via `git branch --no-merged`)
- `remoteBranches`: Cached remote branches (via `git branch -r`)

### Additional Data Needed

Add these new properties to BranchStore:

1. **`currentBranch: string`**
    - Get via: `git branch --show-current`
    - Used to filter out current branch from all groups

2. **`protectedBranches: string[]`**
    - Default list: `['main', 'master', 'develop', 'development']`
    - Used to filter out protected branches from all groups

3. **`neverPushedBranches: Array<string>`**
    - Branches that have no upstream tracking
    - Get via: Parse `git branch --format="%(refname:short)@{%(upstream)}"` for branches with empty upstream

4. **`mergedBranches: Array<string>`**
    - Branches that ARE merged (opposite of unmergedBranches)
    - Get via: `git branch --format="%(refname:short)" --merged`

### Group Assignment Logic

After collecting data, assign branches to groups:

#### Group 1: Safe to Delete (pre-selected)

```typescript
safeToDelete = [
    // Stale branches that are merged (deleted from remote, no force needed)
    ...staleBranches.filter((b) => !unmergedBranches.includes(b)),

    // Local merged branches never pushed to remote
    ...mergedBranches.filter((b) => neverPushedBranches.includes(b) && !unmergedBranches.includes(b)),
]
    // Remove duplicates, current branch, and protected branches
    .filter((b, i, arr) => arr.indexOf(b) === i && b !== currentBranch && !protectedBranches.includes(b))
```

#### Group 2: Requires Force (NOT pre-selected)

```typescript
requiresForce = [
    // Stale branches that are unmerged
    ...staleBranches.filter((b) => unmergedBranches.includes(b)),

    // Never pushed branches that are unmerged
    ...neverPushedBranches.filter((b) => unmergedBranches.includes(b)),
]
    // Remove duplicates, current branch, and protected branches
    .filter((b, i, arr) => arr.indexOf(b) === i && b !== currentBranch && !protectedBranches.includes(b))
```

#### Group 3: Info Only (disabled)

```typescript
infoOnly = [
    // Local branches with different names tracking active remote branches
    // (renamed locally, original still exists on remote)
    ...localOrphanedBranches
        .filter(({ remoteBranch, localBranch }) => remoteBranch !== localBranch && liveBranches.includes(remoteBranch))
        .map(({ localBranch }) => localBranch),
]
    // Remove duplicates, current branch, and protected branches
    .filter((b, i, arr) => arr.indexOf(b) === i && b !== currentBranch && !protectedBranches.includes(b))
```

## Implementation Steps

### Phase 1: BranchStore Refactoring

**Files to modify:**

- `src/utils/BranchStore.ts`

**Changes:**

1. **Remove CLI flag properties** (lines 7-10)
    - Remove: `force`, `dryRun`, `pruneAll`, `skipConfirmation`
    - Keep only: `remote`

2. **Add new properties**

    ```typescript
    currentBranch: string
    protectedBranches: string[]
    neverPushedBranches: Array<string>
    mergedBranches: Array<string>
    safeToDelete: Array<string>
    requiresForce: Array<string>
    infoOnly: Array<string>
    ```

3. **Add new data collection methods**
    - `async findCurrentBranch()`: Get current branch
    - `async findNeverPushedBranches()`: Find branches with no upstream
    - `async findMergedBranches()`: Find merged branches
    - `classifyBranches()`: Assign branches to the 3 groups using logic above

4. **Update `preprocess()` method**
    - Add `git fetch --prune` at the start (always run this)
    - Call new data collection methods
    - Call `classifyBranches()` at the end
    - Remove the "outdated repository" warning (no longer needed with auto-prune)

5. **Update `deleteBranches()` method**
    - Remove `dryRun` logic
    - Handle both `-d` and `-D` in single pass based on which group the branch came from
    - Return detailed results: `{ success: string[], failed: Array<{ branch: string, error: string }> }`

6. **Remove `setForce()` and update `setQueuedForDeletion()`**
    - New signature: `setQueuedForDeletion(safe: string[], force: string[])`

**Testing:**

- Update `src/tests/BranchStore.test.ts`
- Verify all test branches are classified correctly:
    - `alpha` → safe
    - `bravo` → safe
    - `charlie` → requiresForce
    - `delta` → requiresForce
    - `foxtrot` → safe
    - `golf` → safe
    - `india` → infoOnly
    - `#567--echo--special-chars` → safe

### Phase 2: Remove CLI Flags

**Files to modify:**

- `src/utils/establish-args.ts`
- `src/program/store.ts`

**Changes:**

1. **Update `establish-args.ts`**
    - Remove flags: `dry-run`, `d`, `prune-all`, `p`, `force`, `f`, `yes`, `y`
    - Keep only: `remote`, `r`, `version`
    - Update usage message to: `Usage: git prune-branches [-r|--remote <remote>] [--version]`

2. **Update `src/program/store.ts`**
    - Remove flag properties from BranchStore instantiation
    - Only pass `remote` option

**Testing:**

- Verify `--version` still works
- Verify `--remote` still works
- Verify unknown flags show error
- Verify removed flags show error with helpful message

### Phase 3: New Interactive Flow

**Files to modify:**

- `src/program/first-attempt.ts` (rename to `src/program/select-branches.ts`)
- `src/program/index.ts`

**Files to delete:**

- `src/program/retry-failed-dletions.ts` (no longer needed)

**Changes:**

1. **Create `src/program/select-branches.ts`** (refactored from first-attempt.ts)

    ```typescript
    import groupedCheckbox from 'inquirer-grouped-checkbox'
    import { red, yellow, gray } from '../utils/colors.js'
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
                    name: branch,
                    checked: true, // Pre-selected
                })),
            })
        }

        // Group 2: Requires force
        if (store.requiresForce.length > 0) {
            groups.push({
                key: 'force',
                label: yellow('⚠️ Requires force delete — cannot be undone'),
                icon: '⚠️',
                choices: store.requiresForce.map((branch) => ({
                    value: branch,
                    name: branch,
                    checked: false, // NOT pre-selected
                })),
            })
        }

        // Group 3: Info only
        if (store.infoOnly.length > 0) {
            groups.push({
                key: 'info',
                label: gray('ℹ️ Info only - renamed branches still on remote'),
                icon: 'ℹ️',
                choices: store.infoOnly.map((branch) => ({
                    value: branch,
                    name: branch,
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
    ```

2. **Create `src/program/confirm-deletion.ts`**

    ```typescript
    import { confirm } from '@inquirer/prompts'
    import { green, red, bold } from '../utils/colors.js'

    export async function confirmDeletion(safe: string[], force: string[]): Promise<boolean> {
        if (safe.length === 0 && force.length === 0) {
            console.info('👋 No branches selected')
            return false
        }

        console.log('\n' + bold('The following commands will be executed:') + '\n')

        if (safe.length > 0) {
            console.log(green(`Safe deletes (${safe.length} branch${safe.length === 1 ? '' : 'es'}):`))
            safe.forEach((branch) => console.log(`  git branch -d ${branch}`))
            console.log('')
        }

        if (force.length > 0) {
            console.log(red(`Force deletes (${force.length} branch${force.length === 1 ? '' : 'es'}):`))
            force.forEach((branch) => console.log(`  git branch -D ${branch}`))
            console.log('')
        }

        const total = safe.length + force.length
        const answer = await confirm({
            message: `Delete ${total} branch${total === 1 ? '' : 'es'}?`,
            default: false,
        })

        return answer
    }
    ```

3. **Create `src/program/execute-deletions.ts`**

    ```typescript
    import { green, red, yellow } from '../utils/colors.js'
    import store from './store.js'

    export async function executeDeletions(safe: string[], force: string[]) {
        store.setQueuedForDeletion(safe, force)
        const results = await store.deleteBranches()

        // Show results
        const totalSuccess = results.success.length
        const totalFailed = results.failed.length
        const totalAttempted = totalSuccess + totalFailed

        console.log('') // Empty line

        if (totalFailed === 0) {
            // All succeeded
            console.info(green(`✅ Successfully deleted ${totalSuccess} branch${totalSuccess === 1 ? '' : 'es'}`))

            const numSafe = safe.filter((b) => results.success.includes(b)).length
            const numForce = force.filter((b) => results.success.includes(b)).length

            if (numSafe > 0 && numForce > 0) {
                console.info(`   • ${numSafe} safe deletion${numSafe === 1 ? '' : 's'}`)
                console.info(`   • ${numForce} force deletion${numForce === 1 ? '' : 's'}`)
            }
        } else if (totalSuccess > 0) {
            // Some succeeded, some failed
            console.info(yellow(`⚠️ Deleted ${totalSuccess} of ${totalAttempted} branches`))

            const numSafe = safe.filter((b) => results.success.includes(b)).length
            const numForce = force.filter((b) => results.success.includes(b)).length

            if (numSafe > 0) console.info(`   • ${numSafe} safe deletion${numSafe === 1 ? '' : 's'}`)
            if (numForce > 0) console.info(`   • ${numForce} force deletion${numForce === 1 ? '' : 's'}`)

            console.log('')
            console.info(red(`❌ Failed to delete:`))
            results.failed.forEach(({ branch, error }) => {
                console.info(`   • ${branch}`)
                console.info(`     ${error}`)
            })

            console.log('')
            console.info("💡 Tip: Check if you're currently on this branch or if it has uncommitted changes")
        } else {
            // All failed
            console.info(red(`❌ Failed to delete all ${totalFailed} branch${totalFailed === 1 ? '' : 'es'}`))

            results.failed.forEach(({ branch, error }) => {
                console.info(`   • ${branch}`)
                console.info(`     ${error}`)
            })

            console.log('')
            console.info("💡 Tip: Check if you're currently on a branch you tried to delete")
        }

        console.log('\n👋 Done!\n')

        return totalFailed === 0 ? 0 : 1
    }
    ```

4. **Update `src/program/index.ts`**

    ```typescript
    // Side effects
    import './side-effects/check-for-git-repo.js'
    import './side-effects/handle-control-c.js'

    // Program imports
    import { exit } from 'node:process'
    import { selectBranches } from './select-branches.js'
    import { confirmDeletion } from './confirm-deletion.js'
    import { executeDeletions } from './execute-deletions.js'

    export default async function program() {
        try {
            // Screen 1: Select branches
            const { safe, force } = await selectBranches()

            // Screen 2: Confirm with command preview
            const confirmed = await confirmDeletion(safe, force)

            if (!confirmed) {
                console.info('👋 No branches were removed.')
                exit(0)
            }

            // Screen 3: Execute and show results (auto-exit)
            const exitCode = await executeDeletions(safe, force)
            exit(exitCode)
        } catch (err: unknown) {
            if (typeof err === 'object' && err) {
                if ('code' in err && typeof err.code === 'number' && err.code === 128) {
                    process.stderr.write('ERROR: Not a git repository\r\n')
                } else if ('code' in err && typeof err.code === 'number' && 'message' in err && err.code === 1984) {
                    process.stderr.write(`ERROR: ${err.message} \r\n`)
                } else if ('stack' in err) {
                    if (err instanceof Error && err.name === 'ExitPromptError') {
                        console.log('\r\n👋 until next time!')
                        exit(0)
                    }

                    process.stderr.write((err.stack || err) + '\r\n')
                }
            }

            exit(1)
        }
    }
    ```

**Testing:**

- Test full flow with test branches
- Verify pre-selection works
- Verify confirmation shows correct commands
- Verify results display correctly
- Test cancellation at each step

### Phase 4: Update Tests

**Files to modify:**

- `src/tests/BranchStore.test.ts`
- `src/tests/index.test.ts`

**Changes:**

1. **Update `BranchStore.test.ts`**
    - Update tests for removed flags
    - Add tests for new methods:
        - `findCurrentBranch()`
        - `findNeverPushedBranches()`
        - `findMergedBranches()`
        - `classifyBranches()`
    - Verify group assignments match expected behavior per test branches
    - Test that current branch is filtered out
    - Test that protected branches are filtered out

2. **Update `index.test.ts`**
    - Remove tests for deleted flags
    - Update integration tests for new flow
    - Test auto-prune behavior
    - Test that the 3-screen flow works end-to-end

**Test coverage goals:**

- All branch classification logic
- Protected branch filtering
- Current branch filtering
- Group assignment edge cases (empty groups, all in one group, etc.)

### Phase 5: Documentation

**Files to modify:**

- `README.md`
- `Version 2 plan.md` (update with actual implementation)

**Changes:**

1. **Update README.md**
    - Remove documentation for deleted flags (`--dry-run`, `--prune-all`, `--force`, `--yes`)
    - Update screenshots (if possible) to show new UI
    - Update "What does it do?" section to mention auto-prune
    - Simplify usage examples
    - Add section explaining the 3 groups
    - Update "Forcing removal" section to explain it's built into the UI now

2. **Update Version 2 plan.md**
    - Add "✅ Implemented" status
    - Document any deviations from original plan
    - Add lessons learned / notes for future versions

### Phase 6: Final Testing & Polish

**Tasks:**

1. **Manual testing with real repositories**
    - Test on repo with many stale branches
    - Test on repo with no stale branches
    - Test on repo with protected branches
    - Test on repo with renamed branches
    - Test on repo while on a branch that should be deleted
    - Test with `--remote` flag pointing to different remote

2. **Error handling**
    - Test with no network connection
    - Test with invalid remote name
    - Test with repo that has no remotes
    - Test when git commands fail unexpectedly

3. **UX polish**
    - Verify all messages are clear and helpful
    - Verify colors are used consistently
    - Verify spacing and formatting looks good
    - Consider adding emoji consistently (or removing them all)

4. **Performance**
    - Ensure `git fetch --prune` doesn't slow down startup too much
    - Consider adding a spinner: "Fetching from remote... ✓"

## Migration Notes for Users

### Breaking Changes

1. **Removed flags:**
    - `--dry-run` / `-d`: The command preview screen replaces this
    - `--prune-all` / `-p`: Auto-prune is now default, branches are pre-selected
    - `--force` / `-f`: Force deletions are handled interactively
    - `--yes` / `-y`: Removed to prevent accidental deletions

2. **Behavioral changes:**
    - `git fetch --prune` now runs automatically at startup
    - Safe branches are pre-selected by default
    - Single pass deletion (no retry screen)

### Non-breaking Changes

- `--remote` / `-r`: Still works the same
- `--version`: Still works the same

### What Users Gain

- Faster workflow (2 screens vs multiple)
- Better visibility (see exact commands before running)
- Less cognitive load (3 clear groups vs confusing stale/unmerged)
- Safer defaults (pre-select safe branches only)

## Code Maintenance Improvements

1. **Simpler BranchStore**: No flag management, clearer purpose
2. **Fewer edge cases**: No retry logic, no dry-run mode
3. **Better separation of concerns**:
    - `select-branches.ts`: UI for selection
    - `confirm-deletion.ts`: UI for confirmation
    - `execute-deletions.ts`: Execution and results
4. **More testable**: Each screen is a separate function
5. **Type safety**: Better TypeScript types for results

## Future Enhancements (Out of Scope for V2)

These could be considered for V3:

- Configuration file support (`.git-prune-branches.json`) for custom protected branches
- `--no-prune` flag for rare cases where auto-prune isn't wanted
- Interactive tutorial on first run
- Branch age/last commit date in the display
- Author name in the display
- Sort options (by name, date, author)
- Filter by pattern (e.g., only show branches matching `feature/*`)

## Success Criteria

Version 2 is ready to ship when:

- ✅ All tests pass
- ✅ All test branches are classified correctly
- ✅ Manual testing shows smooth UX
- ✅ No regressions in core functionality
- ✅ README is updated
- ✅ Breaking changes are documented
- ✅ Code is cleaner and more maintainable than V1

## Implementation Timeline Estimate

**Note:** This is for planning purposes only, actual time may vary.

- Phase 1 (BranchStore): Core logic changes
- Phase 2 (Remove flags): Simple removals
- Phase 3 (New flow): Most complex, requires careful UX work
- Phase 4 (Tests): Ensure quality
- Phase 5 (Docs): User communication
- Phase 6 (Polish): Final touches

## Questions / Decisions Made

1. **Q: Should we keep `--remote` flag?**
    - A: Yes, useful for monorepos with multiple remotes

2. **Q: Should auto-prune be optional?**
    - A: No, always prune. It's safe and necessary for accuracy. Could add `--no-prune` in future if needed.

3. **Q: What to do with `--version` flag?**
    - A: Keep it, it's a standard CLI convention

4. **Q: Should we show commit count for branches?**
    - A: Out of scope for V2. Could add to V3 if needed.

5. **Q: How to handle "Select all dangerous" feature?**
    - A: Check if `inquirer-grouped-checkbox` supports this. If not, document as future enhancement.

6. **Q: Should protected branches be configurable?**
    - A: Start with hardcoded list. Add config file support in V3 if users request it.

## File Checklist

**Modified:**

- [ ] `src/utils/BranchStore.ts`
- [ ] `src/utils/establish-args.ts`
- [ ] `src/program/store.ts`
- [ ] `src/program/index.ts`
- [ ] `src/tests/BranchStore.test.ts`
- [ ] `src/tests/index.test.ts`
- [ ] `README.md`
- [ ] `Version 2 plan.md`

**Created:**

- [ ] `src/program/select-branches.ts` (refactored from first-attempt.ts)
- [ ] `src/program/confirm-deletion.ts`
- [ ] `src/program/execute-deletions.ts`

**Deleted:**

- [ ] `src/program/first-attempt.ts` (refactored into select-branches.ts)
- [ ] `src/program/retry-failed-dletions.ts` (no longer needed)

**Not modified:**

- `src/index.ts` (entry point, no changes needed)
- `src/program/side-effects/*` (no changes needed)
- `src/utils/colors.ts` (no changes needed)
- `src/utils/split.ts` (no changes needed)
- `package.json` (no dependency changes needed)

---

## Ready to Implement!

This plan is comprehensive and ready to hand off to Sonnet 4.5 for implementation. Each phase has clear steps, file references with line numbers where relevant, and expected outcomes.

The implementation should be done in phase order to minimize conflicts and ensure each piece builds on the previous one correctly.
