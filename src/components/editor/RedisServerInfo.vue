<template>
  <a-modal
    v-model:open="visible"
    :title="$t('redis.server_info_title')"
    :width="900"
    :footer="null"
  >
    <a-spin :spinning="loading">
      <a-descriptions bordered size="small" :column="2">
        <a-descriptions-item :label="$t('redis.info.version')" v-if="info.redis_version">
          {{ info.redis_version }}
        </a-descriptions-item>
        <a-descriptions-item :label="$t('redis.info.mode')" v-if="info.redis_mode">
          {{ info.redis_mode }}
        </a-descriptions-item>
        <a-descriptions-item :label="$t('redis.info.used_memory')" v-if="info.used_memory_human">
          {{ info.used_memory_human }}
        </a-descriptions-item>
        <a-descriptions-item :label="$t('redis.info.peak_memory')" v-if="info.used_memory_peak_human">
          {{ info.used_memory_peak_human }}
        </a-descriptions-item>
        <a-descriptions-item :label="$t('redis.info.connected_clients')" v-if="info.connected_clients">
          {{ info.connected_clients }}
        </a-descriptions-item>
        <a-descriptions-item :label="$t('redis.info.uptime_days')" v-if="info.uptime_in_days">
          {{ info.uptime_in_days }}
        </a-descriptions-item>
        <a-descriptions-item :label="$t('redis.info.total_commands')" v-if="info.total_commands_processed">
          {{ info.total_commands_processed }}
        </a-descriptions-item>
        <a-descriptions-item :label="$t('redis.info.total_keys')" v-if="info.db0">
          {{ info.db0 }}
        </a-descriptions-item>
      </a-descriptions>

      <a-divider orientation="left">{{ $t('redis.info.all_info') }}</a-divider>
      <pre class="code-block-compact server-info-detail">{{ JSON.stringify(info, null, 2) }}</pre>
    </a-spin>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from '@/ui/antd'
import { redisApi } from '@/api'

const props = defineProps<{
  open: boolean
  connectionId: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const visible = ref(props.open)
const loading = ref(false)
const info = ref<Record<string, any>>({})
const { t } = useI18n()

watch(() => props.open, (val) => { visible.value = val })
watch(visible, (val) => { emit('update:open', val) })

watch(() => props.open, async (val) => {
  if (val && props.connectionId) {
    loading.value = true
    try {
      info.value = await redisApi.getInfo(props.connectionId)
    } catch (error: unknown) {
      message.error(t('redis.info.fetch_fail', { error: String(error) }))
    } finally {
      loading.value = false
    }
  }
})
</script>

<style scoped>
.server-info-detail {
  padding: 12px;
  max-height: 400px;
  overflow: auto;
}
</style>
