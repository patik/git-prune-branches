import BranchStore from '../utils/BranchStore.js'
import { establishArgs } from '../utils/establish-args.js'

const argv = establishArgs()

export default new BranchStore({
    remote: argv.remote,
})
