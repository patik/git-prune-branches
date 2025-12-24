# Version 2 planning

Organizing and defining which updates will go into the next major version of `git-prune-branches`.

For background, this package started as a fork of https://github.com/nemisj/git-removed-branches. That tool was meant for a more automated approach, i.e. run a single command and it deletes stuff. My tool is meant to be more interactive, visual, and explanatory.

**📋 See [VERSION_2_IMPLEMENTATION_PLAN.md](./VERSION_2_IMPLEMENTATION_PLAN.md) for the complete implementation plan.**

---

## Planning Notes (Original)

## Test branches

These are the branches used for testing in `src/tests/setup.ts` and should represent a variety of different use cases. Here is how they're handled by V1 (as demonstrated with `src/tests/store-debug.ts`), and how they could/should be handled by V2.

- `#567--echo--special-chars--pushed-then-deleted-from-remote--no-commits`
    - Version 1 offers to delete? Yes
    - Needs force to delete? No

- `alpha/pushed-then-deleted-from-remote--no-commits`
    - Version 1 offers to delete? Yes
    - Version 2 should offer to delete? Yes
    - Needs force to delete? No

- `bravo/local-merged--never-on-remote`
    - Version 1 offers to delete? No
    - Version 2 should offer to delete? Yes
    - Needs force to delete? No

- `charlie/local-never-pushed`
    - Version 1 offers to delete? No
    - Version 2 should offer to delete? Yes
    - Needs force to delete? Yes

- `delta/with-commits--remote-deleted--needs-force`
    - Version 1 offers to delete? Yes
    - Version 2 should offer to delete? Yes
    - Needs force to delete? Yes

- `foxtrot/local-name-different--removed--can-be-soft-removed`
    - Version 1 offers to delete? Yes
    - Version 2 should offer to delete? Yes
    - Needs force to delete? No

- `golf/renamed-locally--not-deleted-on-remote--not-offered-for-deletion`
    - Version 1 offers to delete? No
    - Version 2 should offer to delete? Yes
    - Needs force to delete? No

- `india/remote-name-diff--not-deleted`
    - Version 1 offers to delete? No
    - Version 2 should offer to delete? No
    - Needs force to delete? N/A

## Version 1 status quo

All _stale_ branches will be offered for deletion.

Only those that do not also appear in `unmergedBranches` will be deletable without `--force`.

### User flow

- all stale branches are shown
- user can select one/many/all
- some will fail to delete because they needed `--force`
- the user is shown a second list of branches, and can confirm that they want to force-delete those

It takes many steps to actually delete branches if any need `--force`, which is often the case in my experience.

## Version 2 changes

Goals:

- fewer steps to complete
- clarity around which branches need `--force`

### Updated user flow

User sees only 2 interactive screens:

1. List of branches they could delete
    - all information about needing `--force` should be conveyed through this screen
2. Confirmation step

After that, they see some kind of report just before the app exits on its own.

### Check box groups

These could change.

- First group
    - no `--force` needed
    - stale list MINUS unmerged list
- Second group
    - needs `--force`
    - stale list PLUS unmerged lists
- Third group
    - never pushed to remote
    - no `--force` needed
    - would include `bravo` and `golf` branches
- Fourth group
    - never pushed to remote
    - needs `--force`
    - would include `charlie` branch
- Fifth group
    - just FYI, for the sake of completion, will not offer/allow deletion of these branches (i.e. the check boxes will be disabled or the branches will be displayed as a plain list)
    - branch was renamed locally
    - no `--force` needed
    - would include `india` branch

I might also need to add features to `inquirer-grouped-checkboxes` to make it 'harder' for the user to accidentally select some branches. For example, I could make it so that "select all" does not include the fourth group above.

## CLI flags

This tool supports various flags like `--prune` and `--force` to guide the behavior of the app. These were inherited from [the repo I forked](https://github.com/nemisj/git-removed-branches). I question whether they fit the spirit of this app. This app is meant to be more interactive and visual, so perhaps we don't need to continue supporting flags. It would also make the `BranchStore` class a bit simpler (should they even be in there?).
