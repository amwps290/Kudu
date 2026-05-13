<template>
  <a-modal
    v-model:open="visible"
    title="Redis 服务器信息"
    :width="900"
    :footer="null"
  >
    <a-spin :spinning="loading">
      <a-descriptions bordered size="small" :column="2">
        <a-descriptions-item label="版本" v-if="info.redis_version">
          {{ info.redis_version }}
        </a-descriptions-item>
        <a-descriptions-item label="模式" v-if="info.redis_mode">
          {{ info.redis_mode }}
        </a-descriptions-item>
        <a-descriptions-item label="已用内存" v-if="info.used_memory_human">
          {{ info.used_memory_human }}
        </a-descriptions-item>
        <a-descriptions-item label="内存峰值" v-if="info.used_memory_peak_human">
          {{ info.used_memory_peak_human }}
        </a-descriptions-item>
        <a-descriptions-item label="已连接客户端" v-if="info.connected_clients">
          {{ info.connected_clients }}
        </a-descriptions-item>
        <a-descriptions-item label="运行时间(天)" v-if="info.uptime_in_days">
          {{ info.uptime_in_days }}
        </a-descriptions-item>
        <a-descriptions-item label="总命令数" v-if="info.total_commands_processed">
          {{ info.total_commands_processed }}
        </a-descriptions-item>
        <a-descriptions-item label="键总数" v-if="info.db0">
          {{ info.db0 }}
        </a-descriptions-item>
      </a-descriptions>

      <a-divider orientation="left">所有信息</a-divider>
      <pre class="code-block-compact server-info-detail">{{ JSON.stringify(info, null, 2) }}</pre>
    </a-spin>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
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

watch(() => props.open, (val) => { visible.value = val })
watch(visible, (val) => { emit('update:open', val) })

watch(() => props.open, async (val) => {
  if (val && props.connectionId) {
    loading.value = true
    try {
      info.value = await redisApi.getInfo(props.connectionId)
    } catch (error: unknown) {
      message.error(`获取服务器信息失败: ${error}`)
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
