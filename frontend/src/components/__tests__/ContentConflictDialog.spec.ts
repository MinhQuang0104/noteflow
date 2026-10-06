import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, test } from 'vitest'

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

const attachedWrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  attachedWrappers.splice(0).forEach(wrapper => wrapper.unmount())
})

function mountAttached() {
  const wrapper = mount(ContentConflictDialog, { props: baseProps, attachTo: document.body })
  attachedWrappers.push(wrapper)
  return wrapper
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

test.each([{ serverVersion: 8 }, { clientRevision: 4 }])(
  'recovers focus from invalidated confirmation before Escape (%j)', async changed => {
    const wrapper = mountAttached()
    await flushPromises()
    await wrapper.get('#conflict-local').setValue()
    const confirm = wrapper.get('#content-conflict-confirm').element as HTMLButtonElement
    confirm.focus()
    expect(document.activeElement).toBe(confirm)

    await wrapper.setProps(changed)
    await flushPromises()

    expect(confirm.disabled).toBe(true)
    expect(wrapper.findAll('input:checked')).toHaveLength(0)
    expect(document.activeElement).toBe(wrapper.get('#content-conflict-close').element)
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  },
)

test.each(['#content-conflict-confirm', '#conflict-local'])(
  'keeps focus in the dialog when busy disables %s', async selector => {
    const wrapper = mountAttached()
    await flushPromises()
    await wrapper.get('#conflict-local').setValue()
    const control = wrapper.get(selector).element as HTMLElement
    control.focus()

    await wrapper.setProps({ busy: true })
    await flushPromises()

    expect(control.matches(':disabled')).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('#content-conflict-close').element)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  },
)

test('snapshot and error announcements do not steal focus from an enabled control', async () => {
  const wrapper = mountAttached()
  await flushPromises()
  const radio = wrapper.get('#conflict-server').element as HTMLElement
  radio.focus()

  await wrapper.setProps({ serverVersion: 8, error: 'Máy chủ đã thay đổi' })
  await flushPromises()

  expect(document.activeElement).toBe(radio)
  await wrapper.setProps({ busy: true })
  wrapper.get('button').element.focus()
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('button').element)
})

test('focus recovery does not consume IME Escape or restore focus into a closed dialog', async () => {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  const wrapper = mountAttached()
  try {
    await flushPromises()
    await wrapper.get('#conflict-local').setValue()
    ;(wrapper.get('#content-conflict-confirm').element as HTMLButtonElement).focus()
    await wrapper.setProps({ serverVersion: 8 })
    await flushPromises()
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }))
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.get('#conflict-local').setValue()
    ;(wrapper.get('#content-conflict-confirm').element as HTMLButtonElement).focus()
    await wrapper.setProps({ open: false, busy: true })
    await flushPromises()
    expect(wrapper.get('dialog').attributes('open')).toBeUndefined()
    expect(document.activeElement).toBe(trigger)
  } finally {
    trigger.remove()
  }
})
