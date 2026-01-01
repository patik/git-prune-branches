import { execFileSync } from 'node:child_process'
import ora from 'ora'
import stdout, { stdoutFile } from 'simple-stdout'
import { formatTimeAgo } from '../../utils/formatTimeAgo.js'
import split from '../../utils/split.js'
import { defaultProtectedBranches, defaultRemote } from '../constants.js'

class RemoteError extends Error {
    code = 1984
}

export default class BranchStore {
    remote: string
    hasRunPreprocess: boolean = false
    remoteBranches: Array<string>

    /**
     * Local branches which track remote branches that no longer exist
     */
    localOrphanedBranches: Array<{ localBranch: string; remoteBranch: string }>

    /**
     * Branches that are still in use; will never be deleted
     */
    liveBranches: Set<string>

    /**
     * Should be offered for deletion, will need force
     */
    unmergedBranches: Set<string>

    /**
     * Current branch (cannot be deleted)
     */
    currentBranch: string = ''

    /**
     * Protected branches that should never be deleted
     */
    protectedBranches: Set<string>

    /**
     * Branches that have never been pushed to remote
     */
    neverPushedBranches: Set<string>

    /**
     * Branches that are merged into current branch
     */
    mergedBranches: Array<string>

    /**
     * Safe to delete (pre-selected in UI)
     */
    safeToDelete: Array<string>

    /**
     * Requires force to delete (NOT pre-selected in UI)
     */
    requiresForce: Array<string>

    /**
     * Will not be deleted: local branches still tracking remote branches with different names (disabled in UI)
     */
    infoOnly: Array<string>

    /**
     * Map of branch name to last commit timestamp (seconds since epoch)
     */
    lastCommitTimes: Map<string, number>

    /**
     * These are the branches that the app will offer to delete
     */
    staleBranches: Array<string>

    queuedForDeletion: Array<string>
    queuedForForceDeletion: Array<string>
    failedToDelete: Array<{ branch: string; error: string }>

    /**
     * All branches, including their upstream info
     */
    allBranches: Array<string>

    noConnection: boolean

    constructor(ops: { remote?: string; protected?: string } = {}) {
        this.remote = ops.remote ?? defaultRemote
        this.remoteBranches = []
        this.localOrphanedBranches = []
        this.staleBranches = []
        this.queuedForDeletion = []
        this.queuedForForceDeletion = []
        this.failedToDelete = []
        this.liveBranches = new Set()
        this.unmergedBranches = new Set()
        this.protectedBranches = new Set((ops.protected ?? defaultProtectedBranches).split(',').map((b) => b.trim()))
        this.neverPushedBranches = new Set()
        this.mergedBranches = []
        this.safeToDelete = []
        this.requiresForce = []
        this.infoOnly = []
        this.lastCommitTimes = new Map()
        this.noConnection = false
        this.allBranches = []
    }

    setQueuedForDeletion(safe: Array<string>, force: Array<string>): void {
        this.queuedForDeletion = safe
        this.queuedForForceDeletion = force
    }

    async preprocess(): Promise<void> {
        // Reset all lists at the start
        this.remoteBranches = []
        this.localOrphanedBranches = []
        this.staleBranches = []
        this.liveBranches = new Set()
        this.unmergedBranches = new Set()
        this.neverPushedBranches = new Set()
        this.mergedBranches = []
        this.safeToDelete = []
        this.requiresForce = []
        this.infoOnly = []
        this.noConnection = false

        // Gather all the information

        // Run potentially conflicting git operations in a controlled fashion to avoid lock contention
        // The order isn't too important, but they shouldn't run simultaneously
        await this.fetchRemote()
        await this.getCurrentBranch()
        await this.findAllBranches()

        // Sift through the branches in parallel and categorize them
        await Promise.all([
            this.lookupLiveBranches(),
            this.lookupUnmergedBranches(),
            this.lookupRemoteBranches(),
            this.lookupMergedBranches(),
            this.lookupLastCommitTimes(),
            // eslint-disable-next-line @typescript-eslint/await-thenable
            this.findLocalOrphanedBranches(),
            // eslint-disable-next-line @typescript-eslint/await-thenable
            this.findNeverPushedBranches(),
        ])

        // Calculate stale branches (must be done AFTER finding local orphaned and remote branches)
        this.staleBranches = this.localOrphanedBranches
            .filter(({ remoteBranch }) => !this.remoteBranches.includes(remoteBranch))
            .map(({ localBranch }) => localBranch)

        // Classify branches into the 3 groups
        this.classifyBranches()
        this.hasRunPreprocess = true
    }

    private async fetchRemote(): Promise<void> {
        const spinner = ora('Fetching from remote...').start()

        try {
            // Auto-prune: fetch and prune from remote
            execFileSync('git', ['fetch', this.remote, '--prune'])
            spinner.succeed('Fetched from remote')
        } catch {
            spinner.warn('Could not fetch from remote, using cached data instead')
            this.noConnection = true
        }
    }

    /**
     * Uses "git ls-remote" to find branches that are still available on the remote and store them in liveBranches state
     */
    async lookupLiveBranches(): Promise<void> {
        if (this.remote === '') {
            throw new RemoteError('Remote is empty. Please specify remote with -r parameter')
        }

        const remotesStr = await stdout('git remote -v')
        const hasRemote = split(remotesStr).some((line) => {
            const re = new RegExp(`^${this.remote}\\s`)

            return re.test(line)
        })

        if (!hasRemote) {
            console.log(
                `WARNING: Unable to find remote "${this.remote}".\r\n\r\nAvailable remotes are:\r\n${remotesStr}`,
            )
            this.noConnection = true
            return
        }

        try {
            // get list of remote branches from remote host
            const out = await stdoutFile('git', ['ls-remote', '-h', this.remote])
            const lines = split(out)

            // take out sha and refs/heads
            lines.forEach((line) => {
                const group = line.match(/refs\/heads\/([^\s]*)/)
                if (group && group[1]) {
                    this.liveBranches.add(group[1])
                }
            })
        } catch (err) {
            // reset branches
            this.liveBranches.clear()

            if (err && typeof err === 'object' && 'code' in err && err.code && String(err.code) === '128') {
                // error 128 means there is no connection currently to the remote
                // skip this step then
                this.noConnection = true
                return
            }

            throw err
        }
    }

    async findAllBranches(): Promise<void> {
        // list all the branches
        const out = await stdout('git branch --format="%(refname:short)@{%(upstream)}"')
        this.allBranches = split(out)
    }

    findLocalOrphanedBranches(): void {
        this.allBranches.forEach((line) => {
            // upstream has format: "@{refs/remotes/origin/some-branch-name}"
            const startIndex = line.indexOf(`@{refs/remotes/${this.remote}`)
            if (startIndex === -1) {
                return
            }

            const localBranch = line.slice(0, startIndex)
            const upstream = line.slice(startIndex + 2, -1).trim()
            const upParts = upstream.match(/refs\/remotes\/[^/]+\/(.+)/)
            const [, remoteBranch] = upParts || []

            this.localOrphanedBranches.push({
                localBranch,
                remoteBranch: remoteBranch || '',
            })
        })
    }

    async lookupUnmergedBranches(): Promise<void> {
        // list all the unmerged branches
        const out = await stdout('git branch --format="%(refname:short)" --no-merged')
        const lines = split(out)

        lines.forEach((line) => {
            const branchName = line.trim()
            if (branchName) {
                this.unmergedBranches.add(branchName)
            }
        })
    }

    async lookupRemoteBranches(): Promise<void> {
        this.remoteBranches = []

        // get list of remote branches
        const out = await stdout('git branch -r')

        // split lines
        const branches = split(out)

        // filter out non origin branches
        const re = new RegExp('^%s\\/([^\\s]*)'.replace('%s', this.remote))
        branches.forEach((branchName) => {
            const group = branchName.match(re)

            if (group && group[1]) {
                this.remoteBranches.push(group[1])
            }
        })
    }

    async getCurrentBranch(): Promise<void> {
        try {
            const out = await stdout('git branch --show-current')
            this.currentBranch = out.trim()
        } catch {
            this.currentBranch = ''
        }
    }

    findNeverPushedBranches(): void {
        this.allBranches.forEach((line) => {
            // If line ends with "@{}", it has no upstream
            if (line.endsWith('@{}')) {
                const branchName = line.slice(0, -3) // Remove "@{}"
                if (branchName) {
                    this.neverPushedBranches.add(branchName)
                }
            }
        })
    }

    async lookupMergedBranches(): Promise<void> {
        // Get all merged branches
        const out = await stdout('git branch --format="%(refname:short)" --merged')
        const lines = split(out)

        lines.forEach((line) => {
            const branchName = line.trim()
            if (branchName) {
                this.mergedBranches.push(branchName)
            }
        })
    }

    async lookupLastCommitTimes(): Promise<void> {
        // Get all local branches with their last commit timestamps in one efficient command
        const out = await stdout('git for-each-ref --format="%(refname:short)|%(committerdate:unix)" refs/heads/')
        const lines = split(out)

        lines.forEach((line) => {
            const [branchName, timestamp] = line.split('|')
            if (branchName && timestamp) {
                this.lastCommitTimes.set(branchName, parseInt(timestamp, 10))
            }
        })
    }

    classifyBranches(): void {
        // Group 1: Safe to delete (pre-selected)
        const seen1 = new Set<string>()
        this.safeToDelete = [
            // Stale branches that are merged (deleted from remote, no force needed)
            ...this.staleBranches.filter((b) => !this.unmergedBranches.has(b)),

            // Local merged branches never pushed to remote
            // (mergedBranches and unmergedBranches are mutually exclusive from git)
            ...this.mergedBranches.filter((b) => this.neverPushedBranches.has(b)),
        ]
            // Remove duplicates, current branch, and protected branches
            .filter((b) => !seen1.has(b) && seen1.add(b) && b !== this.currentBranch && !this.protectedBranches.has(b))

        // Group 2: Requires force (NOT pre-selected)
        const seen2 = new Set<string>()
        this.requiresForce = [
            // Stale branches that are unmerged
            ...this.staleBranches.filter((b) => this.unmergedBranches.has(b)),

            // Never pushed branches that are unmerged
            ...[...this.neverPushedBranches].filter((b) => this.unmergedBranches.has(b)),
        ]
            // Remove duplicates, current branch, and protected branches
            .filter((b) => !seen2.has(b) && seen2.add(b) && b !== this.currentBranch && !this.protectedBranches.has(b))

        // Group 3: Info only (disabled)
        const seen3 = new Set<string>()
        this.infoOnly = [
            // Local branches with different names tracking active remote branches
            // (renamed locally, original still exists on remote)
            ...this.localOrphanedBranches
                .filter(
                    ({ remoteBranch, localBranch }) =>
                        remoteBranch !== localBranch && this.liveBranches.has(remoteBranch),
                )
                .map(({ localBranch }) => localBranch),
        ]
            // Remove duplicates, current branch, and protected branches
            .filter((b) => !seen3.has(b) && seen3.add(b) && b !== this.currentBranch && !this.protectedBranches.has(b))
    }

    /**
     * Get a short reason why a branch is in the safe-to-delete category
     */
    public getSafeToDeleteReason(branch: string): string {
        const timestamp = this.lastCommitTimes.get(branch)
        const timeAgo = timestamp ? `; last commit ${formatTimeAgo(timestamp)}` : ''

        if (this.staleBranches.includes(branch)) {
            return `merged, remote deleted${timeAgo}`
        }

        if (this.neverPushedBranches.has(branch)) {
            return `merged, local only${timeAgo}`
        }

        return `merged${timeAgo}`
    }

    /**
     * Get a short reason why a branch requires force delete
     */
    public getRequiresForceReason(branch: string): string {
        const timestamp = this.lastCommitTimes.get(branch)
        const timeAgo = timestamp ? `; last commit ${formatTimeAgo(timestamp)}` : ''

        if (this.staleBranches.includes(branch)) {
            return `unmerged, remote deleted${timeAgo}`
        }

        if (this.neverPushedBranches.has(branch)) {
            return `unmerged, local only${timeAgo}`
        }

        return `unmerged${timeAgo}`
    }

    /**
     * Get a short reason why a branch is info-only
     */
    public getInfoOnlyReason(branch: string): string {
        const timestamp = this.lastCommitTimes.get(branch)
        const timeAgo = timestamp ? `last commit ${formatTimeAgo(timestamp)}` : ''

        return timeAgo
    }

    async getDeletableBranches(): Promise<string[]> {
        if (!this.hasRunPreprocess) {
            await this.preprocess()
        }

        return this.staleBranches
    }

    async deleteBranches(): Promise<{ success: string[]; failed: Array<{ branch: string; error: string }> }> {
        const success: string[] = []
        const failed: Array<{ branch: string; error: string }> = []

        if (!this.queuedForDeletion.length && !this.queuedForForceDeletion.length) {
            return { success, failed }
        }

        // Delete safe branches first (with -d)
        for (const branchName of this.queuedForDeletion) {
            const spinner = ora(`Removing branch ${branchName}`).start()
            try {
                spinner.color = 'yellow'
                execFileSync('git', ['branch', '-d', branchName])
                spinner.succeed(`Removed branch ${branchName}`)
                success.push(branchName)
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err)
                failed.push({ branch: branchName, error: errorMessage })
                spinner.fail(`Failed to remove branch ${branchName}`)
            }
        }

        // Delete force branches (with -D)
        for (const branchName of this.queuedForForceDeletion) {
            const spinner = ora(`Force removing branch ${branchName}`).start()
            try {
                spinner.color = 'red'
                execFileSync('git', ['branch', '-D', branchName])
                spinner.succeed(`Force removed branch ${branchName}`)
                success.push(branchName)
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err)
                failed.push({ branch: branchName, error: errorMessage })
                spinner.fail(`Failed to force remove branch ${branchName}`)
            }
        }

        this.failedToDelete = failed
        return { success, failed }
    }
}
