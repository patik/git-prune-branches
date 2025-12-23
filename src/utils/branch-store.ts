import stdout from 'easy-stdout'
import ora from 'ora'
import split from './split.js'

export default class BranchStore {
    remote: string
    force: boolean
    dryRun: boolean
    pruneAll: boolean
    skipConfirmation: boolean
    remoteBranches: Array<string>
    localBranches: Array<{ localBranch: string; remoteBranch: string }>
    staleBranches: Array<string>
    queuedForDeletion: Array<string>
    failedToDelete: Array<string>
    liveBranches: Array<string>
    unmergedBranches: Array<string>
    noConnection: boolean

    constructor(ops: {
        remote: string
        force: boolean
        dryRun: boolean
        pruneAll: boolean
        skipConfirmation: boolean
    }) {
        this.remote = ops.remote
        this.force = ops.force
        this.dryRun = ops.dryRun
        this.pruneAll = ops.pruneAll
        this.skipConfirmation = ops.skipConfirmation
        this.remoteBranches = []
        this.localBranches = []
        this.staleBranches = []
        this.queuedForDeletion = []
        this.failedToDelete = []
        this.liveBranches = []
        this.unmergedBranches = []
        this.noConnection = false
    }

    setForce(force: boolean) {
        this.force = force
    }

    setQueuedForDeletion(branches: Array<string>) {
        this.queuedForDeletion = branches
    }

    async preprocess() {
        // cached branches from the remote
        this.remoteBranches = []

        // local branches which are checkout from the remote
        this.localBranches = []

        // branches which are available locally but not remotely
        this.staleBranches = []

        // branches which are available on host
        this.liveBranches = []

        // branches which are not yet merged
        this.unmergedBranches = []

        // if we are unable to connect to remote
        // this will become true
        this.noConnection = false

        await Promise.all([
            this.findLiveBranches(),
            this.findLocalBranches(),
            this.findUnmergedBranches(),
            this.findRemoteBranches(),
        ])
        await this.analyzeLiveAndCache()
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

    async findLocalBranches() {
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

            this.localBranches.push({
                localBranch,
                remoteBranch: remoteBranch || '',
            })
        })
    }

    async findUnmergedBranches() {
        // list all the unmerged branches
        // by using format
        // "%(refname:short)@{%(upstream)}"
        const out = await stdout('git branch --format="%(refname:short)@{%(upstream)}" --no-merged')
        const lines = split(out)

        lines.forEach((line) => {
            // upstream has format: "@{refs/remotes/origin/#333-work}"
            const startIndex = line.indexOf(`@{refs/remotes/${this.remote}`)
            if (startIndex === -1) {
                return
            }

            const localBranch = line.slice(0, startIndex)

            this.unmergedBranches.push(localBranch)
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
        branches?.forEach((branchName) => {
            const group = branchName.match(re)

            if (group) {
                this.remoteBranches.push(group[1] || '')
            }
        })
    }

    //
    // this method will look which branches on remote are absent
    // but still available in here in remotes
    //
    async analyzeLiveAndCache() {
        if (this.noConnection) {
            // unable to determinate remote branches, because host is not available
            console.warn('WARNING: Unable to connect to remote host')
            return
        }

        const message = [
            'WARNING: Your git repository is outdated, please run "git fetch -p"',
            '         Following branches are not pruned yet locally:',
            '',
        ]
        let show = false

        // compare absent remotes
        this.remoteBranches.forEach((branch) => {
            if (branch === 'HEAD') {
                //
            } else if (this.liveBranches.indexOf(branch) === -1) {
                message.push('         - ' + branch)
                show = true
            }
        })

        message.push('')

        if (show) {
            console.warn(message.join('\r\n'))
        }

        this.remoteBranches = this.liveBranches
    }

    async findStaleBranches() {
        await this.preprocess()
        this.localBranches.forEach(({ localBranch, remoteBranch }) => {
            if (this.remoteBranches.indexOf(remoteBranch) === -1) {
                this.staleBranches.push(localBranch)
            }
        })

        return this.staleBranches
    }

    async deleteBranches() {
        if (!this.queuedForDeletion.length) {
            console.info('No remotely removed branches found')
            return
        }

        if (this.dryRun) {
            console.log('Found remotely removed branches:')
        }

        const failures: Array<string> = []

        for (const branchName of this.queuedForDeletion) {
            if (!this.dryRun) {
                const spinner = ora(`Removing branch ${branchName}`).start()
                try {
                    const dFlag = this.force ? '-D' : '-d'
                    spinner.color = 'yellow'
                    const command = `git branch ${dFlag} "${branchName}"`
                    await stdout(command)
                    spinner.succeed(`Removed branch ${branchName}`)
                } catch (err) {
                    failures.push(branchName)
                    spinner.fail(`Failed to remove branch ${branchName}`)
                }
            } else {
                console.info(`  - ${branchName}`)
            }
        }

        console.info()

        if (failures.length === 0 && this.dryRun) {
            console.info('ℹ️ To remove branches, don’t include the --dry-run flag')
        }

        // Add new failures to the list
        this.failedToDelete = failures
    }
}
