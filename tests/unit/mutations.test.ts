import { describe, expect, it } from 'vitest'
import { applyEdits, editsApplyTo, mutatedPaths } from '../../src/domain/mutations.js'
import { renderTemplate } from '../../src/application/render-template.js'

const content = '{\n  "name": "example",\n  "version": "1.2.3"\n}\n'
const offset = content.indexOf('1.2.3')

describe('text edits', () => {
  it('applies an edit without disturbing the surrounding bytes', () => {
    const next = applyEdits(content, [
      { offset, deletedText: '1.2.3', insertedText: '1.3.0-beta.0' },
    ])

    expect(next).toBe('{\n  "name": "example",\n  "version": "1.3.0-beta.0"\n}\n')
  })

  it('applies multiple edits regardless of the order they were listed in', () => {
    const nameOffset = content.indexOf('example')
    const edits = [
      { offset, deletedText: '1.2.3', insertedText: '2.0.0' },
      { offset: nameOffset, deletedText: 'example', insertedText: 'renamed' },
    ]

    expect(applyEdits(content, edits)).toBe(applyEdits(content, edits.toReversed()))
    expect(applyEdits(content, edits)).toContain('"name": "renamed"')
    expect(applyEdits(content, edits)).toContain('"version": "2.0.0"')
  })

  it('detects when an edit no longer matches the file it was planned against', () => {
    const edit = [{ offset, deletedText: '1.2.3', insertedText: '1.2.4' }]

    expect(editsApplyTo(content, edit)).toBe(true)
    expect(editsApplyTo(content.replace('1.2.3', '9.9.9'), edit)).toBe(false)
  })
})

describe('mutatedPaths', () => {
  it('lists each touched path once, sorted', () => {
    const paths = mutatedPaths([
      {
        kind: 'manifest-version',
        path: 'package.json',
        previousVersion: '1.2.3',
        nextVersion: '1.2.4',
        edits: [],
      },
      {
        kind: 'lockfile-version',
        path: 'package-lock.json',
        previousVersion: '1.2.3',
        nextVersion: '1.2.4',
        edits: [],
      },
      {
        kind: 'configured-replacement',
        path: 'package.json',
        pattern: { kind: 'literal', value: '1.2.3' },
        expectedMatches: 1,
        edits: [],
      },
    ])

    expect(paths).toEqual(['package-lock.json', 'package.json'])
  })
})

describe('renderTemplate', () => {
  it('substitutes every supported placeholder', () => {
    const rendered = renderTemplate(
      'v{{version}} (was {{previousVersion}}) {{major}}.{{minor}}.{{patch}}',
      {
        version: '2.3.4',
        previousVersion: '2.3.3',
        major: '2',
        minor: '3',
        patch: '4',
      },
    )

    expect(rendered).toBe('v2.3.4 (was 2.3.3) 2.3.4')
  })

  it('leaves unknown placeholders untouched', () => {
    expect(
      renderTemplate('{{version}} {{unknown}}', {
        version: '1.0.0',
        previousVersion: '0.9.0',
        major: '1',
        minor: '0',
        patch: '0',
      }),
    ).toBe('1.0.0 {{unknown}}')
  })
})
