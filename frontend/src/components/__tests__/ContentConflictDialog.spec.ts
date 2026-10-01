import { flushPromises, mount } from '@vue/test-utils'
import { expect, test } from 'vitest'

import ContentConflictDialog from '../ContentConflictDialog.vue'

const baseProps = {
  open: true,
  resourceLabel: 'Challenge Đọc sách · ngày 2026-09-19',
  localText: 'Bản nháp của thiết bị này\nDòng thứ hai',
  serverText: 'Bản đã lưu trên máy chủ\nDòng thứ hai',
  serverVersion: 7,
  clientRevision: 3,
  busy: false,
  error: null,
}

test('shows both complete snapshots without a default choice and emits the acknowledged choice', async () => {
  const wrapper = mount(ContentConflictDialog, { props: baseProps })

  const dialog = wrapper.get('dialog')
  expect(dialog.attributes('open')).toBeDefined()
  expect(dialog.attributes('aria-labelledby')).toBe('content-conflict-title')
  expect(dialog.attributes('aria-describedby')).toBe('content-conflict-description')
  expect(dialog.text()).toContain(baseProps.resourceLabel)
  expect(dialog.text()).toContain(baseProps.localText)
  expect(dialog.text()).toContain(baseProps.serverText)
  expect(wrapper.findAll('input[type="radio"]:checked')).toHaveLength(0)
  expect(wrapper.get('label[for="conflict-local"]').text()).toContain('Giữ bản đang nhập')
  expect(wrapper.get('label[for="conflict-server"]').text()).toContain('Dùng bản đã lưu')

  await wrapper.get('#conflict-local').setValue()
  await wrapper.get('#content-conflict-confirm').trigger('click')

  expect(wrapper.emitted('confirm')).toEqual([[
    { choice: 'local', expectedServerVersion: 7, expectedClientRevision: 3 },
  ]])
})

test('requires a fresh choice when the server snapshot or local revision changes', async () => {
  const wrapper = mount(ContentConflictDialog, { props: baseProps })
  await wrapper.get('#conflict-server').setValue()
  expect((wrapper.get('#content-conflict-confirm').element as HTMLButtonElement).disabled).toBe(false)

  await wrapper.setProps({ serverVersion: 8, serverText: 'Bản máy chủ mới', clientRevision: 4 })
  await flushPromises()

  expect(wrapper.findAll('input[type="radio"]:checked')).toHaveLength(0)
  expect((wrapper.get('#content-conflict-confirm').element as HTMLButtonElement).disabled).toBe(true)
})

test('keeps close available while saving, disables confirmation, and reports close and Escape', async () => {
  const wrapper = mount(ContentConflictDialog, { props: { ...baseProps, busy: true } })

  expect((wrapper.get('#content-conflict-close').element as HTMLButtonElement).disabled).toBe(false)
  expect((wrapper.get('#content-conflict-confirm').element as HTMLButtonElement).disabled).toBe(true)
  await wrapper.get('#content-conflict-close').trigger('click')
  expect(wrapper.emitted('close')).toHaveLength(1)

  await wrapper.get('dialog').trigger('keydown', { key: 'Escape' })
  expect(wrapper.emitted('close')).toHaveLength(2)
})
