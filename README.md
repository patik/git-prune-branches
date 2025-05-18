List or remove local tracked branches, which are deleted from the remote.

It's a fork of [git-removed-branches](https://github.com/nemisj/git-removed-branches) with an interactive prompt

https://github.com/user-attachments/assets/e4502861-bd7d-47b7-aee7-e39154bc769c

Addresses questions, like:

- [Remove tracking branches no longer on remote](https://stackoverflow.com/questions/7726949/remove-tracking-branches-no-longer-on-remote)
- [How to prune local tracking branches that do not exist on remote anymore?](https://stackoverflow.com/questions/13064613/how-to-prune-local-tracking-branches-that-do-not-exist-on-remote-anymore/30494276#30494276)

![](https://github.com/patik/git-branch-cleanup/blob/master/usage.gif)

## Why?

Because I'm tired of doing every time `git fetch -p`, `git branch -r`, `git branch` and keep comparing which branches are gone from the GitHub, but still available locally and doing `git branch -D ${branch_name}` on each of them, one by one.

## What does it do?

This command will compare your local branches with remote and show you branches that are no longer available on remote but are still presented in your local repository. You can use it to view and delete all (remotely) removed branches in one go using `--prune-all` flag.

This command works without the need to run `git fetch -p`, but a working network connection to your remote is required. If no connection can be established with the remote repository, then local information about your remote will be used instead. If your local repository is not in sync with the remote repository, it will warn you about it.

## Installation

### NPM

```bash
npm install -g git-branch-cleanup
```

Please install a package globally with -g flag so that you can use it directly as a sub command of git, like this:

```bash
git branch-cleanup
```

### NPX

It's also possible to use package through `npx` without installing:

```bash
npx git-branch-cleanup
```

## Usage

```bash
git branch-cleanup
```

This command will look through the branches that are no longer available on the remote and display them.
In case you haven't run `git fetch -p`, it will warn you to do so.

<img width="609" alt="Prompt with list of branches, allowing arbitrary selection" src="https://github.com/user-attachments/assets/6a0530a7-c13c-42da-a983-ab365dd51f74" />

<img width="1192" alt="Confirmation prompt" src="https://github.com/user-attachments/assets/2c620b7f-6b79-4a9c-a0fe-ff0b55539f1d" />

### Auto-removal

To delete all local branches without choosing which ones, and without confirmation, use `--prune-all` or `-p` flag

```bash
git branch-cleanup --prune-all
```

This command will compare your local branches to the remote ones and remove, those which do not exist anymore on the remote side.

### Custom remote

If you have configured remote alias to something different than **'origin'**, you can use `--remote` or `-r` flag to specify the name of the remote. e.g., to specify remote to be `upstream`, you can use:

```bash
git branch-cleanup --remote upstream
```

## Forcing removal

If you get an error when trying to delete branches:

```bash
The branch {branch_name} is not fully merged.
```

you can force deletion by using `--force` flag or use `-f` alias

```bash
git branch-cleanup --prune-all --force
```

## Version

To print the version:

```bash
git branch-cleanup --version
```

## Troubleshooting:

If you encounter error `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` it is possible that your repository contains too many branches (more then 3382—see [discussion](https://github.com/patik/git-branch-cleanup/issues/11)).

You can fix this by specifying NODE_MAX_BUFFER environment variable. For example:

```bash
NODE_MAX_BUFFER=1048576 git branch-cleanup
```

## Credit

Forked from [git-removed-branches](https://github.com/nemisj/git-removed-branches) by [Maks Nemisj](https://github.com/nemisj) @nemisj
