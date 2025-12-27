import { establishArgs } from '../utils/establish-args.js'
import BranchStore from './BranchStore.js'

const argv = establishArgs()

export default new BranchStore({
    remote: argv.remote,
    protected: argv.protected,
})
