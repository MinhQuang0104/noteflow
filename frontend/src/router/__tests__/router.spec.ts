import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../../App.vue'
import router from '..'

test('a direct deep link renders through Vue Router history mode', async () => {
  await router.push('/smoke/deep-link')
  await router.isReady()

  const wrapper = mount(App, { global: { plugins: [router] } })

  expect(wrapper.get('h2').text()).toBe('Deep link hoạt động')
})
