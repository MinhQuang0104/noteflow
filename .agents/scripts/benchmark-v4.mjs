import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import * as v2 from './benchmark-v4-v2.mjs'

export const BUNDLE_SCHEMA_VERSION = v2.BUNDLE_SCHEMA_VERSION
export const CODES = v2.CODES
export const normalizeComparisonBundle = v2.normalizeComparisonBundle
export const compareBundles = v2.compareBundles
export const buildCandidateBundle = v2.buildCandidateBundle
export const writeCandidateBundle = v2.writeCandidateBundle

function readBundle(file) {
  return JSON.parse(readFileSync(path.resolve(file), 'utf8'))
}

function parseCli(argv) {
  const [verb, ...rest] = argv
  if (verb !== 'compare') throw new Error('USAGE: compare --baseline <json> --candidate <json> [--evidence-root <directory>]')
  const values = { baseline: null, candidate: null, evidenceRoot: null }
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index]
    const value = rest[index + 1]
    if (!value) throw new Error('USAGE: compare --baseline <json> --candidate <json> [--evidence-root <directory>]')
    if (flag === '--baseline') values.baseline = value
    else if (flag === '--candidate') values.candidate = value
    else if (flag === '--evidence-root') values.evidenceRoot = value
    else throw new Error('USAGE: compare --baseline <json> --candidate <json> [--evidence-root <directory>]')
  }
  if (!values.baseline || !values.candidate) throw new Error('USAGE: compare --baseline <json> --candidate <json> [--evidence-root <directory>]')
  return values
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseCli(process.argv.slice(2))
    const result = compareBundles(readBundle(args.baseline), readBundle(args.candidate), { evidenceRoot: args.evidenceRoot })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exitCode = CODES[result.status] ?? CODES.ERROR
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: 'ERROR', reasons: [error.message] })}\n`)
    process.exitCode = CODES.ERROR
  }
}
