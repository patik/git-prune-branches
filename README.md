# git-prune-branches

List or remove local tracked branches, which are deleted from the remote.

It's a fork of [git-removed-branches](https://github.com/nemisj/git-removed-branches) with an interactive prompt, and the ability to retry deleting branches with `--force`

<img src="https://github.com/user-attachments/assets/ac1a3823-a04c-4f83-960e-036788949fb7" width="720" alt="">

<!-- <img src="https://github.com/user-attachments/assets/944bc691-2c0f-4047-8d83-35c13b1f9d82" width="821" alt="">-->
<!-- <img src="https://github.com/user-attachments/assets/ce5d0e53-6d42-4cfe-b920-0a268d87dd06" width="1043" alt=""> -->
<!-- https://github.com/user-attachments/assets/e4502861-bd7d-47b7-aee7-e39154bc769c -->

Addresses questions, like:

- [Remove tracking branches no longer on remote](https://stackoverflow.com/questions/7726949/remove-tracking-branches-no-longer-on-remote)
- [How to prune local tracking branches that do not exist on remote anymore?](https://stackoverflow.com/questions/13064613/how-to-prune-local-tracking-branches-that-do-not-exist-on-remote-anymore/30494276#30494276)

![Demo](https://github.com/patik/git-prune-branches/blob/master/usage.gif)

## What does it do?

This command will automatically run `git fetch --prune` to sync with your remote, then compare your local branches and show you an interactive list of branches organized into three categories:

- **Safe to delete**: Branches that are merged and can be safely removed without `--force`
- **Requires force delete**: Unmerged branches that need `--force` to delete (not pre-selected for safety)
- **Info only**: Renamed branches that still exist on remote (shown for context)

<img width="449" alt="Prompt with list of branches, allowing arbitrary selection" src="https://github.com/user-attachments/assets/705d10ff-733e-449d-832a-94cef66e08c6" />

The tool automatically fetches and prunes from your remote before showing branches, ensuring you always have up-to-date information. A working network connection to your remote is required. If no connection can be established, cached local information will be used instead.

## Installation

### NPM

```bash
npm install -g git-prune-branches
```

Please install a package globally with -g flag so that you can use it directly as a sub command of git, like this:

```bash
git prune-branches
```

### NPX

It's also possible to use package through `npx` without installing:

```bash
npx git-prune-branches
```

## Usage

```bash
git prune-branches
```

This command will automatically fetch and prune from your remote, then display an interactive selection of branches to delete organized into three groups:

1. **Safe to delete** (pre-selected) - Merged branches that were deleted from remote, or local merged branches that were never pushed
2. **Requires force delete** (not pre-selected) - Unmerged branches with commits that need `--force` to delete
3. **Info only** - Renamed branches that still exist on remote (shown for context, cannot be deleted)

After selecting branches, you'll see a preview of the exact git commands that will be executed before confirming the deletion.

<img width="1222" alt="Confirmation prompt" src="https://github.com/user-attachments/assets/0cf75cb7-af8d-43c6-81a1-3160ab7f48f3" />

### Custom remote

If you have configured remote alias to something different than **'origin'**, you can use `--remote` or `-r` flag to specify the name of the remote. For example, to specify remote to be `upstream`, you can use:

```bash
git prune-branches --remote upstream
```

## Version

To print the version:

```bash
git prune-branches --version
```

## Troubleshooting

If you encounter error `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` it is possible that your repository contains too many branches (more then 3382—see [discussion](https://github.com/nemisj/git-removed-branches/issues/11)).

You can fix this by specifying NODE_MAX_BUFFER environment variable. For example:

```bash
NODE_MAX_BUFFER=1048576 git prune-branches
```

## Development

### Running

Run the source code using `tsx`, e.g. to test it on another local repo

```sh
npx tsx ~/code/git-prune-branches/src/index.ts
```

### Testing

This project uses [Vitest](https://vitest.dev/) for testing. The tests create a temporary git repository and verify the behavior of the tool in different scenarios.

#### Run tests in watch mode

```bash
pnpm test # watch mode
pnpm test:once # run all tests once
```

#### Manual testing

You can also create a test git repo in a temporary folder and run the tool against it.

```sh
pnpm run test:manual
```

The test repo's branches are defined in `src/tests/manual/setup.ts`, but before editing, keep in mind that this file is also used by the automated tests.

### Building

Build the TypeScript source:

```bash
pnpm build
```

### Linting and Formatting

```bash
pnpm lint
pnpm format
```

## Credit

Forked from [git-removed-branches](https://github.com/nemisj/git-removed-branches) by [Maks Nemisj](https://github.com/nemisj) @nemisj
