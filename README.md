# git-prune-branches

Review and delete stale branches using an interactive prompt

<img src="https://github.com/user-attachments/assets/eb468d62-a842-4d43-8645-fed82c5ebdcf" width="600" alt="">

Addresses common questions, like:

- [Remove tracking branches no longer on remote](https://stackoverflow.com/questions/7726949/remove-tracking-branches-no-longer-on-remote)
- [How to prune local tracking branches that do not exist on remote anymore?](https://stackoverflow.com/questions/13064613/how-to-prune-local-tracking-branches-that-do-not-exist-on-remote-anymore/30494276#30494276)

## What does it do?

This command will automatically fetch and prune from your remote, then display an interactive selection of branches to delete organized into three groups:

1. **Safe to delete** (pre-selected) - Merged branches that were deleted from remote, or local merged branches that were never pushed
2. **Requires force delete** (not pre-selected) - Unmerged branches with commits that need `--force` to delete
3. **Info only** - Renamed branches that still exist on remote (shown for context, cannot be deleted)

After selecting branches, you'll see a preview of the exact git commands that will be executed before confirming the deletion.

<img width="938" height="504" alt="" src="https://github.com/user-attachments/assets/c35fe088-0368-4d2b-9a68-2970ccc43a14" />

The tool automatically fetches and prunes from your remote before showing branches, ensuring you always have up-to-date information. A working network connection to your remote is required. If no connection can be established, cached local information will be used instead.

## Installation

```bash
npm install -g git-prune-branches
```

Recommended: install the package globally with `-g` flag so that you can use it directly as a sub command of git, like this:

```bash
git prune-branches
```

## Usage

It's possible to use the package via `npx` without installing:

```bash
npx git-prune-branches
```

When installed globally with `npm install -g git-prune-branches`, you can use this git alias:

```bash
git prune-branches
```

### Custom remote

If you have configured remote alias to something different than **'origin'**, you can use `--remote` or `-r` flag to specify the name of the remote. For example, to specify remote to be `upstream`, you can use:

```bash
git prune-branches --remote upstream
```

### Custom protected branches

If you want to completely avoid deleting certain branches, you can define the branch names using the `--protected` flag. For example, to skip the `develop` and `release` branches, you can use:

```bash
git prune-branches --protected develop,release
```

If `--protected` is not specified, `git-prune-branches` will assume that branches named `main`, `master`, `develop`, and `development` should be protected.

## Version

To print the version:

```bash
git prune-branches --version
```

## Troubleshooting

If you encounter error `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` it is possible that your repository contains too many branches (more than 3382—see [discussion](https://github.com/nemisj/git-removed-branches/issues/11)).

You can fix this by specifying NODE_MAX_BUFFER environment variable. For example:

```bash
NODE_MAX_BUFFER=1048576 git prune-branches
```

## Development

Note that `pnpm` is recommended for development since some scripts us `pnpx` internally.

### Running

Run the source code using `tsx`, e.g. to test it on another local repo

```sh
pnpx tsx ~/code/git-prune-branches/src/index.ts
```

You can also run the app against a fake git repo in a temporary folder

```sh
pnpm run test:manual
```

### Testing

This project uses [Vitest](https://vitest.dev/) for testing. The tests create a temporary git repository and verify the behavior of the tool in different scenarios.

```bash
pnpm test # watch mode
pnpm test:once # run all tests once
```

### Building

Build the TypeScript source:

```bash
pnpm build
```

## Breaking changes

### Version 2.0.0

- Removed flags: `--dry-run`, `--prune-all`, `--force`, and `--yes`
    - `git-prune-branches` is meant to be a visual, interactive app. If you're looking for automation, consider another package such as [git-removed-branches](https://github.com/nemisj/git-removed-branches)

## Credit

Forked from [git-removed-branches](https://github.com/nemisj/git-removed-branches) by [Maks Nemisj](https://github.com/nemisj) @nemisj
