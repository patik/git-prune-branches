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

## Why?

Because I'm tired of doing every time `git fetch -p`, `git branch -r`, `git branch` and keep comparing which branches are gone from the GitHub, but still available locally and doing `git branch -D ${branch_name}` on each of them, one by one.

## What does it do?

This command will compare your local branches with remote and show you branches that are no longer available on remote but are still presented in your local repository. You can also use it to view and delete all (remotely) removed branches in one go using `--prune-all` flag.

<img width="449" alt="Prompt with list of branches, allowing arbitrary selection" src="https://github.com/user-attachments/assets/705d10ff-733e-449d-832a-94cef66e08c6" />

This command works without the need to run `git fetch -p`, but a working network connection to your remote is required. If no connection can be established with the remote repository, then local information about your remote will be used instead. If your local repository is not in sync with the remote repository, it will warn you about it.

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

This command will look through the branches that are no longer available on the remote and display them.
In case you haven't run `git fetch -p`, it will warn you to do so.

<img width="1222" alt="Confirmation prompt" src="https://github.com/user-attachments/assets/0cf75cb7-af8d-43c6-81a1-3160ab7f48f3" />

### Auto-removal

To delete all local branches without choosing which ones, and without confirmation, use `--prune-all` or `-p` flag

```bash
git prune-branches --prune-all
```

This command will compare your local branches to the remote ones and remove, those which do not exist anymore on the remote side.

### Custom remote

If you have configured remote alias to something different than **'origin'**, you can use `--remote` or `-r` flag to specify the name of the remote. e.g., to specify remote to be `upstream`, you can use:

```bash
git prune-branches --remote upstream
```

## Forcing removal

If you get an error when trying to delete branches:

```bash
The branch {branch_name} is not fully merged.
```

you can force deletion by using `--force` flag or the `-f` alias

```bash
git prune-branches --prune-all --force
```

## Retrying with `--force`

If any branches fail to delete when the `--force` flag is not used, `git-prune-branches` will offer to retry and delete them again using `--force`.

<img width="1178" alt="" src="https://github.com/user-attachments/assets/925783c3-c689-4279-b961-a094c63476b3" />

## Skipping confirmation

You can skip the confirmation prompts with `--yes` or the shortcut `-y`:

```bash
git prune-branches -y
```

## Version

To print the version:

```bash
git prune-branches --version
```

## Troubleshooting

If you encounter error `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` it is possible that your repository contains too many branches (more then 3382—see [discussion](https://github.com/patik/git-prune-branches/issues/11)).

You can fix this by specifying NODE_MAX_BUFFER environment variable. For example:

```bash
NODE_MAX_BUFFER=1048576 git prune-branches
```

## Development

### Testing

This project uses [Vitest](https://vitest.dev/) for testing. The tests create a temporary git repository and verify the behavior of the tool in different scenarios.

#### Run tests in watch mode

```bash
pnpm test
```

#### Run tests once

```bash
pnpm test:once
```

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
