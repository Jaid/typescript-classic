import {expect, test} from 'bun:test'

const {default: typescriptClassic} = await import('#src/main.ts')

test('should run', () => {
  const result = typescriptClassic()
  expect(result).toBe('typescript-classic') // TODO Test actual functionality
})
