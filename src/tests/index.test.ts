import { execFileSync, spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import stripAnsi from 'strip-ansi'
import { beforeAll, describe, expect, it } from 'vitest'
import { testSetup } from './setup.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const bin = path.join(__dirname, '../../dist/index.js')

let workingDir: string

/**
 * Helper to run interactive CLI tests with simulated user input
 */
function runInteractive(
    cwd: string,
    inputs: string[],
    timeout = 3000,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve) => {
        const child = spawn('node', [bin], {
            cwd,
            env: { ...process.env, FORCE_COLOR: '0' }, // Disable colors for easier snapshot testing
        })

        let stdout = ''
        let stderr = ''
        let inputIndex = 0
        let hasStartedSendingInput = false

        child.stdout.on('data', (data) => {
            stdout += data.toString()

            // Start sending inputs once we see the prompt
            if (!hasStartedSendingInput && stdout.includes('Select branches to remove')) {
                hasStartedSendingInput = true
                setTimeout(() => sendNextInput(), 100)
            }
        })

        child.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        const sendNextInput = () => {
            if (inputIndex < inputs.length && child.stdin) {
                child.stdin.write(inputs[inputIndex])
                inputIndex++
                if (inputIndex < inputs.length) {
                    setTimeout(() => sendNextInput(), 100)
                }
            }
        }

        child.on('close', (code) => {
            resolve({ stdout, stderr, exitCode: code })
        })

        // Timeout fallback
        setTimeout(() => {
            child.kill('SIGTERM')
            setTimeout(() => {
                resolve({ stdout, stderr, exitCode: null })
            }, 100)
        }, timeout)
    })
}

describe('git-prune-branches', () => {
    beforeAll(() => {
        workingDir = testSetup()
    })

    describe('dry run mode', () => {
        it('should show branches that would be deleted without actually deleting them', () => {
            const output = execFileSync('node', [bin, '--prune-all', '--dry-run'], {
                cwd: workingDir,
                encoding: 'utf8',
            })

            // Should not include the persistent branch
            expect(output).not.toContain('golf/renamed-locally--not-deleted-on-remote--not-offered-for-deletion')

            // Should include branches that would be deleted
            expect(output).toContain(' foxtrot/local-name-different--removed--can-be-soft-removed')
            expect(output).toContain(' #567--echo--special-chars--pushed-then-deleted-from-remote--no-commits')
            expect(output).toContain(' alpha/pushed-then-deleted-from-remote--no-commits')
            expect(output).toContain(' delta/with-commits--remote-deleted--needs-force')
            expect(output).toMatchInlineSnapshot(`
              "Found remotely removed branches:
                - #567--echo--special-chars--pushed-then-deleted-from-remote--no-commits
                - alpha/pushed-then-deleted-from-remote--no-commits
                - delta/with-commits--remote-deleted--needs-force
                - foxtrot/local-name-different--removed--can-be-soft-removed

              ℹ️ To remove branches, don’t include the --dry-run flag
              ✅ Deleted all 4 branches
              "
            `)
        })
    })

    describe('prune mode', () => {
        it('should delete merged branches but report failures for unmerged ones', () => {
            const output = execFileSync('node', [bin, '--prune-all'], {
                cwd: workingDir,
                encoding: 'utf8',
            })

            // Should report that some branches couldn't be removed
            expect(output).toContain('Could not remove 1 of those 4 branches')

            // The interactive prompt should appear
            expect(output).toContain('until next time!')
            expect(output).toMatchInlineSnapshot(`
              "
              ⚠️ Could not remove 1 of those 4 branches.
              You may try again using --force, or cancel by pressing Ctrl+C

              [34m?[39m [1mSelect branches to forcefully remove[22m (Press [36m[1m<space>[22m[39m to select, [36m[1m<a>[22m[39m to toggle
              all, [36m[1m<i>[22m[39m to invert selection, and [36m[1m<enter>[22m[39m to proceed)
              [36m❯◯ delta/with-commits--remote-deleted--needs-force[39m[?25l[51G
              [?25h
              👋 until next time!
              "
            `)
        })
    })

    describe('force mode', () => {
        it('should force delete remaining branches', () => {
            const output = execFileSync('node', [bin, '--prune-all', '--force'], {
                cwd: workingDir,
                encoding: 'utf8',
            })

            // Should report successful deletion
            expect(output).toContain('Deleted 1 branch')
            expect(output).toMatchInlineSnapshot(`
              "
              ✅ Deleted 1 branch
              "
            `)
        })
    })

    describe('interactive grouped checkbox mode (end-to-end)', () => {
        let interactiveWorkingDir: string

        beforeAll(() => {
            // Create a fresh test repo for interactive tests
            interactiveWorkingDir = testSetup()
        })

        it('should display grouped checkbox with merged and unmerged branches', async () => {
            const result = await runInteractive(
                interactiveWorkingDir,
                [
                    '\x03', // Ctrl+C to exit and capture the UI
                ],
                2000,
            )

            const output = result.stdout + result.stderr

            // Should show the grouped checkbox prompt
            expect(output).toContain('Select branches to remove')

            // Should show merged branches group
            expect(output).toContain('Merged Branches')

            // Should show unmerged branches group with warning
            expect(output).toContain('Unmerged Branches')
            expect(output).toContain('will be removed with --force')

            // Should list the actual branches
            expect(output).toContain('foxtrot/local-name-different--removed--can-be-soft-removed')
            expect(output).toContain('alpha/pushed-then-deleted-from-remote--no-commits')
            expect(output).toContain('#567--echo--special-chars--pushed-then-deleted-from-remote--no-commits')
            expect(output).toContain('delta/with-commits--remote-deleted--needs-force')

            // Snapshot the UI structure (with ANSI codes stripped for readability)
            const cleaned = stripAnsi(output)
            const uiSection = cleaned.substring(cleaned.indexOf('Select branches to remove'))

            expect(uiSection).toMatchInlineSnapshot(`
              "Select branches to remove

              ✅ Merged Branches (0/3)
              ❯ ◯ #567--echo--special-chars--pushed-then-deleted-from-remote--no-commits
                ◯ alpha/pushed-then-deleted-from-remote--no-commits
                ◯ foxtrot/local-name-different--removed--can-be-soft-removed

              ⚠️ Unmerged Branches — will be removed with --force and cannot be undone (0/1)
                ◯ delta/with-commits--remote-deleted--needs-force
              (space: select, ctrl+a: toggle all, ctrl+i: invert, type to search)

              👋 until next time!
              "
            `)
        })

        it('should allow selecting merged branches and deleting them', async () => {
            const result = await runInteractive(
                interactiveWorkingDir,
                [
                    ' ', // Space to select first item (foxtrot/local-name-different--removed--can-be-soft-removed)
                    '\r', // Enter to confirm selection
                    'y', // Confirm deletion
                    '\r', // Enter to confirm
                ],
                3000,
            )

            const output = result.stdout + result.stderr

            // Should show confirmation prompt
            expect(output).toContain('Are you sure you want to remove')

            // Should show success message
            expect(output).toContain('Deleted')
        })

        it('should handle selecting both merged and unmerged branches', async () => {
            // Create another fresh repo since previous test deleted branches
            const mixedWorkingDir = testSetup()

            const result = await runInteractive(
                mixedWorkingDir,
                [
                    ' ', // Select first merged branch
                    '\x1B[B', // Down arrow
                    '\x1B[B', // Down arrow
                    '\x1B[B', // Down arrow
                    '\x1B[B', // Down arrow (move to unmerged section)
                    '\x1B[B', // Down arrow
                    ' ', // Select unmerged branch
                    '\r', // Enter to confirm
                    'y', // Confirm deletion
                    '\r', // Enter
                ],
                4000,
            )

            const output = result.stdout + result.stderr

            // Should show both groups
            expect(output).toContain('Merged Branches')
            expect(output).toContain('Unmerged Branches')

            // Should warn about unmerged branches
            expect(output).toContain('will be removed with --force')
        })

        it('should show searchable UI with proper formatting', async () => {
            const searchWorkingDir = testSetup()

            const result = await runInteractive(
                searchWorkingDir,
                [
                    '/', // Activate search (if supported)
                    '\x03', // Ctrl+C to exit
                ],
                2000,
            )

            const output = result.stdout + result.stderr

            // Verify the UI has proper structure
            const cleaned = stripAnsi(output)

            // Should have grouped structure
            expect(cleaned).toContain('✅ Merged Branches')
            expect(cleaned).toContain('⚠️ Unmerged Branches')

            // Should show help text
            expect(cleaned).toContain('space: select')
            expect(cleaned).toContain('type to search')
        })

        it('should handle user canceling the selection', async () => {
            const cancelWorkingDir = testSetup()

            const result = await runInteractive(
                cancelWorkingDir,
                [
                    ' ', // Select a branch
                    '\r', // Enter to confirm
                    'n', // Decline confirmation
                    '\r', // Enter
                ],
                3000,
            )

            const output = result.stdout + result.stderr

            // Should show cancellation message
            expect(output).toContain('No branches were removed')
        })

        it('should display complete UI snapshot with all elements', async () => {
            const snapshotWorkingDir = testSetup()

            const result = await runInteractive(
                snapshotWorkingDir,
                [
                    '\x03', // Exit immediately to capture initial state
                ],
                2000,
            )

            // Keep ANSI codes for full terminal output snapshot
            const output = result.stdout + result.stderr

            // Snapshot with ANSI codes to show actual terminal output
            expect(output).toMatchSnapshot('grouped-checkbox-full-terminal-output')

            // Also snapshot without ANSI for readable structure
            const cleaned = stripAnsi(output)
            expect(cleaned).toMatchSnapshot('grouped-checkbox-clean-output')
        })
    })
})
