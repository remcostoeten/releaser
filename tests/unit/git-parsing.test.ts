import { describe, expect, it } from 'vitest'
import { formatRange, parseCommitRecords } from '../../src/git/git-history.js'
import { parsePorcelainStatus } from '../../src/git/git-status.js'
import { parseRemoteUrl } from '../../src/git/remote-url.js'
import { ref, tag } from '../helpers/semantic.js'

const UNIT = '\u001f'

function record(fields: string[]): string {
  return `${fields.join(UNIT)}\0`
}

describe('parsePorcelainStatus', () => {
  it('returns no entries for a clean tree', () => {
    expect(parsePorcelainStatus('')).toEqual([])
  })

  it('parses modified, staged and untracked entries', () => {
    const output = ' M src/a.ts\0M  src/b.ts\0?? src/c.ts\0'

    expect(parsePorcelainStatus(output)).toEqual([' M src/a.ts', 'M  src/b.ts', '?? src/c.ts'])
  })

  it('consumes the extra path a rename entry carries', () => {
    const output = 'R  new.ts\0old.ts\0?? other.ts\0'

    expect(parsePorcelainStatus(output)).toEqual(['R  old.ts -> new.ts', '?? other.ts'])
  })

  it('keeps paths containing spaces intact', () => {
    expect(parsePorcelainStatus(' M src/two words.ts\0')).toEqual([' M src/two words.ts'])
  })
})

describe('parseCommitRecords', () => {
  it('preserves a multi-paragraph body', () => {
    const output = record([
      'a'.repeat(40),
      'd'.repeat(40),
      'Ada',
      '2024-01-01T00:00:00+00:00',
      'feat: thing',
      'First paragraph.\n\nSecond paragraph.\n',
    ])

    expect(parseCommitRecords(output)).toEqual([
      {
        sha: 'a'.repeat(40),
        subject: 'feat: thing',
        body: 'First paragraph.\n\nSecond paragraph.',
        author: 'Ada',
        authoredAt: '2024-01-01T00:00:00+00:00',
        parents: ['d'.repeat(40)],
      },
    ])
  })

  it('reports a root commit as having no parents and a merge as having two', () => {
    const output =
      record(['a'.repeat(40), '', 'Ada', '2024-01-01T00:00:00+00:00', 'root', '']) +
      record([
        'b'.repeat(40),
        `${'a'.repeat(40)} ${'c'.repeat(40)}`,
        'Ada',
        '2024-01-01T00:00:00+00:00',
        'merge',
        '',
      ])

    expect(parseCommitRecords(output).map((commit) => commit.parents)).toEqual([
      [],
      ['a'.repeat(40), 'c'.repeat(40)],
    ])
  })

  it('ignores a truncated record', () => {
    expect(parseCommitRecords(record(['a'.repeat(40), '']))).toEqual([])
  })
})

describe('formatRange', () => {
  it('renders an open range as the endpoint alone', () => {
    expect(formatRange({ from: null, to: ref('HEAD') })).toBe('HEAD')
    expect(formatRange({ from: tag('v1.0.0'), to: ref('HEAD') })).toBe('v1.0.0..HEAD')
  })
})

describe('parseRemoteUrl', () => {
  it('parses every URL form Git returns', () => {
    const expected = { host: 'github.com', owner: 'remcostoeten', repo: 'releaser' }

    expect(parseRemoteUrl('https://github.com/remcostoeten/releaser.git')).toEqual(expected)
    expect(parseRemoteUrl('https://github.com/remcostoeten/releaser')).toEqual(expected)
    expect(parseRemoteUrl('git@github.com:remcostoeten/releaser.git')).toEqual(expected)
    expect(parseRemoteUrl('ssh://git@github.com/remcostoeten/releaser.git')).toEqual(expected)
    expect(parseRemoteUrl('git://github.com/remcostoeten/releaser.git')).toEqual(expected)
    expect(parseRemoteUrl('  https://github.com/remcostoeten/releaser.git  ')).toEqual(expected)
  })

  it('returns null for anything that is not a forge URL', () => {
    expect(parseRemoteUrl('')).toBeNull()
    expect(parseRemoteUrl('/tmp/origin.git')).toBeNull()
    expect(parseRemoteUrl('https://github.com/releaser')).toBeNull()
    expect(parseRemoteUrl('git@github.com:releaser')).toBeNull()
  })

  it('preserves GitHub Enterprise hosts', () => {
    expect(parseRemoteUrl('ssh://git@github.company.test/platform/releaser.git')).toEqual({
      host: 'github.company.test',
      owner: 'platform',
      repo: 'releaser',
    })
  })
})
