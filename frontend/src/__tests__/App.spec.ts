import { afterEach, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import router from '../router'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('the real app renders an accessible NoteFlow foundation shell', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => new Promise<Response>(() => {})))
  await router.push('/')
  await router.isReady()

  const wrapper = mount(App, { global: { plugins: [router] } })

  expect(wrapper.find('nav[aria-label="Điều hướng chính"]').exists()).toBe(true)
  expect(wrapper.find('main').exists()).toBe(true)
  expect(wrapper.get('h1').text()).toBe('NoteFlow')
  expect(wrapper.find('[role="status"]').text()).toContain('Đang kiểm tra nền tảng')
})

test('the foundation shell reports the real API status', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', service: 'noteflow-api' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
  await router.push('/')

  const wrapper = mount(App, { global: { plugins: [router] } })
  await flushPromises()

  expect(wrapper.find('[role="status"]').text()).toBe('API NoteFlow sẵn sàng')
})

test('the foundation shell exposes an API failure without hiding the page', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })))
  await router.push('/')

  const wrapper = mount(App, { global: { plugins: [router] } })
  await flushPromises()

  expect(wrapper.find('[role="alert"]').text()).toContain('Không thể kết nối API nền tảng')
  expect(wrapper.get('h2').text()).toBe('Một ứng dụng, cùng một origin')
})
