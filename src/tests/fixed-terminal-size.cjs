// Keep interactive snapshots independent of the host terminal dimensions.
Object.defineProperty(process.stdout, 'columns', { value: 79 })
