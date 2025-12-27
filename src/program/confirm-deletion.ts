import * as readline from 'node:readline'
import { dim, gray, green, red } from '../utils/colors.js'

/** Result of the confirmation prompt */
export type ConfirmResult = 'confirm' | 'cancel' | 'back'

/**
 * Ensure that the displayed command is something the user could copy-paste into their terminal.
 * Note that this is not the same algorithm that we use to sanitize branch names for actual execution.
 */
function displayBranchName(branch: string): string {
    // If branch name contains special characters or spaces, wrap it in quotes
    if (/[\s"'`\\]/.test(branch)) {
        return `"${branch.replace(/(["\\$`])/g, '\\$1')}"`
    }

    return branch
}

/**
 * Clear N lines from the terminal by moving cursor up and clearing each line.
 */
function clearLines(count: number): void {
    for (let i = 0; i < count; i++) {
        // Move cursor up one line and clear the entire line
        process.stdout.write('\x1b[1A\x1b[2K')
    }
}

/**
 * Custom confirm prompt that supports Escape key to go back.
 * Uses a low escapeCodeTimeout for responsive Escape key handling.
 * @param message - The confirmation message to display
 * @param linesToClear - Number of lines to clear if user goes back
 */
async function confirmWithEscape(message: string, linesToClear: number): Promise<ConfirmResult> {
    const hint = gray('(y/N, Esc to go back)')
    process.stdout.write(`? ${message} ${hint} `)

    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            escapeCodeTimeout: 50, // Low timeout for fast Escape key response
        })

        // Enable raw mode to get individual keypresses
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true)
        }

        const cleanup = (clearOutput: boolean = false) => {
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(false)
            }
            rl.close()

            if (clearOutput) {
                // Clear the prompt line first, then all the output lines
                process.stdout.write('\x1b[2K\r') // Clear current line
                clearLines(linesToClear)
            } else {
                process.stdout.write('\n')
            }
        }

        const handler = (_str: string | undefined, key: readline.Key | undefined) => {
            if (!key) {
                return
            }

            if (key.name === 'escape') {
                process.stdin.removeListener('keypress', handler)
                cleanup(true) // Clear output when going back
                resolve('back')
            } else if (key.name === 'y') {
                process.stdin.removeListener('keypress', handler)
                cleanup()
                resolve('confirm')
            } else if (key.name === 'n' || key.name === 'return') {
                process.stdin.removeListener('keypress', handler)
                cleanup()
                resolve('cancel')
            } else if (key.name === 'c' && key.ctrl) {
                // Handle Ctrl+C
                process.stdin.removeListener('keypress', handler)
                cleanup()
                process.exit(0)
            }
        }

        // Emit keypress events
        readline.emitKeypressEvents(process.stdin, rl)
        process.stdin.on('keypress', handler)
    })
}

/**
 * Display a confirmation screen showing the commands that will be executed.
 * Returns 'confirm' if user confirms, 'cancel' if they decline, or 'back' if they press Escape.
 */
export async function confirmDeletion(safe: string[], force: string[]): Promise<ConfirmResult> {
    if (safe.length === 0 && force.length === 0) {
        console.info('👋 No branches selected')
        return 'cancel'
    }

    // Count lines as we print them (for clearing on 'back')
    let lineCount = 0

    // Header: "\n" + text + "\n" = 3 lines
    console.log(`\nThe following commands will be executed:\n`)
    lineCount += 3

    if (safe.length > 0) {
        console.log(green(`Safely delete ${safe.length} branch${safe.length === 1 ? '' : 'es'}:`))
        lineCount += 1
        safe.forEach((branch) => {
            console.log(dim(`  git branch -d ${displayBranchName(branch)}`))
            lineCount += 1
        })
        console.log('')
        lineCount += 1
    }

    if (force.length > 0) {
        console.log(red(`Force delete ${force.length} branch${force.length === 1 ? '' : 'es'}:`))
        lineCount += 1
        force.forEach((branch) => {
            console.log(dim(`  git branch -D ${displayBranchName(branch)}`))
            lineCount += 1
        })
        console.log('')
        lineCount += 1
    }

    const total = safe.length + force.length

    return confirmWithEscape(`Delete ${total} branch${total === 1 ? '' : 'es'}?`, lineCount)
}
