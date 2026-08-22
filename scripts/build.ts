import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

type RegistryVersion = {
  dist?: {
    tarball?: string
  }
}

type RegistryMetadata = {
  versions?: Record<string, RegistryVersion>
}

const compareVersions = (left: string, right: string) => {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)

  for (let index = 0; index < 3; index++) {
    const difference = leftParts[index]! - rightParts[index]!
    if (difference) return difference
  }

  return 0
}

const registryUrl = 'https://registry.npmjs.org/typescript'
const response = await fetch(registryUrl)
if (!response.ok) throw new Error(`Failed to fetch ${registryUrl}: ${response.status} ${response.statusText}`)

const metadata = await response.json() as RegistryMetadata
const versions = metadata.versions ?? {}
const version = Object.keys(versions)
  .filter(version => /^6\.\d+\.\d+$/.test(version))
  .sort(compareVersions)
  .at(-1)

if (!version) throw new Error('No stable TypeScript 6.x version found')

const tarballUrl = versions[version]?.dist?.tarball
if (!tarballUrl) throw new Error(`No tarball URL found for TypeScript ${version}`)

console.log(`Downloading TypeScript ${version} from ${tarballUrl}`)

const tarballResponse = await fetch(tarballUrl)
if (!tarballResponse.ok) throw new Error(`Failed to download ${tarballUrl}: ${tarballResponse.status} ${tarballResponse.statusText}`)

const tempDirectory = await mkdtemp(join(tmpdir(), 'typescript-classic-'))
const tarballPath = join(tempDirectory, `typescript-${version}.tgz`)
const distDirectory = join(import.meta.dir, '..', 'dist')

try {
  await writeFile(tarballPath, Buffer.from(await tarballResponse.arrayBuffer()))
  await rm(distDirectory, {force: true, recursive: true})
  await mkdir(distDirectory, {recursive: true})

  const tar = Bun.spawn([
    'tar',
    '-xzf', tarballPath,
    '-C', distDirectory,
    '--strip-components=1',
  ], {
    stderr: 'inherit',
    stdout: 'inherit',
  })

  const exitCode = await tar.exited
  if (exitCode) throw new Error(`tar exited with code ${exitCode}`)
} finally {
  await rm(tempDirectory, {force: true, recursive: true})
}

console.log(`Unpacked TypeScript ${version} to ${distDirectory}`)
