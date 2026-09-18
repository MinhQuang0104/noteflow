import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { parse } from 'yaml'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const contractPath = fileURLToPath(new URL('../../contracts/openapi.yaml', import.meta.url))
const outputPath = fileURLToPath(new URL('../src/api/schema.generated.ts', import.meta.url))

function quote(value) {
  return JSON.stringify(value)
}

function schemaType(schema) {
  if (schema.$ref) {
    const name = schema.$ref.split('/').at(-1)
    return `components['schemas'][${quote(name)}]`
  }

  if (schema.enum) {
    return schema.enum.map(quote).join(' | ')
  }

  if (schema.type === 'array') {
    return `Array<${schemaType(schema.items)}>`
  }

  if (schema.type === 'object') {
    return objectType(schema)
  }

  return {
    boolean: 'boolean',
    integer: 'number',
    number: 'number',
    string: 'string',
  }[schema.type] ?? 'unknown'
}

function objectType(schema, indent = '      ') {
  const required = new Set(schema.required ?? [])
  const properties = Object.entries(schema.properties ?? {})

  if (properties.length === 0) return 'Record<string, never>'

  const lines = properties.map(([name, property]) => {
    const optional = required.has(name) ? '' : '?'
    return `${indent}${quote(name)}${optional}: ${schemaType(property)}`
  })

  return `{\n${lines.join('\n')}\n${indent.slice(0, -2)}}`
}

function generateComponents(document) {
  const schemas = Object.entries(document.components?.schemas ?? {})
  const entries = schemas.map(([name, schema]) => {
    return `    ${quote(name)}: ${schemaType(schema)}`
  })

  return [
    'export interface components {',
    '  schemas: {',
    ...entries,
    '  }',
    '}',
  ].join('\n')
}

function generateOperations(document) {
  const operations = []

  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(pathItem)) {
      if (!operation?.operationId) continue

      const responseLines = Object.entries(operation.responses ?? {}).map(([status, response]) => {
        const contents = Object.entries(response.content ?? {}).map(([mediaType, media]) => {
          return `          ${quote(mediaType)}: ${schemaType(media.schema)}`
        })

        return [
          `      ${quote(status)}: {`,
          '        content: {',
          ...contents,
          '        }',
          '      }',
        ].join('\n')
      })

      operations.push([
        `  ${quote(operation.operationId)}: {`,
        '    responses: {',
        ...responseLines,
        '    }',
        '  }',
      ].join('\n'))
    }
  }

  return ['export interface operations {', ...operations, '}'].join('\n')
}

async function generatedSource() {
  const document = parse(await readFile(contractPath, 'utf8'))

  return [
    '// Generated from contracts/openapi.yaml. Do not edit directly.',
    '',
    generateComponents(document),
    '',
    generateOperations(document),
    '',
  ].join('\n')
}

const expected = await generatedSource()

if (process.argv.includes('--check')) {
  let current = ''

  try {
    current = await readFile(outputPath, 'utf8')
  } catch {
    // A missing generated file is contract drift.
  }

  if (current !== expected) {
    console.error('Generated API types are stale. Run: npm run contract:generate')
    process.exitCode = 1
  }
} else {
  await writeFile(outputPath, expected, 'utf8')
  console.log(`Generated ${outputPath.replace(`${projectRoot}\\`, '')}`)
}
