#!/bin/bash

# Manual test runner for git-prune-branches
# Creates a test repo with various branch scenarios and runs the app in it

set -e

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "Setting up test repository..."

# Run setup and capture the working directory path
# Use inline TypeScript to call testSetup() and output just the path
WORKING_DIR=$(cd "$SCRIPT_DIR" && npx tsx -e "import { testSetup } from './setup.js'; console.log(testSetup())" 2>&1 | tail -1)

if [ -z "$WORKING_DIR" ] || [ ! -d "$WORKING_DIR" ]; then
    echo "Error: Failed to create test repository"
    echo "Got: $WORKING_DIR"
    exit 1
fi

echo ""
echo "Test repository created at: $WORKING_DIR"
echo "Running git-prune-branches..."
echo ""

# Change to the working directory and run the app
cd "$WORKING_DIR"
npx tsx "$REPO_DIR/src/index.ts"

echo ""
echo ""
echo "Done! Removed test directory: $WORKING_DIR"
rm -rf "$WORKING_DIR"
