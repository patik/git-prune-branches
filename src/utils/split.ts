/**
 * Split the stdout output and will take out all the empty lines
 */
const split = (stdout: string): string[] => {
    return (
        (stdout || '')
            .split('\n')
            .map((line) => line.trim())
            // remove empty
            .filter((line) => line !== '')
    )
}

export default split
