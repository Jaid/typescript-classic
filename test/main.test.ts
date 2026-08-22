import {expect, test} from 'bun:test'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {restoreNodeGlobals} from '#root/scripts/restoreNodeGlobals.ts'

test('removes Bun build-time Node global literals', () => {
  expect(restoreNodeGlobals('var __filename="C:\\\\build\\\\input.js";console.log(__filename);')).toBe('console.log(__filename);')
  expect(restoreNodeGlobals('var __dirname="C:\\\\build",__filename="C:\\\\build\\\\input.js";run();')).toBe('run();')
  expect(restoreNodeGlobals('#!/usr/bin/env node\nvar __dirname="C:\\\\build";run();')).toBe('#!/usr/bin/env node\nrun();')
})

test('does not remove runtime Node global assignments', () => {
  const source = 'var __filename=getFilename();console.log(__filename);'
  expect(restoreNodeGlobals(source)).toBe(source)
})

test('Bun-minified Node globals remain relocatable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'typescript-classic-test-'))

  try {
    const sourcePath = join(directory, 'source', 'probe.js')
    const outputDirectory = join(directory, 'minified')
    const relocatedDirectory = join(directory, 'relocated')
    const relocatedPath = join(relocatedDirectory, 'probe.js')
    await mkdir(join(directory, 'source'), {recursive: true})
    await mkdir(relocatedDirectory, {recursive: true})
    await writeFile(sourcePath, 'console.log(JSON.stringify({filename:__filename,dirname:__dirname}))')

    const build = Bun.spawn([
      process.execPath,
      'build',
      '--no-bundle',
      '--minify',
      '--target=node',
      `--outdir=${outputDirectory}`,
      sourcePath,
    ], {stderr: 'pipe', stdout: 'pipe'})
    const buildExitCode = await build.exited
    expect(buildExitCode).toBe(0)

    const minifiedSource = await readFile(join(outputDirectory, 'probe.js'), 'utf8')
    await writeFile(relocatedPath, restoreNodeGlobals(minifiedSource))

    const node = Bun.spawn(['node', relocatedPath], {stderr: 'pipe', stdout: 'pipe'})
    const output = await new Response(node.stdout).text()
    expect(await node.exited).toBe(0)
    expect(JSON.parse(output)).toEqual({
      dirname: relocatedDirectory,
      filename: relocatedPath,
    })
  } finally {
    await rm(directory, {force: true, recursive: true})
  }
})