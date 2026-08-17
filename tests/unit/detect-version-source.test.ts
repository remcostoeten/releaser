import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectVersionSource } from '../../src/config/detect-version-source.js'

const directories: string[] = []

async function writeProjectFile(root: string, path: string, contents: string): Promise<void> {
  const full = join(root, path)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, contents)
}

async function createProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'releaser-detect-source-'))
  directories.push(root)
  await Promise.all(
    Object.entries(files).map(([path, contents]) => writeProjectFile(root, path, contents)),
  )
  return root
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('detectVersionSource', () => {
  it('prefers package.json when present', async () => {
    const root = await createProject({ 'package.json': '{"name":"x"}', 'Cargo.toml': '' })
    expect(await detectVersionSource(root)).toEqual({ kind: 'npm' })
  })

  it('detects a Cargo package', async () => {
    const root = await createProject({ 'Cargo.toml': '[package]\nversion = "0.1.0"\n' })
    expect(await detectVersionSource(root)).toEqual({ kind: 'cargo', file: 'Cargo.toml' })
  })

  it('detects a PEP 621 python project', async () => {
    const root = await createProject({ 'pyproject.toml': '[project]\nversion = "0.1.0"\n' })
    expect(await detectVersionSource(root)).toEqual({
      kind: 'python',
      file: 'pyproject.toml',
      section: 'project',
    })
  })

  it('detects a poetry python project', async () => {
    const root = await createProject({ 'pyproject.toml': '[tool.poetry]\nversion = "0.1.0"\n' })
    expect(await detectVersionSource(root)).toEqual({
      kind: 'python',
      file: 'pyproject.toml',
      section: 'tool.poetry',
    })
  })

  it('detects a CMake project with a VERSION in project()', async () => {
    const root = await createProject({
      'CMakeLists.txt': 'project(Foo VERSION 1.2.3 LANGUAGES CXX)\n',
    })
    expect(await detectVersionSource(root)).toEqual({ kind: 'cmake', file: 'CMakeLists.txt' })
  })

  it('ignores a CMake project with no VERSION in project()', async () => {
    const root = await createProject({ 'CMakeLists.txt': 'project(Foo LANGUAGES CXX)\n' })
    expect(await detectVersionSource(root)).toEqual({ kind: 'none' })
  })

  it('detects a PKGBUILD in a packaging subdirectory', async () => {
    const root = await createProject({ 'packaging/pkgbuild/PKGBUILD': 'pkgver=0.0.5\n' })
    expect(await detectVersionSource(root)).toEqual({
      kind: 'pkgbuild',
      file: 'packaging/pkgbuild/PKGBUILD',
    })
  })

  it('reuses an existing VERSION file', async () => {
    const root = await createProject({ VERSION: '0.1.0\n' })
    expect(await detectVersionSource(root)).toEqual({
      kind: 'existing-version-file',
      file: 'VERSION',
    })
  })

  it('detects a Go module with no version field', async () => {
    const root = await createProject({ 'go.mod': 'module example.com/foo\n' })
    expect(await detectVersionSource(root)).toEqual({ kind: 'go-module' })
  })

  it('falls back to none when nothing is recognizable', async () => {
    const root = await createProject({ 'README.md': 'hello\n' })
    expect(await detectVersionSource(root)).toEqual({ kind: 'none' })
  })
})
