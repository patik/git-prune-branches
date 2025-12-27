import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import stripAnsi from 'strip-ansi'
import { beforeAll, describe, expect, it } from 'vitest'
import { testSetup } from './tests/manual/setup.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const bin = path.join(__dirname, '../dist/index.js')

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
            expect(output).toContain('Safe to delete')

            // Should show unmerged branches group with warning
            expect(output).toContain('Requires force delete')
            expect(output).toContain('cannot be undone')

            // Should list the actual branches - Safe to delete group
            expect(output).toContain('feature/dark-mode')
            expect(output).toContain('feature/user-avatars')
            expect(output).toContain('fix/#432-modal-close')
            expect(output).toContain('feature/payments/stripe/webhooks') // deep nested path
            expect(output).toContain('release/v2.1.0') // version-like with dots
            expect(output).toContain('feature/search-filters') // PR merge workflow
            expect(output).toContain('chore/update-deps') // local only, merged

            // Should list branches in Requires force delete group
            expect(output).toContain('experiment/graphql-api')
            expect(output).toContain('wip/settings-redesign')

            // Should list branches in Info only group
            expect(output).toContain('bugfix/cache-invalidation')

            // Protected branch should NOT be shown (develop is in protected list)
            expect(output).not.toContain('develop')

            // Snapshot the UI structure (with ANSI codes stripped for readability)
            const cleaned = stripAnsi(output)
            const uiSection = cleaned.substring(cleaned.indexOf('Select branches to remove'))

            // Snapshot will be updated by vitest when tests run
            expect(uiSection).toContain('Select branches to remove')
            expect(uiSection).toContain('Safe to delete')
            expect(uiSection).toContain('Requires force delete')
            expect(uiSection).toContain('Info only')
        })

        it('should allow selecting merged branches and deleting them', async () => {
            const result = await runInteractive(
                interactiveWorkingDir,
                [
                    // Safe branches are pre-selected (7/7), just confirm
                    '\r', // Enter to confirm selection
                    'y', // Confirm deletion
                    '\r', // Enter to confirm
                ],
                3000,
            )

            const output = result.stdout + result.stderr

            // Should show confirmation prompt
            expect(output).toContain('Delete')

            // Should show success message
            expect(output).toContain('Successfully deleted')
        })

        it('should handle selecting both merged and unmerged branches', async () => {
            // Create another fresh repo since previous test deleted branches
            const mixedWorkingDir = testSetup()

            const result = await runInteractive(
                mixedWorkingDir,
                [
                    // Cursor starts on "Safe to delete" group header
                    // Safe branches are already pre-selected (7/7)
                    // Navigate to first force branch and select it
                    '\x1B[B', // Down to first safe item (chore/update-deps)
                    '\x1B[B', // Down to second safe item (feature/dark-mode)
                    '\x1B[B', // Down to third safe item (feature/payments/...)
                    '\x1B[B', // Down to fourth safe item (feature/search-filters)
                    '\x1B[B', // Down to fifth safe item (feature/user-avatars)
                    '\x1B[B', // Down to sixth safe item (fix/#432...)
                    '\x1B[B', // Down to seventh safe item (release/v2.1.0)
                    '\x1B[B', // Down to "Requires force delete" group header
                    '\x1B[B', // Down to first force branch (experiment/graphql-api)
                    ' ', // Select unmerged branch
                    '\r', // Enter to confirm
                    'y', // Confirm deletion
                    '\r', // Enter
                ],
                5000,
            )

            const output = result.stdout + result.stderr

            // Should show both groups
            expect(output).toContain('Safe to delete')
            expect(output).toContain('Requires force delete')

            // Should warn about unmerged branches
            expect(output).toContain('cannot be undone')
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
            expect(cleaned).toContain('✅ Safe to delete')
            expect(cleaned).toContain('⚠️ Requires force delete')

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

            // Snapshot terminal output without ANSI codes for stable testing
            const output = result.stdout + result.stderr
            const cleaned = stripAnsi(output)
            expect(cleaned).toMatchSnapshot('grouped-checkbox-clean-output')
        })
    })
})
