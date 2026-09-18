import { beforeEach, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../App.vue'
import { pinia } from '../pinia'
import router from '../router'
import { useAuthStore } from '../stores/auth'

beforeEach(async () => {
  vi.restoreAllMocks()
  const auth = useAuthStore(pinia)
  auth.owner = null
  auth.status = 'guest'
  await router.push('/sign-in')
})

test('guests see the owner login without public registration', () => {
  const wrapper = mount(App, { global: { plugins: [pinia, router] } })

  expect(wrapper.get('h2').text()).toBe('Đăng nhập NoteFlow')
  expect(wrapper.find('form').exists()).toBe(true)
  expect(wrapper.text()).toContain('không mở đăng ký công khai')
  expect(wrapper.find('nav').exists()).toBe(false)
  expect(wrapper.find('main').exists()).toBe(true)
})

test('authenticated navigation has the approved order and a clear mobile trigger', async () => {
  const auth = useAuthStore(pinia)
  auth.owner = { id: 1, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  await router.push('/today')

  const wrapper = mount(App, { global: { plugins: [pinia, router] } })
  const links = wrapper.get('nav[aria-label="Điều hướng chính"]').findAll('a')

  expect(links.map((link) => link.text())).toEqual([
    'Hôm nay',
    'Challenge',
    'Ghi chú',
    'Lịch',
    'Cài đặt',
  ])
  expect(wrapper.get('button[aria-controls="primary-navigation"]').attributes('aria-expanded')).toBe('false')
})
