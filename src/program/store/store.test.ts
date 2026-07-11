import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROTECTED_BRANCHES, DEFAULT_REMOTE } from '../constants.js'
import store, { configureStore } from './store.js'

describe('configureStore', () => {
    afterEach(() => {
        configureStore({ remote: DEFAULT_REMOTE, protected: DEFAULT_PROTECTED_BRANCHES })
    })

    it('should apply CLI configuration and invalidate cached preprocessing', () => {
        store.hasRunPreprocess = true

        configureStore({ remote: 'upstream', protected: 'main, release ' })

        expect(store.remote).toBe('upstream')
        expect(store.protectedBranches).toEqual(new Set(['main', 'release']))
        expect(store.hasRunPreprocess).toBe(false)
    })
})
