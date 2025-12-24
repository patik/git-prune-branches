import stdout from 'easy-stdout'
import ora from 'ora'
import split from './split.js'

export default class BranchStore {
    remote: string
    remoteBranches: Array<string>

    /**
     * Local branches which track remote branches that no longer exist
     */
    localOrphanedBranches: Array<{ localBranch: string; remoteBranch: string }>

    /**
     * The app will offer to delete these
     */
    staleBranches: Array<string>
    queuedForDeletion: Array<string>
    queuedForForceDeletion: Array<string>
    failedToDelete: Array<{ branch: string; error: string }>

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
        this.noConnection = false
    }

    setQueuedForDeletion(safe: Array<string>, force: Array<string>) {
        this.queuedForDeletion = safe
        this.queuedForForceDeletion = force
    }

    async preprocess() {
        // Auto-prune: fetch and prune from remote
        const spinner = ora('Fetching from remote...').start()
        try {
            await stdout(`git fetch ${this.remote} --prune`)
            spinner.succeed('Fetched from remote')
        } catch (err) {
            spinner.warn('Could not fetch from remote (will use cached data)')
        }

        // Reset all arrays
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

        // Gather all the information
        await Promise.all([
            this.findCurrentBranch(),
            this.findLiveBranches(),
            this.findLocalOrphanedBranches(),
            this.findUnmergedBranches(),
            this.findRemoteBranches(),
            this.findNeverPushedBranches(),
            this.findMergedBranches(),
        ])

        // Calculate stale branches (must be done AFTER finding local orphaned and remote branches)
        this.staleBranches = this.localOrphanedBranches
            .filter(({ remoteBranch }) => !this.remoteBranches.includes(remoteBranch))
            .map(({ localBranch }) => localBranch)

        // Classify branches into the 3 groups
        this.classifyBranches()
    }

    //
    // this method will use "git ls-remote"
    // to find branches which are still available on the remote
    // and store them in liveBranches state
    //
    async findLiveBranches() {
        if (this.remote === '') {
            const e = new Error('Remote is empty. Please specify remote with -r parameter')
            // @ts-expect-error - this is a custom error code
            e.code = 1984
            throw e
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
                `WARNING: Unable to find remote "${
                    this.remote
                }".\r\n\r\nAvailable remotes are:\r\n${remotesStr?.toString()}`,
            )
            this.noConnection = true
            return
        }

        try {
            // get list of remote branches from remote host
            const out = await stdout(`git ls-remote -h ${this.remote}`)
            const lines = split(out)

            // take out sha and refs/heads
            lines?.forEach((line) => {
                const group = line.match(/refs\/heads\/([^\s]*)/)
                if (group) {
                    this.liveBranches.push(group[1] || '')
                }
            })
        } catch (err) {
            // reset branches
            this.liveBranches = []
            // @ts-expect-error - this is a custom error code
            if (err.code && err.code === '128') {
                // error 128 means there is no connection currently to the remote
                // skip this step then
                this.noConnection = true
                return
            }

            throw err
        }
    }

    async findLocalOrphanedBranches() {
        // list all the branches
        // by using format
        // git branch --format="%(refname:short)@{%(upstream)}"
        const out = await stdout('git branch --format="%(refname:short)@{%(upstream)}"')
        const lines = split(out)

        lines.forEach((line) => {
            // upstream has format: "@{refs/remotes/origin/#333-work}"
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

    async findCurrentBranch() {
        try {
            const out = await stdout('git branch --show-current')
            this.currentBranch = out.trim()
        } catch (err) {
            this.currentBranch = ''
        }
    }

    async findNeverPushedBranches() {
        // Get branches with no upstream tracking
        const out = await stdout('git branch --format="%(refname:short)@{%(upstream)}"')
        const lines = split(out)

        lines.forEach((line) => {
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

    classifyBranches() {
        // Group 1: Safe to delete (pre-selected)
        const safeToDelete = [
            // Stale branches that are merged (deleted from remote, no force needed)
            ...this.staleBranches.filter((b) => !this.unmergedBranches.includes(b)),

            // Local merged branches never pushed to remote
            ...this.mergedBranches.filter(
                (b) => this.neverPushedBranches.includes(b) && !this.unmergedBranches.includes(b),
            ),
        ]
            // Remove duplicates, current branch, and protected branches
            .filter(
                (b, i, arr) => arr.indexOf(b) === i && b !== this.currentBranch && !this.protectedBranches.includes(b),
            )

        // Group 2: Requires force (NOT pre-selected)
        const requiresForce = [
            // Stale branches that are unmerged
            ...this.staleBranches.filter((b) => this.unmergedBranches.includes(b)),

            // Never pushed branches that are unmerged
            ...this.neverPushedBranches.filter((b) => this.unmergedBranches.includes(b)),
        ]
            // Remove duplicates, current branch, and protected branches
            .filter(
                (b, i, arr) => arr.indexOf(b) === i && b !== this.currentBranch && !this.protectedBranches.includes(b),
            )

        // Group 3: Info only (disabled)
        const infoOnly = [
            // Local branches with different names tracking active remote branches
            // (renamed locally, original still exists on remote)
            ...this.localOrphanedBranches
                .filter(
                    ({ remoteBranch, localBranch }) =>
                        remoteBranch !== localBranch && this.liveBranches.includes(remoteBranch),
                )
                .map(({ localBranch }) => localBranch),
        ]
            // Remove duplicates, current branch, and protected branches
            .filter(
                (b, i, arr) => arr.indexOf(b) === i && b !== this.currentBranch && !this.protectedBranches.includes(b),
            )

        this.safeToDelete = safeToDelete
        this.requiresForce = requiresForce
        this.infoOnly = infoOnly
    }

    async findStaleBranches() {
        await this.preprocess()
        // staleBranches is now populated in preprocess()
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
                const command = `git branch -d "${branchName}"`
                await stdout(command)
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
                const command = `git branch -D "${branchName}"`
                await stdout(command)
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
