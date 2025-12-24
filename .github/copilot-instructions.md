# git-prune-branches

## Project description

This is a command line tool that helps clean up Git branches the user no longer needs. It compares local branches to the remote ones and removes those which do not exist anymore on the remote side. It features an interactive prompt to let the user choose which branches to delete. The spirit of the tool is to lean more towards nice UX rather than full automation.

The tool is written in TypeScript and uses the Inquirer.js library for the interactive prompts.

## General guidelines

- Never ask: "Would you like me to make this change for you?". Just do it. Keep going until you're finished.
- Use pnpm for package management and running scripts. Do not use npm or yarn.
- Use PascalCase for component names, interfaces, and type aliases
- Use camelCase for variables, functions, and methods
- Use ALL_CAPS for constants
- Prefer try/catch blocks for async operations instead of .then()/.catch()
- Write JSDoc comments for all functions, classes, and complex code blocks
- Write unit tests for all new functionality and bug fixes

## Dependencies

The owner of this repo (@patik) also maintains the following Node modules. While working on this repo, if you (the agent) discover a bug in one of these packages, or feel that a package could be improved in some way that would benefit this repo, please consider suggesting that the package be modified.

- inquirer-grouped-checkbox
- easy-stdout
