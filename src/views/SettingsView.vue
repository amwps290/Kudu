<template>
  <a-layout class="settings-page" :class="{ 'dark-mode': appStore.theme === 'dark' }">
    <AppHeader
      :show-search="false"
      @new-connection="goHome"
      @open-settings="noop"
      @open-search="noop"
    />

    <a-layout-content class="settings-page-content">
      <SettingsContent @close="goHome" />
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import SettingsContent from '@/components/settings/SettingsContent.vue'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()

function goHome() {
  router.replace({ name: 'Home' })
}

function noop() {}
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
}

.settings-page-content {
  height: calc(100vh - var(--header-height));
}
</style>
