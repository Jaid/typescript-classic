import {copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, relative} from 'node:path'

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

const findJavaScriptFiles = async (directory: string): Promise<string[]> => {
  const files: string[] = []
  const entries = await readdir(directory, {withFileTypes: true})

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...await findJavaScriptFiles(entryPath))
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath)
    }
  }

  return files
}

const compressJavaScript = async (directory: string, outputDirectory: string) => {
  const files = await findJavaScriptFiles(directory)
  if (!files.length) return

  const bun = Bun.spawn([
    process.execPath,
    'build',
    '--no-bundle',
    '--minify',
    '--target=node',
    `--root=${directory}`,
    `--outdir=${outputDirectory}`,
    ...files,
  ], {
    stderr: 'inherit',
    stdout: 'inherit',
  })

  const exitCode = await bun.exited
  if (exitCode) throw new Error(`bun build exited with code ${exitCode}`)

  for (const file of files) {
    const filePath = relative(directory, file)
    await copyFile(join(outputDirectory, filePath), file)
  }

  console.log(`Compressed ${files.length} JavaScript files with Bun`)
}

const rewritePackageJson = async (directory: string, version: string) => {
  const packageJsonPath = join(directory, 'package.json')
  const source = JSON.parse(await readFile(packageJsonPath, 'utf8')) as Record<string, unknown>
  const packageJson = {
    name: 'typescript-classic',
    version,
    description: source.description,
    keywords: source.keywords,
    license: source.license,
    repository: {
      type: 'git',
      url: 'git+https://github.com/jaid/typescript-classic.git',
    },
    main: source.main,
    typings: source.typings,
    bin: source.bin,
    engines: source.engines,
    browser: source.browser,
  }

  await writeFile(packageJsonPath, JSON.stringify(packageJson))
}

const minimizeJson = async (directory: string): Promise<number> => {
  let count = 0
  const entries = await readdir(directory, {withFileTypes: true})

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      count += await minimizeJson(entryPath)
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const source = await readFile(entryPath, 'utf8')
      await writeFile(entryPath, JSON.stringify(JSON.parse(source)))
      count++
    }
  }

  return count
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
const minifiedDirectory = join(tempDirectory, 'minified')
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

  await compressJavaScript(distDirectory, minifiedDirectory)
  await rewritePackageJson(distDirectory, version)
  const jsonFileCount = await minimizeJson(distDirectory)
  console.log(`Minimized ${jsonFileCount} JSON files`)
} finally {
  await rm(tempDirectory, {force: true, recursive: true})
}

console.log(`Unpacked TypeScript ${version} to ${distDirectory}`)
