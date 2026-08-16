export type JsonNode = {
  kind: 'object' | 'array' | 'string' | 'primitive'
  start: number
  end: number
  value?: string
  properties?: ReadonlyMap<string, JsonNode>
}

type Parser = {
  source: string
  index: number
}

function skipWhitespace(parser: Parser): void {
  while (/\s/u.test(parser.source[parser.index] ?? '')) {
    parser.index += 1
  }
}

function parseString(parser: Parser): JsonNode {
  const start = parser.index
  parser.index += 1

  while (parser.index < parser.source.length) {
    const character = parser.source[parser.index]
    if (character === '\\') {
      parser.index += 2
      continue
    }
    parser.index += 1
    if (character === '"') {
      const end = parser.index
      return {
        kind: 'string',
        start,
        end,
        value: JSON.parse(parser.source.slice(start, end)) as string,
      }
    }
  }

  throw new SyntaxError('Unterminated JSON string')
}

function expect(parser: Parser, character: string): void {
  if (parser.source[parser.index] !== character) {
    throw new SyntaxError(`Expected ${character} at offset ${parser.index}`)
  }
  parser.index += 1
}

function parseObject(parser: Parser): JsonNode {
  const start = parser.index
  const properties = new Map<string, JsonNode>()
  parser.index += 1
  skipWhitespace(parser)

  while (parser.source[parser.index] !== '}') {
    const key = parseString(parser)
    skipWhitespace(parser)
    expect(parser, ':')
    skipWhitespace(parser)
    properties.set(key.value ?? '', parseValue(parser))
    skipWhitespace(parser)
    if (parser.source[parser.index] !== ',') {
      break
    }
    parser.index += 1
    skipWhitespace(parser)
  }

  expect(parser, '}')
  return { kind: 'object', start, end: parser.index, properties }
}

function parseArray(parser: Parser): JsonNode {
  const start = parser.index
  parser.index += 1
  skipWhitespace(parser)

  while (parser.source[parser.index] !== ']') {
    parseValue(parser)
    skipWhitespace(parser)
    if (parser.source[parser.index] !== ',') {
      break
    }
    parser.index += 1
    skipWhitespace(parser)
  }

  expect(parser, ']')
  return { kind: 'array', start, end: parser.index }
}

function parsePrimitive(parser: Parser): JsonNode {
  const start = parser.index
  while (
    parser.index < parser.source.length &&
    !/[\s,}\]]/u.test(parser.source[parser.index] ?? '')
  ) {
    parser.index += 1
  }
  return { kind: 'primitive', start, end: parser.index }
}

function parseValue(parser: Parser): JsonNode {
  skipWhitespace(parser)
  const character = parser.source[parser.index]
  if (character === '{') {
    return parseObject(parser)
  }
  if (character === '[') {
    return parseArray(parser)
  }
  if (character === '"') {
    return parseString(parser)
  }
  return parsePrimitive(parser)
}

export function parseJsonLocations(source: string): JsonNode {
  const parser = { source, index: 0 }
  const root = parseValue(parser)
  skipWhitespace(parser)
  if (parser.index !== source.length) {
    throw new SyntaxError(`Unexpected JSON content at offset ${parser.index}`)
  }
  return root
}

export function propertyAtPath(root: JsonNode, path: readonly string[]): JsonNode | null {
  let current = root
  for (const segment of path) {
    if (current.kind !== 'object') {
      return null
    }
    const next = current.properties?.get(segment)
    if (next === undefined) {
      return null
    }
    current = next
  }
  return current
}

export function stringValueEdit(
  source: string,
  node: JsonNode,
  insertedText: string,
): { offset: number; deletedText: string; insertedText: string } {
  if (node.kind !== 'string') {
    throw new TypeError('Expected a JSON string value')
  }
  return {
    offset: node.start + 1,
    deletedText: source.slice(node.start + 1, node.end - 1),
    insertedText,
  }
}
