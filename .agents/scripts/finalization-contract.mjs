import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const DIGEST = /^sha256:[0-9a-f]{64}$/
const SHA = /^[0-9a-f]{40,64}$/
const FINALIZATION_DISPOSITIONS = new Set(['SATISFIED', 'SATISFIED_WITH_DISCLOSURES'])

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  }
  return value
}

function digest(value) {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')
}

function safeRelative(relative) {
  return typeof relative === 'string' && relative.length > 0 && !relative.includes('\0') &&
    !relative.includes('\\') && !path.isAbsolute(relative) && !path.win32.isAbsolute(relative) &&
    !relative.split('/').some(part => !part || part === '.' || part === '..')
}

function text(value, fallback = '') {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim()
}

function fieldError(errors, condition, reason) {
  if (!condition) errors.push(reason)
}

export function stableFinalizationDigest(value) {
  return digest(value)
}

export function finalizationDisposition(helperDisposition) {
  if (helperDisposition === 'READY') return 'SATISFIED'
  if (helperDisposition === 'READY_WITH_DISCLOSURES') return 'SATISFIED_WITH_DISCLOSURES'
  return null
}

export function validateFinalizationReceipt(root, plan, receiptPath, suppliedReceipt = undefined) {
  const errors = []
  let receipt = suppliedReceipt
  if (!safeRelative(receiptPath)) errors.push('INVALID_FINALIZATION_RECEIPT_PATH')
  if (receipt === undefined) {
    const file = safeRelative(receiptPath) ? path.resolve(root, receiptPath) : null
    if (!file || !existsSync(file)) return { receipt: null, errors: [...errors, 'FINALIZATION_RECEIPT_MISSING'] }
    try {
      receipt = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      return { receipt: null, errors: [...errors, 'INVALID_FINALIZATION_RECEIPT_FILE'] }
    }
  }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return { receipt: null, errors: [...errors, 'INVALID_FINALIZATION_RECEIPT_FILE'] }
  }
  fieldError(errors, receipt.schema_version === 1, 'INVALID_FINALIZATION_SCHEMA_VERSION')
  fieldError(errors, receipt.kind === 'story_finalization', 'INVALID_FINALIZATION_KIND')
  fieldError(errors, receipt.story_id === plan?.story_id, 'FINALIZATION_STORY_ID_MISMATCH')
  fieldError(errors, receipt.story_normative_digest === plan?.story?.normative_digest, 'FINALIZATION_STORY_DIGEST_MISMATCH')
  fieldError(errors, receipt.upstream_epic_digest === plan?.upstream_epic?.section_digest, 'FINALIZATION_UPSTREAM_DIGEST_MISMATCH')
  fieldError(errors, SHA.test(receipt.prepared_from_head ?? ''), 'INVALID_FINALIZATION_PREPARED_HEAD')
  for (const key of [
    'slice_set_digest',
    'receipt_set_digest',
    'ac_coverage_digest',
    'canonical_disclosures_digest',
    'scope_paths_digest',
    'implementation_commit_set_digest',
    'final_scoped_tree_digest'
  ]) fieldError(errors, DIGEST.test(receipt[key] ?? ''), 'INVALID_FINALIZATION_' + key.toUpperCase())
  for (const [alias, canonical] of [
    ['paths_digest', 'scope_paths_digest'],
    ['commit_set_digest', 'implementation_commit_set_digest'],
    ['scoped_tree_digest', 'final_scoped_tree_digest']
  ]) {
    if (receipt[alias] !== undefined) fieldError(errors, receipt[alias] === receipt[canonical], 'FINALIZATION_' + alias.toUpperCase() + '_MISMATCH')
  }
  fieldError(errors, FINALIZATION_DISPOSITIONS.has(receipt.done_gate_disposition), 'INVALID_FINALIZATION_DISPOSITION')
  fieldError(errors, receipt.lifecycle_from === 'in-progress', 'INVALID_FINALIZATION_LIFECYCLE_FROM')
  fieldError(errors, receipt.lifecycle_target === 'review', 'INVALID_FINALIZATION_LIFECYCLE_TARGET')
  fieldError(errors, Number.isInteger(receipt.scope_path_count) && receipt.scope_path_count >= 0, 'INVALID_FINALIZATION_SCOPE_COUNT')
  if (Object.hasOwn(receipt, 'human_approval')) errors.push('HUMAN_APPROVAL_FORBIDDEN')

  const finalization = plan?.finalization
  if (finalization && typeof finalization === 'object') {
    fieldError(errors, finalization.receipt_ref === receiptPath, 'FINALIZATION_RECEIPT_REF_MISMATCH')
    fieldError(errors, finalization.receipt_digest === digest(receipt), 'FINALIZATION_RECEIPT_DIGEST_MISMATCH')
    for (const key of ['scope_paths_digest', 'implementation_commit_set_digest', 'final_scoped_tree_digest']) {
      fieldError(errors, finalization[key] === receipt[key], 'FINALIZATION_PLAN_' + key.toUpperCase() + '_MISMATCH')
    }
    fieldError(errors, finalization.prepared_from_head === receipt.prepared_from_head, 'FINALIZATION_PLAN_HEAD_MISMATCH')
    fieldError(errors, finalization.done_gate_disposition === receipt.done_gate_disposition, 'FINALIZATION_PLAN_DISPOSITION_MISMATCH')
  }
  return { receipt, errors: [...new Set(errors)] }
}

function evidenceLine(item) {
  const mode = item?.mode === 'fallback' ? 'fallback' : 'structured'
  const summary = text(item?.summary, 'representative receipt evidence')
  return mode + ': ' + summary.slice(0, 220)
}

function receiptRefs(items) {
  const seen = new Set()
  return items.filter(item => item?.receipt_ref && item?.receipt_digest).map(item => {
    const key = item.receipt_ref + '|' + item.receipt_digest
    if (seen.has(key)) return null
    seen.add(key)
    return item.receipt_ref + ' (' + item.receipt_digest + ')'
  }).filter(Boolean)
}

function disclosureFor(acCoverage, helper) {
  const relevant = new Set(acCoverage?.contributor_slices ?? [])
  return (helper.canonical_disclosures ?? []).filter(item => relevant.has(item.slice_id))
}

export function renderCompletionBlock(preview, story) {
  const helper = preview.helper ?? preview
  const receipt = preview.receipt ?? {}
  const coverage = helper.ac_coverage ?? []
  const lines = [
    '### Dev Agent Record',
    '',
    '- Finalization receipt: ' + (preview.finalizationPath ?? 'finalization.json'),
    '- Done Gate disposition: ' + (receipt.done_gate_disposition ?? finalizationDisposition(helper.done_gate_disposition) ?? 'UNSATISFIED'),
    '',
    '### AC Evidence / Results',
    ''
  ]
  for (const ac of story.ac ?? []) {
    const item = coverage.find(entry => entry.id === ac.id)
    const evidence = item?.evidence ?? []
    const modes = [...new Set(evidence.map(entry => entry.mode === 'fallback' ? 'fallback' : 'structured'))]
    const representative = evidence.find(entry => entry.mode === 'structured') ?? evidence[0]
    lines.push('- ' + ac.id + ': evidence=' + (item?.covered ? 'COVERED' : 'MISSING') +
      '; mode=' + (modes.join(', ') || 'none') + '; ' + evidenceLine(representative))
    const refs = receiptRefs(evidence)
    if (refs.length) lines.push('  Receipts: ' + refs.join('; '))
    const disclosures = disclosureFor(item, helper)
    if (disclosures.length) {
      const summary = disclosures.map(disclosure =>
        disclosure.applicability + '/' + disclosure.status +
        '; complete=' + disclosure.complete +
        '; disclosure=' + (disclosure.done_gate_disclosure_required ? 'required' : 'not-required')
      ).join('; ')
      lines.push('  Canonical disposition: ' + summary)
    } else {
      lines.push('  Canonical disposition: none recorded for contributing slices')
    }
  }
  lines.push('', '### Completion Notes', '')
  for (const ac of story.ac ?? []) lines.push('- Evidenced behavior: ' + text(ac.text).slice(0, 240))
  lines.push('', '### File List', '')
  const scopePaths = preview.scope?.paths ?? helper.scope?.paths ?? []
  for (const item of scopePaths) lines.push('- ' + (typeof item === 'string' ? item : item.path))
  lines.push('', '### Change Log', '', '- Finalization recorded for Human Gate: in-progress -> review; next action complete_story.')
  return lines.join('\n')
}
