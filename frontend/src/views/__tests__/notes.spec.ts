import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import * as notebooksApi from '../../api/notebooks'
import { NotebookApiError, type Notebook } from '../../api/notebooks'
import { useAccountStore } from '../../stores/account'
import { useAuthStore } from '../../stores/auth'
import NotesView from '../NotesView.vue'

let queryClient: QueryClient

const defaultNotebook: Notebook = {
  id: 'nb-default-1',
  name: 'Ghi chú nhanh',
  is_default: true,
  row_version: 1,
  note_count: 0,
  created_at: '2026-11-01T08:00:00Z',
  updated_at: '2026-11-01T08:00:00Z',
}

const regularNotebook: Notebook = {
  id: 'nb-reg-2',
  name: 'Dự án Alpha',
  is_default: false,
  row_version: 1,
  note_count: 0,
  created_at: '2026-11-02T08:00:00Z',
  updated_at: '2026-11-02T08:00:00Z',
}

beforeEach(() => {
  setActivePinia(createPinia())
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  vi.restoreAllMocks()

  const auth = useAuthStore()
  auth.status = 'authenticated'
  auth.generation = 1

  const account = useAccountStore()
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: '2026-11-14',
    week: { start_date: '2026-11-09', end_date: '2026-11-15' },
    account_revision: 1,
    data_epoch: 1,
    write_state: 'open',
  }
  account.status = 'ready'
})

afterEach(() => {
  document.body.innerHTML = ''
})

test('the default notebook renders first with the "Mặc định" label from is_default', async () => {
  const renamedDefault: Notebook = {
    id: 'nb-renamed-default',
    name: 'Vở Cá Nhân Đổi Tên',
    is_default: true,
    row_version: 2,
    note_count: 0,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-05T00:00:00Z',
  }
  const regularZ: Notebook = {
    id: 'nb-regular-z',
    name: 'A-First Alphabetical Regular',
    is_default: false,
    row_version: 1,
    note_count: 0,
    created_at: '2026-11-02T00:00:00Z',
    updated_at: '2026-11-02T00:00:00Z',
  }

  // Even if backend payload had regular notebook first
  vi.spyOn(notebooksApi, 'getNotebooks').mockResolvedValue({
    notebooks: [renamedDefault, regularZ],
  })

  const wrapper = mount(NotesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  })
  await flushPromises()

  const rows = wrapper.findAll('[data-testid="notebook-list"] > li')
  expect(rows.length).toBe(2)

  // Default notebook is first
  expect(rows[0]?.text()).toContain('Vở Cá Nhân Đổi Tên')
  const defaultBadge = rows[0]?.find('[data-testid="default-badge"]')
  expect(defaultBadge?.exists()).toBe(true)
  expect(defaultBadge?.text()).toBe('Mặc định')

  // Regular notebook is second and does NOT have default badge
  expect(rows[1]?.text()).toContain('A-First Alphabetical Regular')
  expect(rows[1]?.find('[data-testid="default-badge"]').exists()).toBe(false)
})

test('the list has one level', async () => {
  vi.spyOn(notebooksApi, 'getNotebooks').mockResolvedValue({
    notebooks: [defaultNotebook, regularNotebook],
  })

  const wrapper = mount(NotesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  })
  await flushPromises()

  // Exactly one list element, no nested ul or ol
  const rootList = wrapper.find('[data-testid="notebook-list"]')
  expect(rootList.exists()).toBe(true)
  expect(rootList.findAll('ul').length).toBe(0)
  expect(rootList.findAll('ol').length).toBe(0)

  // Children are direct li items
  const items = rootList.findAll(':scope > li')
  expect(items.length).toBe(2)
})

test('create and rename send one command each and show the new name only after the acknowledgement', async () => {
  vi.spyOn(notebooksApi, 'getNotebooks').mockResolvedValue({
    notebooks: [defaultNotebook],
  })

  let resolveCreate!: (res: notebooksApi.NotebookMutationResult) => void
  const createPromise = new Promise<notebooksApi.NotebookMutationResult>((resolve) => {
    resolveCreate = resolve
  })
  const createSpy = vi.spyOn(notebooksApi, 'createNotebook').mockReturnValue(createPromise)

  const wrapper = mount(NotesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  })
  await flushPromises()

  // 1. CREATE FLOW
  await wrapper.get('[data-testid="create-notebook-button"]').trigger('click')
  const createInput = wrapper.get('[data-testid="create-notebook-name-input"]')
  await createInput.setValue('Vở Dự Án Mới')

  // Submit create
  await wrapper.get('[data-testid="create-notebook-form"]').trigger('submit')

  // In-flight: new name not yet rendered in list
  expect(wrapper.get('[data-testid="notebook-list"]').text()).not.toContain('Vở Dự Án Mới')
  expect(createSpy).toHaveBeenCalledTimes(1)
  expect(createSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Vở Dự Án Mới',
      data_epoch: 1,
    }),
  )

  // Repeat submit while in flight does not send a duplicate command
  await wrapper.get('[data-testid="create-notebook-form"]').trigger('submit')
  expect(createSpy).toHaveBeenCalledTimes(1)

  // Resolve acknowledgement
  const createdNotebook: Notebook = {
    id: 'nb-created-99',
    name: 'Vở Dự Án Mới',
    is_default: false,
    row_version: 1,
    note_count: 0,
    created_at: '2026-11-14T08:30:00Z',
    updated_at: '2026-11-14T08:30:00Z',
  }
  resolveCreate({
    notebook: createdNotebook,
    account_revision: 2,
    data_epoch: 1,
  })
  await flushPromises()

  // Now the new name appears in the list
  expect(wrapper.get('[data-testid="notebook-list"]').text()).toContain('Vở Dự Án Mới')
  expect(wrapper.find('[data-testid="create-notebook-form"]').exists()).toBe(false)

  // 2. RENAME FLOW
  let resolveRename!: (res: notebooksApi.NotebookMutationResult) => void
  const renamePromise = new Promise<notebooksApi.NotebookMutationResult>((resolve) => {
    resolveRename = resolve
  })
  const renameSpy = vi.spyOn(notebooksApi, 'renameNotebook').mockReturnValue(renamePromise)

  await wrapper.get(`[data-testid="rename-notebook-button-${createdNotebook.id}"]`).trigger('click')
  const renameInput = wrapper.get(`[data-testid="rename-notebook-name-input-${createdNotebook.id}"]`)
  await renameInput.setValue('Vở Dự Án Đổi Tên')

  // Submit rename
  await wrapper.get(`[data-testid="rename-notebook-form-${createdNotebook.id}"]`).trigger('submit')

  // In-flight: list still shows original name, not new name
  expect(wrapper.get(`[data-testid="notebook-name-${createdNotebook.id}"]`).text()).toBe('Vở Dự Án Mới')
  expect(renameSpy).toHaveBeenCalledTimes(1)
  expect(renameSpy).toHaveBeenCalledWith(
    createdNotebook.id,
    expect.objectContaining({
      name: 'Vở Dự Án Đổi Tên',
      base_version: 1,
      data_epoch: 1,
    }),
  )

  // Repeat submit while in flight does not send a duplicate command
  await wrapper.get(`[data-testid="rename-notebook-form-${createdNotebook.id}"]`).trigger('submit')
  expect(renameSpy).toHaveBeenCalledTimes(1)

  // Resolve acknowledgement
  resolveRename({
    notebook: { ...createdNotebook, name: 'Vở Dự Án Đổi Tên', row_version: 2 },
    account_revision: 3,
    data_epoch: 1,
  })
  await flushPromises()

  // Now updated name appears in the list
  expect(wrapper.get(`[data-testid="notebook-name-${createdNotebook.id}"]`).text()).toBe('Vở Dự Án Đổi Tên')
  expect(wrapper.find(`[data-testid="rename-notebook-form-${createdNotebook.id}"]`).exists()).toBe(false)
})

test('a field error keeps the typed name', async () => {
  vi.spyOn(notebooksApi, 'getNotebooks').mockResolvedValue({
    notebooks: [defaultNotebook, regularNotebook],
  })

  const wrapper = mount(NotesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  })
  await flushPromises()

  // 1. Create field error retains typed input
  await wrapper.get('[data-testid="create-notebook-button"]').trigger('click')
  const createInput = wrapper.get<HTMLInputElement>('[data-testid="create-notebook-name-input"]')
  await createInput.setValue('   ')
  await wrapper.get('[data-testid="create-notebook-form"]').trigger('submit')

  expect(wrapper.get('[data-testid="create-notebook-error"]').text()).toContain('Tên cuốn vở không được để trống')
  expect(createInput.element.value).toBe('   ')

  // Over-length name
  const longName = 'A'.repeat(256)
  await createInput.setValue(longName)
  await wrapper.get('[data-testid="create-notebook-form"]').trigger('submit')
  expect(wrapper.get('[data-testid="create-notebook-error"]').text()).toContain('không được vượt quá 255 ký tự')
  expect(createInput.element.value).toBe(longName)

  // Server 422 validation error
  vi.spyOn(notebooksApi, 'createNotebook').mockRejectedValue(
    new NotebookApiError('Validation error', 422, undefined, {
      message: 'Validation error',
      errors: { name: ['Tên cuốn vở đã được sử dụng.'] },
    }),
  )
  await createInput.setValue('Tên Trùng Lặp')
  await wrapper.get('[data-testid="create-notebook-form"]').trigger('submit')
  await flushPromises()

  expect(wrapper.get('[data-testid="create-notebook-error"]').text()).toContain('Tên cuốn vở đã được sử dụng.')
  expect(createInput.element.value).toBe('Tên Trùng Lặp')

  // 2. Rename field error retains typed input
  await wrapper.get(`[data-testid="rename-notebook-button-${regularNotebook.id}"]`).trigger('click')
  const renameInput = wrapper.get<HTMLInputElement>(`[data-testid="rename-notebook-name-input-${regularNotebook.id}"]`)
  await renameInput.setValue('   ')
  await wrapper.get(`[data-testid="rename-notebook-form-${regularNotebook.id}"]`).trigger('submit')

  expect(wrapper.get(`[data-testid="rename-notebook-error-${regularNotebook.id}"]`).text()).toContain('Tên cuốn vở không được để trống')
  expect(renameInput.element.value).toBe('   ')
})

test('delete of the default or a non-empty notebook explains the reason without sending a request', async () => {
  const nonEmptyNotebook: Notebook = {
    id: 'nb-non-empty',
    name: 'Vở Có Ghi Chú',
    is_default: false,
    row_version: 1,
    note_count: 5,
    created_at: '2026-11-03T00:00:00Z',
    updated_at: '2026-11-03T00:00:00Z',
  }

  vi.spyOn(notebooksApi, 'getNotebooks').mockResolvedValue({
    notebooks: [defaultNotebook, nonEmptyNotebook],
  })
  const deleteSpy = vi.spyOn(notebooksApi, 'deleteNotebook')

  const wrapper = mount(NotesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  })
  await flushPromises()

  // 1. Attempt delete of default notebook
  await wrapper.get(`[data-testid="delete-notebook-button-${defaultNotebook.id}"]`).trigger('click')
  const defaultError = wrapper.get(`[data-testid="delete-error-${defaultNotebook.id}"]`)
  expect(defaultError.text()).toContain('Không thể xóa cuốn vở mặc định.')
  expect(deleteSpy).toHaveBeenCalledTimes(0)
  expect(wrapper.find('dialog[open]').exists()).toBe(false)

  // 2. Attempt delete of non-empty notebook
  await wrapper.get(`[data-testid="delete-notebook-button-${nonEmptyNotebook.id}"]`).trigger('click')
  const nonEmptyError = wrapper.get(`[data-testid="delete-error-${nonEmptyNotebook.id}"]`)
  expect(nonEmptyError.text()).toContain('Không thể xóa cuốn vở còn chứa ghi chú.')
  expect(deleteSpy).toHaveBeenCalledTimes(0)
  expect(wrapper.find('dialog[open]').exists()).toBe(false)
})

test('a server notebook_is_default or notebook_not_empty rejection is shown at the action', async () => {
  vi.spyOn(notebooksApi, 'getNotebooks').mockResolvedValue({
    notebooks: [defaultNotebook, regularNotebook],
  })

  // Mock server returning notebook_not_empty rejection
  vi.spyOn(notebooksApi, 'deleteNotebook').mockRejectedValueOnce(
    new NotebookApiError('Cuốn vở vẫn còn ghi chú trên máy chủ.', 409, {
      code: 'notebook_not_empty',
      message: 'Cuốn vở vẫn còn ghi chú trên máy chủ.',
    }),
  )

  const wrapper = mount(NotesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  })
  await flushPromises()

  // Trigger delete on regular notebook and confirm
  await wrapper.get(`[data-testid="delete-notebook-button-${regularNotebook.id}"]`).trigger('click')
  await wrapper.get('[data-testid="confirm-dialog-confirm"]').trigger('click')
  await flushPromises()

  // Server error is shown at the action
  const errorEl = wrapper.get(`[data-testid="delete-error-${regularNotebook.id}"]`)
  expect(errorEl.text()).toContain('Cuốn vở vẫn còn ghi chú trên máy chủ.')

  // Mock server returning notebook_is_default rejection
  vi.spyOn(notebooksApi, 'deleteNotebook').mockRejectedValueOnce(
    new NotebookApiError('Cuốn vở mặc định không thể xóa.', 409, {
      code: 'notebook_is_default',
      message: 'Cuốn vở mặc định không thể xóa.',
    }),
  )

  await wrapper.get(`[data-testid="delete-notebook-button-${regularNotebook.id}"]`).trigger('click')
  await wrapper.get('[data-testid="confirm-dialog-confirm"]').trigger('click')
  await flushPromises()

  expect(wrapper.get(`[data-testid="delete-error-${regularNotebook.id}"]`).text()).toContain('Cuốn vở mặc định không thể xóa.')
})

test('the confirm dialog focuses Hủy', async () => {
  vi.spyOn(notebooksApi, 'getNotebooks').mockResolvedValue({
    notebooks: [defaultNotebook, regularNotebook],
  })

  const wrapper = mount(NotesView, {
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  })
  await flushPromises()

  await wrapper.get(`[data-testid="delete-notebook-button-${regularNotebook.id}"]`).trigger('click')
  await flushPromises()

  const cancelButton = wrapper.get('[data-testid="confirm-dialog-cancel"]')
  expect(document.activeElement).toBe(cancelButton.element)

  wrapper.unmount()
})

test('cancel keeps the notebook', async () => {
  vi.spyOn(notebooksApi, 'getNotebooks').mockResolvedValue({
    notebooks: [defaultNotebook, regularNotebook],
  })
  const deleteSpy = vi.spyOn(notebooksApi, 'deleteNotebook')

  const wrapper = mount(NotesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  })
  await flushPromises()

  await wrapper.get(`[data-testid="delete-notebook-button-${regularNotebook.id}"]`).trigger('click')
  expect(wrapper.find('dialog[open]').exists()).toBe(true)

  await wrapper.get('[data-testid="confirm-dialog-cancel"]').trigger('click')
  await flushPromises()

  // Dialog closed, notebook retained, no API call
  expect(wrapper.find('dialog[open]').exists()).toBe(false)
  expect(wrapper.get('[data-testid="notebook-list"]').text()).toContain('Dự án Alpha')
  expect(deleteSpy).toHaveBeenCalledTimes(0)
})

test('a confirmed delete moves selection and focus to the notebook above', async () => {
  const notebook3: Notebook = {
    id: 'nb-gamma-3',
    name: 'Dự án Gamma',
    is_default: false,
    row_version: 1,
    note_count: 0,
    created_at: '2026-11-04T00:00:00Z',
    updated_at: '2026-11-04T00:00:00Z',
  }

  vi.spyOn(notebooksApi, 'getNotebooks').mockResolvedValue({
    notebooks: [defaultNotebook, regularNotebook, notebook3],
  })
  vi.spyOn(notebooksApi, 'deleteNotebook').mockResolvedValue({
    deleted_notebook_id: notebook3.id,
    account_revision: 2,
    data_epoch: 1,
  })

  const wrapper = mount(NotesView, {
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  })
  await flushPromises()

  // Select the 3rd notebook
  await wrapper.get(`[data-testid="notebook-item-${notebook3.id}"]`).trigger('click')
  expect(wrapper.get('[data-testid="selected-notebook-title"]').text()).toBe('Dự án Gamma')

  // Click delete on 3rd notebook and confirm
  await wrapper.get(`[data-testid="delete-notebook-button-${notebook3.id}"]`).trigger('click')
  await wrapper.get('[data-testid="confirm-dialog-confirm"]').trigger('click')
  await flushPromises()

  // Notebook 3 is removed
  expect(wrapper.find(`[data-testid="notebook-row-${notebook3.id}"]`).exists()).toBe(false)

  // Selection moved to the notebook above (notebook 2: "Dự án Alpha")
  expect(wrapper.get('[data-testid="selected-notebook-title"]').text()).toBe('Dự án Alpha')

  // Focus moved to the notebook above
  const notebookAboveButton = wrapper.get(`[data-testid="notebook-item-${regularNotebook.id}"]`)
  expect(document.activeElement).toBe(notebookAboveButton.element)

  // Now delete regularNotebook (at index 1)
  vi.spyOn(notebooksApi, 'deleteNotebook').mockResolvedValueOnce({
    deleted_notebook_id: regularNotebook.id,
    account_revision: 3,
    data_epoch: 1,
  })

  await wrapper.get(`[data-testid="delete-notebook-button-${regularNotebook.id}"]`).trigger('click')
  await wrapper.get('[data-testid="confirm-dialog-confirm"]').trigger('click')
  await flushPromises()

  // Selection and focus move to defaultNotebook (at index 0, the notebook above)
  expect(wrapper.get('[data-testid="selected-notebook-title"]').text()).toBe('Ghi chú nhanh')
  const defaultButton = wrapper.get(`[data-testid="notebook-item-${defaultNotebook.id}"]`)
  expect(document.activeElement).toBe(defaultButton.element)

  wrapper.unmount()
})

test('a load error shows retry instead of the empty state', async () => {
  const getSpy = vi.spyOn(notebooksApi, 'getNotebooks').mockRejectedValue(new Error('Network failure'))

  const wrapper = mount(NotesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  })
  await flushPromises()

  // Error state and retry button exist
  const errorContainer = wrapper.get('[data-testid="notebooks-load-error"]')
  expect(errorContainer.text()).toContain('Không thể tải danh sách cuốn vở.')
  const retryButton = wrapper.get('[data-testid="retry-load-button"]')
  expect(retryButton.text()).toBe('Thử lại')

  // Empty state does NOT exist on load error
  expect(wrapper.find('[data-testid="notebooks-empty"]').exists()).toBe(false)
  expect(wrapper.find('[data-testid="notebook-notes-empty"]').exists()).toBe(false)

  // Retry triggers refetch
  getSpy.mockResolvedValueOnce({ notebooks: [defaultNotebook] })
  await retryButton.trigger('click')
  await flushPromises()

  expect(wrapper.find('[data-testid="notebooks-load-error"]').exists()).toBe(false)
  expect(wrapper.get('[data-testid="notebook-list"]').text()).toContain('Ghi chú nhanh')
})
