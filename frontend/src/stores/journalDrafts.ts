import { defineStore } from 'pinia'
import { ref } from 'vue'

import * as challengesApi from '../api/challenges'
import type { JournalMutationResult, JournalSnapshot, SaveJournalRequest } from '../api/challenges'
import { useAccountStore } from './account'
import { useAuthStore } from './auth'
import { useSyncStore } from './sync'

export type JournalDraftStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'blocked' | 'quarantined'

export type JournalDraftErrorKind =
  | 'preflight'
  | 'network'
  | 'validation'
  | 'conflict'
  | 'blocked'
  | 'unauthorized'
  | 'unexpected'
  | 'stale_context'

export interface PendingJournalCommand {
  readonly revision: number
  readonly ownerId: number
  readonly authGeneration: number
  readonly dataEpoch: number
  readonly request: Readonly<SaveJournalRequest>
}

export interface JournalDraftRecord {
  ownerId: number
  challengeId: string
  localDate: string
  authGeneration: number
  dataEpoch: number
  text: string
  clientRevision: number
  acknowledgedClientRevision: number
  acknowledgedText: string
  acknowledgedSnapshot: JournalSnapshot
  journalVersion: number
  pendingCommand: PendingJournalCommand | null
  conflictSnapshot: JournalSnapshot | null
  error: { kind: JournalDraftErrorKind; message: string } | null
  status: JournalDraftStatus
}

function resourceKey(ownerId: number, challengeId: string, localDate: string): string {
  return JSON.stringify([ownerId, challengeId, localDate])
}

function isDirtyRecord(record: JournalDraftRecord): boolean {
  return record.clientRevision !== record.acknowledgedClientRevision
}

function errorStatus(error: unknown): number | null {
  return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
    ? error.status
    : null
}

export const useJournalDraftsStore = defineStore('journalDrafts', () => {
  const auth = useAuthStore()
  const account = useAccountStore()
  const sync = useSyncStore()
  const drafts = ref<Record<string, JournalDraftRecord>>({})
  const inFlight = new Map<string, Promise<void>>()

  function getCurrentKey(challengeId: string, localDate: string): string | null {
    if (auth.status !== 'authenticated' || !auth.owner) return null
    return resourceKey(auth.owner.id, challengeId, localDate)
  }

  function getDraft(challengeId: string, localDate: string): JournalDraftRecord | undefined {
    const key = getCurrentKey(challengeId, localDate)
    return key ? drafts.value[key] : undefined
  }

  function hydrate(snapshot: JournalSnapshot): JournalDraftRecord | null {
    if (auth.status !== 'authenticated' || !auth.owner || account.status !== 'ready' || !account.context) {
      return null
    }

    const ownerId = auth.owner.id
    const key = resourceKey(ownerId, snapshot.challenge_id, snapshot.local_date)
    const existing = drafts.value[key]
    if (existing) {
      if (isDirtyRecord(existing) || existing.pendingCommand || existing.status === 'conflict' || existing.status === 'quarantined') {
        return existing
      }

      existing.text = snapshot.journal ?? ''
      existing.acknowledgedText = snapshot.journal ?? ''
      existing.acknowledgedSnapshot = snapshot
      existing.acknowledgedClientRevision = existing.clientRevision
      existing.journalVersion = snapshot.journal_version
      existing.dataEpoch = account.context.data_epoch
      existing.authGeneration = auth.generation
      existing.error = null
      existing.conflictSnapshot = null
      existing.status = 'saved'
      return existing
    }

    const text = snapshot.journal ?? ''
    const record: JournalDraftRecord = {
      ownerId,
      challengeId: snapshot.challenge_id,
      localDate: snapshot.local_date,
      authGeneration: auth.generation,
      dataEpoch: account.context.data_epoch,
      text,
      clientRevision: 0,
      acknowledgedClientRevision: 0,
      acknowledgedText: text,
      acknowledgedSnapshot: snapshot,
      journalVersion: snapshot.journal_version,
      pendingCommand: null,
      conflictSnapshot: null,
      error: null,
      status: 'saved',
    }
    drafts.value[key] = record
    return record
  }

  function setDraftText(challengeId: string, localDate: string, text: string): void {
    const key = getCurrentKey(challengeId, localDate)
    const record = key ? drafts.value[key] : undefined
    if (!record || record.text === text) return

    record.text = text
    record.clientRevision += 1

    if (record.status === 'saving' || record.pendingCommand || record.status === 'conflict' || record.status === 'quarantined') {
      return
    }

    record.error = null
    record.status = isDirtyRecord(record) ? 'dirty' : 'saved'
  }

  function isDirty(challengeId: string, localDate: string): boolean {
    const record = getDraft(challengeId, localDate)
    return record ? isDirtyRecord(record) : false
  }

  function useServerSnapshot(challengeId: string, localDate: string): void {
    const record = getDraft(challengeId, localDate)
    const snapshot = record?.conflictSnapshot
    if (
      !record ||
      !snapshot ||
      snapshot.challenge_id !== challengeId ||
      snapshot.local_date !== localDate ||
      auth.status !== 'authenticated' ||
      record.authGeneration !== auth.generation ||
      account.status !== 'ready' ||
      !account.context ||
      record.dataEpoch !== account.context.data_epoch
    ) return

    const text = snapshot.journal ?? ''
    record.text = text
    record.acknowledgedText = text
    record.acknowledgedSnapshot = snapshot
    record.acknowledgedClientRevision = record.clientRevision
    record.journalVersion = snapshot.journal_version
    record.dataEpoch = account.context?.data_epoch ?? record.dataEpoch
    record.authGeneration = auth.generation
    record.pendingCommand = null
    record.conflictSnapshot = null
    record.error = null
    record.status = 'saved'
  }

  function rebaseAfterEpochChange(challengeId: string, localDate: string, snapshot: JournalSnapshot): void {
    if (
      snapshot.challenge_id !== challengeId ||
      snapshot.local_date !== localDate ||
      auth.status !== 'authenticated' ||
      !auth.owner ||
      account.status !== 'ready' ||
      !account.context
    ) return
    const record = getDraft(challengeId, localDate) ?? hydrate(snapshot)
    if (!record) return

    const wasDirty = isDirtyRecord(record)
    record.acknowledgedText = snapshot.journal ?? ''
    record.acknowledgedSnapshot = snapshot
    record.journalVersion = snapshot.journal_version
    record.dataEpoch = account.context?.data_epoch ?? record.dataEpoch
    record.authGeneration = auth.generation
    record.pendingCommand = null
    record.conflictSnapshot = null
    record.error = null
    if (wasDirty) {
      record.status = 'dirty'
    } else {
      record.text = snapshot.journal ?? ''
      record.acknowledgedClientRevision = record.clientRevision
      record.status = 'saved'
    }
  }

  function quarantine(record: JournalDraftRecord, message: string): void {
    record.status = 'quarantined'
    record.error = { kind: 'stale_context', message }
  }

  function handleSaveError(record: JournalDraftRecord, error: unknown): void {
    const status = errorStatus(error)
    const apiError = error instanceof challengesApi.ChallengeApiError ? error : null
    const code = apiError?.problem?.code

    if (status === 409 && code === 'version_conflict') {
      record.pendingCommand = null
      record.conflictSnapshot = apiError?.problem?.current_snapshot as JournalSnapshot | undefined ?? null
      record.error = {
        kind: 'conflict',
        message: 'Nhật ký đã thay đổi trên máy chủ. Bản nháp hiện tại được giữ lại để xử lý.',
      }
      record.status = 'conflict'
      return
    }

    if (status === 409 && code === 'stale_data_epoch') {
      record.pendingCommand = null
      quarantine(record, 'Chu kỳ dữ liệu tài khoản đã thay đổi. Bản nháp được giữ lại và chưa thể gửi lại.')
      return
    }

    if (status === 422) {
      record.pendingCommand = null
      const message = apiError?.validation?.errors?.journal?.[0] ?? 'Dữ liệu nhật ký không hợp lệ.'
      record.error = { kind: 'validation', message }
      record.status = 'error'
      return
    }

    if (status === 423) {
      record.error = {
        kind: 'blocked',
        message: apiError?.message ?? 'Tài khoản đang tạm khóa ghi. Hãy đồng bộ rồi thử lại.',
      }
      record.status = 'blocked'
      return
    }

    if (status === 401 || status === 403) {
      record.error = { kind: 'unauthorized', message: 'Phiên làm việc không còn hợp lệ. Hãy đăng nhập lại.' }
      record.status = 'blocked'
      return
    }

    if (status !== null && status >= 400 && status < 500) {
      record.pendingCommand = null
      record.error = {
        kind: 'unexpected',
        message: apiError?.message ?? 'Không thể lưu nhật ký. Hãy kiểm tra nội dung rồi thử lại.',
      }
      record.status = 'error'
      return
    }

    // A transport/server failure can happen after the server committed. Preserve the exact command.
    record.error = { kind: 'network', message: 'Chưa xác định được kết quả lưu. Lần thử lại sẽ gửi lại đúng yêu cầu cũ.' }
    record.status = 'error'
  }

  async function performSave(
    key: string,
    record: JournalDraftRecord,
    ownerIdAtStart: number,
    authGenerationAtStart: number,
    revisionAtStart: number,
    textAtStart: string,
    journalVersionAtStart: number,
  ): Promise<void> {
    let preflight: { allowed: boolean; reason?: string }
    try {
      preflight = await sync.reconcileBeforeWrite()
    } catch {
      preflight = { allowed: false, reason: 'Không thể đồng bộ trạng thái mới nhất trước khi ghi.' }
    }

    if (drafts.value[key] !== record) return
    if (!preflight.allowed) {
      record.error = { kind: 'preflight', message: preflight.reason ?? 'Chưa thể lưu nhật ký. Hãy thử lại sau.' }
      record.status = 'blocked'
      return
    }

    if (
      auth.status !== 'authenticated' ||
      auth.generation !== authGenerationAtStart ||
      auth.owner?.id !== ownerIdAtStart
    ) {
      quarantine(record, 'Phiên hoặc chủ tài khoản đã thay đổi. Bản nháp chưa được gửi trong phiên mới.')
      return
    }

    if (account.status !== 'ready' || !account.context || account.context.write_state !== 'open') {
      record.error = { kind: 'preflight', message: 'Ngữ cảnh tài khoản chưa sẵn sàng để ghi.' }
      record.status = 'blocked'
      return
    }

    const currentEpoch = account.context.data_epoch
    if (record.dataEpoch !== currentEpoch) {
      quarantine(record, 'Chu kỳ dữ liệu tài khoản đã đổi. Bản nháp được giữ lại, không tự chuyển sang chu kỳ mới.')
      return
    }

    let pending = record.pendingCommand
    if (pending) {
      if (
        pending.ownerId !== ownerIdAtStart ||
        pending.authGeneration !== authGenerationAtStart ||
        pending.dataEpoch !== currentEpoch
      ) {
        quarantine(record, 'Yêu cầu đang chờ thuộc phiên hoặc chu kỳ dữ liệu cũ; không gửi lại tự động.')
        return
      }
    } else {
      const request: Readonly<SaveJournalRequest> = Object.freeze({
        command_id: challengesApi.generateCommandId(),
        data_epoch: currentEpoch,
        base_version: journalVersionAtStart,
        journal: textAtStart,
      })
      pending = Object.freeze({
        revision: revisionAtStart,
        ownerId: ownerIdAtStart,
        authGeneration: authGenerationAtStart,
        dataEpoch: currentEpoch,
        request,
      })
      record.pendingCommand = pending
    }

    let result: JournalMutationResult
    try {
      result = await challengesApi.saveChallengeJournal(record.challengeId, record.localDate, pending.request)
    } catch (error) {
      if (drafts.value[key] !== record) return
      if (
        auth.status !== 'authenticated' ||
        auth.generation !== pending.authGeneration ||
        auth.owner?.id !== pending.ownerId
      ) {
        quarantine(record, 'Phản hồi lỗi thuộc phiên cũ; yêu cầu chưa được gửi lại trong phiên mới.')
        return
      }
      if (!account.context || account.context.data_epoch !== pending.dataEpoch) {
        quarantine(record, 'Phản hồi lỗi thuộc chu kỳ dữ liệu cũ; bản nháp chưa được gửi lại.')
        return
      }
      handleSaveError(record, error)
      return
    }

    if (drafts.value[key] !== record) return
    if (
      auth.status !== 'authenticated' ||
      auth.generation !== pending.authGeneration ||
      auth.owner?.id !== pending.ownerId
    ) {
      quarantine(record, 'Phản hồi lưu thuộc phiên cũ; bản nháp chưa được đánh dấu là đã lưu.')
      return
    }

    if (
      result.data_epoch !== pending.dataEpoch ||
      !account.context ||
      account.context.data_epoch !== pending.dataEpoch
    ) {
      quarantine(record, 'Phản hồi lưu thuộc chu kỳ dữ liệu cũ; bản nháp chưa được đánh dấu là đã lưu.')
      return
    }

    if (result.journal.challenge_id !== record.challengeId || result.journal.local_date !== record.localDate) {
      quarantine(record, 'Phản hồi lưu không khớp với nhật ký đang gửi; bản nháp được giữ lại.')
      return
    }

    const ackAccepted = await sync.recordMutationAck(result.account_revision, result.data_epoch, pending.authGeneration)
    if (
      !ackAccepted ||
      drafts.value[key] !== record ||
      auth.status !== 'authenticated' ||
      auth.generation !== pending.authGeneration ||
      auth.owner?.id !== pending.ownerId ||
      !account.context ||
      account.context.data_epoch !== pending.dataEpoch
    ) {
      if (drafts.value[key] === record) {
        quarantine(record, 'Phản hồi lưu thuộc phiên hoặc chu kỳ dữ liệu đã đổi; bản nháp được giữ lại.')
      }
      return
    }

    const acknowledgedText = result.journal.journal ?? ''
    record.acknowledgedClientRevision = pending.revision
    record.acknowledgedText = acknowledgedText
    record.acknowledgedSnapshot = result.journal
    record.journalVersion = result.journal.journal_version
    record.pendingCommand = null
    record.conflictSnapshot = null
    record.error = null

    if (record.clientRevision === pending.revision) {
      record.text = acknowledgedText
      record.status = 'saved'
    } else {
      record.status = 'dirty'
    }
  }

  function save(challengeId: string, localDate: string): Promise<void> {
    const key = getCurrentKey(challengeId, localDate)
    const record = key ? drafts.value[key] : undefined
    if (!key || !record || (!isDirtyRecord(record) && !record.pendingCommand)) return Promise.resolve()
    if (record.status === 'conflict' || record.status === 'quarantined') return Promise.resolve()
    if (record.authGeneration !== auth.generation) {
      quarantine(record, 'Bản nháp thuộc phiên xác thực cũ. Hãy tải lại và đối chiếu dữ liệu trước khi tiếp tục.')
      return Promise.resolve()
    }

    const existing = inFlight.get(key)
    if (existing) return existing

    const ownerIdAtStart = record.ownerId
    const authGenerationAtStart = auth.generation
    const revisionAtStart = record.clientRevision
    const textAtStart = record.text
    const journalVersionAtStart = record.journalVersion
    record.status = 'saving'
    record.error = null

    const operation = performSave(
      key,
      record,
      ownerIdAtStart,
      authGenerationAtStart,
      revisionAtStart,
      textAtStart,
      journalVersionAtStart,
    ).finally(() => {
      if (inFlight.get(key) === operation) inFlight.delete(key)
      if (drafts.value[key] === record && record.status === 'saving') {
        record.status = isDirtyRecord(record) ? 'dirty' : 'saved'
      }
    })
    inFlight.set(key, operation)
    return operation
  }

  function reset(): void {
    drafts.value = {}
    inFlight.clear()
  }

  auth.registerPrivateStateReset(reset)

  return {
    drafts,
    getDraft,
    hydrate,
    setDraftText,
    isDirty,
    useServerSnapshot,
    rebaseAfterEpochChange,
    save,
    reset,
  }
})
