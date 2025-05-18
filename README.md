List or remove local tracked branches, which are deleted from the remote.

It's a fork of [git-branch-cleanup](https://github.com/nemisj/git-branch-cleanup) with an interactive prompt

https://github.com/user-attachments/assets/e4502861-bd7d-47b7-aee7-e39154bc769c

Addresses questions, like:

- [Remove tracking branches no longer on remote](https://stackoverflow.com/questions/7726949/remove-tracking-branches-no-longer-on-remote)
- [How to prune local tracking branches that do not exist on remote anymore?](https://stackoverflow.com/questions/13064613/how-to-prune-local-tracking-branches-that-do-not-exist-on-remote-anymore/30494276#30494276)

![](https://github.com/patik/git-branch-cleanup/blob/master/usage.gif)

## Why?

Because I'm tired of doing every time `git fetch -p`, `git branch -r`, `git branch` and keep comparing which branches are gone from the GitHub, but still available locally and doing `git branch -D ${branch_name}` on one by one of them.

## What does it do?

This command will compare your local branches with remote and show you branches that are no longer available on remote but are still presented in your local repository. You can use it to view and delete all (remotely) removed branches in one go using `--prune` flag.

This command works without the need to run `git fetch -p`, but a working network connection to your remote is required. If no connection can be established with the remote repository, then local information about your remote will be used instead. If your local repository is not in sync with the remote repository, it will warn you about it.

## Installation

### NPM

```bash
$ npm install -g git-branch-cleanup
```

Please install a package globally with -g flag so that you can use it directly as a sub command of git, like this:

```bash
$ git branch-cleanup
```

### NPX

It's also possible to use package through npx directly. Execute inside any git folder:

```bash
$ npx git-branch-cleanup
```

## Usage

```bash
$ git branch-cleanup
```

This command will look through the branches that are no longer available on the remote and display them.
In case you haven't run `git fetch -p`, it will warn you to do so.

This command is safe to run and it will not alter your repository.

### Removing

To delete local branches use `--prune` or `-p` flag

```bash
$ git branch-cleanup --prune
```

This command will compare your local branches to the remote ones and remove, those which do not exist anymore on the remote side.

### Different remote

If you have configured remote alias to something different than **'origin'**, you can use `--remote` or `-r` flag to specify the name of the remote. e.g., to specify remote to be `upstream`, you can use:

```bash
$ git branch-cleanup --remote upstream
```

## Forcing removal

If you get an error when trying to delete branches:

```bash
The branch {branch_name} is not fully merged.
```

you can force deletion by using `--force` flag or use `-f` alias

```bash
$ git branch-cleanup --prune --force
```

## Version

To find out, which version you use ( since 2.3.0 )

```
git branch-cleanup --version
```

## Troubleshooting:

If you encounter error `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` it is possible that your repository contains too much branches, more then 3382. ( see [discussion](https://github.com/patik/git-branch-cleanup/issues/11) )

You can fix this, by specifying NODE_MAX_BUFFER environment variable, like:

```
NODE_MAX_BUFFER=1048576 git branch-cleanup
```

## Credit

Forked from [git-branch-cleanup](https://github.com/nemisj/git-branch-cleanup) by [Maks Nemisj](https://github.com/nemisj) @nemisj
