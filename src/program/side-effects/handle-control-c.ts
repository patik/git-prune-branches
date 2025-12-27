process.on('uncaughtException', (error) => {
    if (error instanceof Error && error.name === 'ExitPromptError') {
        console.log('👋 No branches were deleted.')
    } else {
        // Rethrow unknown errors
        throw error
    }
})
