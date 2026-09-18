import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, expect, test } from 'vitest'

import { useAccountStore } from '../../stores/account'
import AccountSettingsView from '../AccountSettingsView.vue'
import TodayView from '../TodayView.vue'

beforeEach(() => {
  setActivePinia(createPinia())
})

function seedContext(): void {
  const account = useAccountStore()
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: '2026-09-21',
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
  }
  account.status = 'ready'
}

test('Today renders the canonical account date and Monday to Sunday week verbatim', () => {
  seedContext()

  const wrapper = mount(TodayView)

  expect(wrapper.text()).toContain('2026-09-21')
  expect(wrapper.text()).toContain('2026-09-21 – 2026-09-27')
})

test('Settings exposes the approved timezone as read-only text', () => {
  seedContext()

  const wrapper = mount(AccountSettingsView)

  expect(wrapper.text()).toContain('Asia/Ho_Chi_Minh')
  expect(wrapper.find('input').exists()).toBe(false)
  expect(wrapper.find('select').exists()).toBe(false)
  expect(wrapper.find('button').exists()).toBe(false)
})
