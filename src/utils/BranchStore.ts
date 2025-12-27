import { execFileSync } from 'node:child_process'
import ora from 'ora'
import stdout, { stdoutFile } from 'simple-stdout'
import split from './split.js'

class RemoteError extends Error {
    code = 1984
}

export default class BranchStore {
    remote: string
    remoteBranches: Array<string>

    /**
     * Local branches which track remote branches that no longer exist
     */
    localOrphanedBranches: Array<{ localBranch: string; remoteBranch: string }>

    /**
     * Branches that are still in use; will never be deleted
     */
    liveBranches: Array<string>

    /**
     * Should be offered for deletion, will need force
     */
    unmergedBranches: Array<string>

    /**
     * Current branch (cannot be deleted)
     */
    currentBranch: string

    /**
     * Protected branches that should never be deleted
     */
    protectedBranches: Array<string>

    /**
     * Branches that have never been pushed to remote
     */
    neverPushedBranches: Array<string>

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
     * Info only - renamed branches still on remote (disabled in UI)
     */
    infoOnly: Array<string>

    /**
     * Map of branch name to last commit timestamp (seconds since epoch)
     */
    branchLastCommitTimes: Map<string, number>

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

    constructor(ops: { remote: string }) {
        this.remote = ops.remote
        this.remoteBranches = []
        this.localOrphanedBranches = []
        this.staleBranches = []
        this.queuedForDeletion = []
        this.queuedForForceDeletion = []
        this.failedToDelete = []
        this.liveBranches = []
        this.unmergedBranches = []
        this.currentBranch = ''
        this.protectedBranches = ['main', 'master', 'develop', 'development']
        this.neverPushedBranches = []
        this.mergedBranches = []
        this.safeToDelete = []
        this.requiresForce = []
        this.infoOnly = []
        this.branchLastCommitTimes = new Map()
        this.noConnection = false
        this.allBranches = []
    }

    setQueuedForDeletion(safe: Array<string>, force: Array<string>) {
        this.queuedForDeletion = safe
        this.queuedForForceDeletion = force
    }

    async preprocess() {
        // Reset all arrays at the start
        this.remoteBranches = []
        this.localOrphanedBranches = []
        this.staleBranches = []
        this.liveBranches = []
        this.unmergedBranches = []
        this.neverPushedBranches = []
        this.mergedBranches = []
        this.safeToDelete = []
        this.requiresForce = []
        this.infoOnly = []
        this.noConnection = false

        // Auto-prune: fetch and prune from remote
        const spinner = ora('Fetching from remote...').start()
        try {
            execFileSync('git', ['fetch', this.remote, '--prune'])
            spinner.succeed('Fetched from remote')
        } catch (err) {
            spinner.warn('Could not fetch from remote, using cached data instead')
            this.noConnection = true
        }

        // Gather all the information
        // Run potentially conflicting git operations in a controlled order to avoid lock contention
        await this.getCurrentBranch()
        await this.findAllBranches()
        await Promise.all([
            this.findLiveBranches(),
            this.findUnmergedBranches(),
            this.findRemoteBranches(),
            this.findMergedBranches(),
            this.findBranchLastCommitTimes(),
            this.findLocalOrphanedBranches(),
            this.findNeverPushedBranches(),
        ])

        // Calculate stale branches (must be done AFTER finding local orphaned and remote branches)
        this.staleBranches = this.localOrphanedBranches
            .filter(({ remoteBranch }) => !this.remoteBranches.includes(remoteBranch))
            .map(({ localBranch }) => localBranch)

        // Classify branches into the 3 groups
        this.classifyBranches()
    }

    /**
     * Uses "git ls-remote" to find branches that are still available on the remote and store them in liveBranches state
     */
    async findLiveBranches() {
        if (this.remote === '') {
            throw new RemoteError('Remote is empty. Please specify remote with -r parameter')
        }

        const remotesStr = await stdout('git remote -v')
        const hasRemote = split(remotesStr).some((line) => {
            const re = new RegExp(`^${this.remote}\\s`)
            if (re.test(line)) {
                return true
            }
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
                    this.liveBranches.push(group[1])
                }
            })
        } catch (err) {
            // reset branches
            this.liveBranches = []
            // @ts-expect-error - this is a custom error code
            if (err.code && err.code === 128) {
                // error 128 means there is no connection currently to the remote
                // skip this step then
                this.noConnection = true
                return
            }

            throw err
        }
    }

    async findAllBranches() {
        // list all the branches
        const out = await stdout('git branch --format="%(refname:short)@{%(upstream)}"')
        this.allBranches = split(out)
    }

    findLocalOrphanedBranches() {
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

    async findUnmergedBranches() {
        // list all the unmerged branches
        const out = await stdout('git branch --format="%(refname:short)" --no-merged')
        const lines = split(out)

        lines.forEach((line) => {
            const branchName = line.trim()
            if (branchName) {
                this.unmergedBranches.push(branchName)
            }
        })
    }

    async findRemoteBranches() {
        this.remoteBranches = []

        // get list of remote branches
        const out = await stdout('git branch -r')

        // split lines
        const branches = split(out)

        // filter out non origin branches
        const re = new RegExp('^%s\\/([^\\s]*)'.replace('%s', this.remote))
        branches.forEach((branchName) => {
            const group = branchName.match(re)

            if (group) {
                this.remoteBranches.push(group[1] || '')
            }
        })
    }

    async getCurrentBranch() {
        try {
            const out = await stdout('git branch --show-current')
            this.currentBranch = out.trim()
        } catch (err) {
            this.currentBranch = ''
        }
    }

    findNeverPushedBranches() {
        this.allBranches.forEach((line) => {
            // If line ends with "@{}", it has no upstream
            if (line.endsWith('@{}')) {
                const branchName = line.slice(0, -3) // Remove "@{}"
                if (branchName) {
                    this.neverPushedBranches.push(branchName)
                }
            }
        })
    }

    async findMergedBranches() {
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

    async findBranchLastCommitTimes() {
        // Get all local branches with their last commit timestamps in one efficient command
        const out = await stdout('git for-each-ref --format="%(refname:short)|%(committerdate:unix)" refs/heads/')
        const lines = split(out)

        lines.forEach((line) => {
            const [branchName, timestamp] = line.split('|')
            if (branchName && timestamp) {
                this.branchLastCommitTimes.set(branchName, parseInt(timestamp, 10))
            }
        })
    }

    classifyBranches() {
        const protectedBranchesSet = new Set(this.protectedBranches)
        const unmergedBranchesSet = new Set(this.unmergedBranches)

        // Group 1: Safe to delete (pre-selected)
        const seen1 = new Set<string>()
        const safeToDelete = [
            // Stale branches that are merged (deleted from remote, no force needed)
            ...this.staleBranches.filter((b) => !unmergedBranchesSet.has(b)),

            // Local merged branches never pushed to remote
            // (mergedBranches and unmergedBranches are mutually exclusive from git)
            ...this.mergedBranches.filter((b) => this.neverPushedBranches.includes(b)),
        ]
            // Remove duplicates, current branch, and protected branches
            .filter((b) => !seen1.has(b) && seen1.add(b) && b !== this.currentBranch && !protectedBranchesSet.has(b))

        // Group 2: Requires force (NOT pre-selected)
        const seen2 = new Set<string>()
        const requiresForce = [
            // Stale branches that are unmerged
            ...this.staleBranches.filter((b) => unmergedBranchesSet.has(b)),

            // Never pushed branches that are unmerged
            ...this.neverPushedBranches.filter((b) => unmergedBranchesSet.has(b)),
        ]
            // Remove duplicates, current branch, and protected branches
            .filter((b) => !seen2.has(b) && seen2.add(b) && b !== this.currentBranch && !protectedBranchesSet.has(b))

        // Group 3: Info only (disabled)
        const liveBranchesSet = new Set(this.liveBranches)
        const seen3 = new Set<string>()
        const infoOnly = [
            // Local branches with different names tracking active remote branches
            // (renamed locally, original still exists on remote)
            ...this.localOrphanedBranches
                .filter(
                    ({ remoteBranch, localBranch }) =>
                        remoteBranch !== localBranch && liveBranchesSet.has(remoteBranch),
                )
                .map(({ localBranch }) => localBranch),
        ]
            // Remove duplicates, current branch, and protected branches
            .filter((b) => !seen3.has(b) && seen3.add(b) && b !== this.currentBranch && !protectedBranchesSet.has(b))

        this.safeToDelete = safeToDelete
        this.requiresForce = requiresForce
        this.infoOnly = infoOnly
    }

    /**
     * Format a time ago string from a timestamp
     */
    private formatTimeAgo(timestamp: number): string {
        const nowDate = new Date()
        const pastDate = new Date(timestamp * 1000)

        const diffMs = nowDate.getTime() - pastDate.getTime()
        const diffSeconds = Math.floor(diffMs / 1000)

        const minute = 60
        const hour = minute * 60
        const day = hour * 24
        const week = day * 7

        if (diffSeconds < minute) {
            return 'just now'
        }
        if (diffSeconds < hour) {
            const mins = Math.floor(diffSeconds / minute)
            return `${mins}m ago`
        }
        if (diffSeconds < day) {
            const hours = Math.floor(diffSeconds / hour)
            return `${hours}h ago`
        }
        if (diffSeconds < week) {
            const days = Math.floor(diffSeconds / day)
            return `${days}d ago`
        }

        // For weeks, we can safely use fixed 7-day intervals
        const weeks = Math.floor(diffSeconds / week)

        // Compute calendar-based years difference
        const nowYear = nowDate.getFullYear()
        const pastYear = pastDate.getFullYear()
        const nowMonth = nowDate.getMonth()
        const pastMonth = pastDate.getMonth()
        const nowDay = nowDate.getDate()
        const pastDay = pastDate.getDate()

        let years = nowYear - pastYear
        if (nowMonth < pastMonth || (nowMonth === pastMonth && nowDay < pastDay)) {
            years -= 1
        }

        if (years >= 1) {
            return `${years}y ago`
        }

        // Compute calendar-based months difference (less than a year)
        let months = (nowYear - pastYear) * 12 + (nowMonth - pastMonth)
        if (nowDay < pastDay) {
            months -= 1
        }

        if (months >= 1) {
            return `${months}mo ago`
        }

        // If less than one full calendar month has elapsed, fall back to weeks
        return `${weeks}w ago`
    }

    /**
     * Get a short reason why a branch is in the safe-to-delete category
     */
    getSafeToDeleteReason(branch: string): string {
        const timestamp = this.branchLastCommitTimes.get(branch)
        const timeAgo = timestamp ? `; last commit ${this.formatTimeAgo(timestamp)}` : ''

        if (this.staleBranches.includes(branch)) {
            return `merged, remote deleted${timeAgo}`
        }
        if (this.neverPushedBranches.includes(branch)) {
            return `merged, local only${timeAgo}`
        }
        return `merged${timeAgo}`
    }

    /**
     * Get a short reason why a branch requires force delete
     */
    getRequiresForceReason(branch: string): string {
        const timestamp = this.branchLastCommitTimes.get(branch)
        const timeAgo = timestamp ? `; last commit ${this.formatTimeAgo(timestamp)}` : ''

        if (this.staleBranches.includes(branch)) {
            return `unmerged, remote deleted${timeAgo}`
        }
        if (this.neverPushedBranches.includes(branch)) {
            return `unmerged, local only${timeAgo}`
        }
        return `unmerged${timeAgo}`
    }

    /**
     * Get a short reason why a branch is info-only
     */
    getInfoOnlyReason(branch: string): string {
        const timestamp = this.branchLastCommitTimes.get(branch)
        const timeAgo = timestamp ? `; last commit ${this.formatTimeAgo(timestamp)}` : ''
        return `renamed locally${timeAgo}`
    }

    async findStaleBranches() {
        await this.preprocess()
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
