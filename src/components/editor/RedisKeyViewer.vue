<template>
  <div class="redis-key-viewer">
    <a-spin :spinning="loading">
      <a-card v-if="keyData" :title="$t('redis.key_viewer.key_label', { key: keyName })" size="small">
        <template #extra>
          <a-space>
            <a-tag :color="getTypeColor(keyData.key_type)">
              {{ keyData.key_type }}
            </a-tag>
            <a-tag v-if="keyData.ttl > 0" color="orange">
              {{ $t('redis.key_viewer.ttl_seconds', { ttl: keyData.ttl }) }}
            </a-tag>
            <a-tag v-else-if="keyData.ttl === -1" color="blue">
              {{ $t('redis.key_viewer.never_expire') }}
            </a-tag>
            <a-button size="small" danger @click="handleDelete">
              {{ $t('common.delete') }}
            </a-button>
          </a-space>
        </template>

        <!-- 字符串类型 -->
        <div v-if="keyData.key_type === 'string'">
          <a-textarea
            v-model:value="editedValue"
            :rows="10"
            :disabled="!editing"
          />
          <a-space style="margin-top: 12px">
            <a-button v-if="!editing" @click="editing = true">{{ $t('common.edit') }}</a-button>
            <template v-else>
              <a-button type="primary" @click="handleSave">{{ $t('common.save') }}</a-button>
              <a-button @click="cancelEdit">{{ $t('common.cancel') }}</a-button>
            </template>
          </a-space>
        </div>

        <!-- 列表类型 -->
        <div v-else-if="keyData.key_type === 'list'">
          <a-list
            :data-source="(keyData.value as string[])"
            bordered
            size="small"
          >
            <template #renderItem="{ item, index }">
              <a-list-item>
                <strong>[{{ index }}]</strong> {{ item }}
              </a-list-item>
            </template>
          </a-list>
        </div>

        <!-- 集合类型 -->
        <div v-else-if="keyData.key_type === 'set'">
          <a-list
            :data-source="(keyData.value as string[])"
            bordered
            size="small"
          >
            <template #renderItem="{ item }">
              <a-list-item>{{ item }}</a-list-item>
            </template>
          </a-list>
        </div>

        <!-- 有序集合类型 -->
        <div v-else-if="keyData.key_type === 'zset'">
          <a-table
            :columns="zsetColumns"
            :data-source="formatZsetData(keyData.value)"
            :pagination="false"
            size="small"
            bordered
          />
        </div>

        <!-- 哈希类型 -->
        <div v-else-if="keyData.key_type === 'hash'">
          <a-table
            :columns="hashColumns"
            :data-source="formatHashData(keyData.value)"
            :pagination="false"
            size="small"
            bordered
          />
        </div>

        <!-- 未知类型 -->
        <div v-else>
          <pre>{{ JSON.stringify(keyData.value, null, 2) }}</pre>
        </div>
      </a-card>

      <a-empty v-else :description="$t('redis.key_viewer.select_key')" />
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { message, Modal } from '@/ui/antd'
import { useI18n } from 'vue-i18n'
import { redisApi } from '@/api'

interface RedisKeyData {
  key_type: string
  value: unknown
  ttl: number
}

const { t } = useI18n()

const props = defineProps<{
  connectionId: string
  keyName: string
}>()

const emit = defineEmits(['deleted', 'updated'])

const loading = ref(false)
const keyData = ref<RedisKeyData | null>(null)
const editing = ref(false)
const editedValue = ref('')

// 哈希表列
const hashColumns = computed(() => [
  {
    title: t('redis.key_viewer.field'),
    dataIndex: 'field',
    key: 'field',
  },
  {
    title: t('redis.key_viewer.value'),
    dataIndex: 'value',
    key: 'value',
  },
])

// 有序集合列
const zsetColumns = computed(() => [
  {
    title: t('redis.key_viewer.member'),
    dataIndex: 'member',
    key: 'member',
  },
  {
    title: t('redis.key_viewer.score'),
    dataIndex: 'score',
    key: 'score',
  },
])

// 获取类型颜色
function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    string: 'green',
    list: 'blue',
    set: 'orange',
    zset: 'purple',
    hash: 'cyan',
  }
  return colors[type] || 'default'
}

// 格式化哈希数据
function formatHashData(value: unknown): { field: string; value: string }[] {
  if (Array.isArray(value)) {
    const result: { field: string; value: string }[] = []
    for (let i = 0; i < value.length; i += 2) {
      result.push({
        field: value[i],
        value: value[i + 1],
      })
    }
    return result
  }
  return []
}

// 格式化有序集合数据
function formatZsetData(value: unknown): { member: string; score: string }[] {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => {
      if (Array.isArray(item) && item.length === 2) {
        return {
          member: item[0],
          score: item[1],
        }
      }
      return item as { member: string; score: string }
    })
  }
  return []
}

// 加载键值
async function loadKeyValue() {
  if (!props.keyName) return

  loading.value = true
  try {
    const result = await redisApi.getKeyValue(
      props.connectionId,
      props.keyName,
    )

    keyData.value = result as RedisKeyData

    // 如果是字符串类型，初始化编辑值
    if (result.key_type === 'string') {
      editedValue.value = result.value as string
    }
  } catch (error: unknown) {
    message.error(t('redis.key_viewer.get_fail', { error: String(error) }))
  } finally {
    loading.value = false
  }
}

// 保存编辑
async function handleSave() {
  try {
    await redisApi.setKeyValue(
      props.connectionId,
      props.keyName,
      editedValue.value,
      keyData.value!.ttl > 0 ? keyData.value!.ttl : undefined,
    )

    message.success(t('redis.key_viewer.save_success'))
    editing.value = false
    emit('updated')
    loadKeyValue()
  } catch (error: unknown) {
    message.error(t('redis.key_viewer.save_fail', { error: String(error) }))
  }
}

// 取消编辑
function cancelEdit() {
  editing.value = false
  editedValue.value = (keyData.value?.value as string) || ''
}

// 删除键
function handleDelete() {
  Modal.confirm({
    title: t('redis.key_viewer.delete_confirm_title'),
    content: t('redis.key_viewer.delete_confirm_content', { key: props.keyName }),
    okText: t('common.delete'),
    okType: 'danger',
    cancelText: t('common.cancel'),
    async onOk() {
      try {
        await redisApi.deleteKey(
          props.connectionId,
          props.keyName,
        )

        message.success(t('redis.key_viewer.delete_success'))
        emit('deleted')
      } catch (error: unknown) {
        message.error(t('redis.key_viewer.delete_fail', { error: String(error) }))
      }
    },
  })
}

// 监听 keyName 变化
watch(() => props.keyName, () => {
  if (props.keyName) {
    editing.value = false
    loadKeyValue()
  } else {
    keyData.value = null
  }
}, { immediate: true })
</script>

<style scoped>
.redis-key-viewer {
  padding: 16px;
  height: 100%;
  overflow: auto;
}
</style>
