<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <section>
    <h2 class="text-2xl font-semibold">{{ title }}</h2>
    <p class="mt-2 text-slate-600">Không gian riêng tư đã sẵn sàng cho các Story tiếp theo.</p>
  </section>
</template>
