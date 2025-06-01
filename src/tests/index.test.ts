import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { testSetup } from './setup.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const bin = path.join(__dirname, '../../dist/index.js')

let workingDir: string

describe('git-prune-branches', () => {
    beforeAll(async () => {
        workingDir = await testSetup()
    })

    describe('dry run mode', () => {
        it('should show branches that would be deleted without actually deleting them', () => {
            const output = execFileSync('node', [bin, '--prune-all', '--dry-run'], {
                cwd: workingDir,
                encoding: 'utf8',
            })

            // Should not include the persistent branch
            expect(output).not.toContain('chore/local-name-persistent')

            // Should include branches that would be deleted
            expect(output).toContain(' chore/local-name-deleted')
            expect(output).toContain(' some-work')
            expect(output).toContain(' feature/fast-forwarded')
            expect(output).toContain(' not-yet-merged')
            expect(output).toMatchInlineSnapshot(`
              "Found remotely removed branches:
                - chore/local-name-deleted
                - feature/fast-forwarded
                - not-yet-merged
                - some-work

              ℹ️ To remove branches, don’t include the --dry-run flag
              [32m✅ Deleted all 4 branches[39m
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
              [93m⚠️ Could not remove 1 of those 4 branches.
              You may try again using [1m--force[22m, or cancel by pressing Ctrl+C
              [39m
              [34m?[39m [1m[31mSelect branches to forcefully remove[39m[22m (Press [36m[1m<space>[22m[39m to select, [36m[1m<a>[22m[39m to toggle
              all, [36m[1m<i>[22m[39m to invert selection, and [36m[1m<enter>[22m[39m to proceed)
              [36m❯◯ not-yet-merged[39m[?25l[18G
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
              [32m✅ Deleted 1 branch[39m
              "
            `)
        })
    })
})
