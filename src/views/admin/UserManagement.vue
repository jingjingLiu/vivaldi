<template>
  <div>
    <!-- Top bar -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <a-space>
        <a-input-search
          v-model:value="searchText"
          :placeholder="t('user.searchPlaceholder')"
          style="width: 200px"
          @search="onSearch"
        />
        <a-select
          v-model:value="roleFilter"
          :placeholder="t('user.allRoles')"
          style="width: 150px"
          allow-clear
          @change="onSearch"
        >
          <a-select-option value="coordinator">{{ t('role.coordinator') }}</a-select-option>
          <a-select-option value="screener">{{ t('role.screener') }}</a-select-option>
          <a-select-option value="interviewer">{{ t('role.interviewer') }}</a-select-option>
        </a-select>
      </a-space>
      <a-button type="primary" @click="openAddModal">{{ t('user.addUser') }}</a-button>
    </div>

    <!-- Table -->
    <a-table
      :data-source="users"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{
        current: page,
        pageSize: pageSize,
        total: total,
        showTotal: (tot: number) => t('common.total', { count: tot }),
        onChange: onPageChange,
      }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'roles'">
          <a-space>
            <RoleTag v-for="role in record.roles" :key="role" :role="role" />
          </a-space>
        </template>

        <template v-else-if="column.key === 'status'">
          <span v-if="record.enabled">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #52c41a; margin-right: 6px;"></span>
            {{ t('common.enabled') }}
          </span>
          <span v-else>
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #d9d9d9; margin-right: 6px;"></span>
            {{ t('common.disabled') }}
          </span>
        </template>

        <template v-else-if="column.key === 'actions'">
          <a-button type="link" @click="openEditModal(record)">{{ t('common.edit') }}</a-button>
          <a-button
            type="link"
            :style="{ color: record.enabled ? '#ff4d4f' : '#52c41a' }"
            @click="toggleEnable(record)"
          >
            {{ record.enabled ? t('common.disable') : t('common.enable') }}
          </a-button>
        </template>
      </template>
    </a-table>

    <!-- Add/Edit Modal -->
    <a-modal
      v-model:open="modalVisible"
      :title="isEditing ? t('user.editUser') : t('user.addUser')"
      @cancel="closeModal"
      :footer="null"
    >
      <a-form
        ref="formRef"
        :model="formData"
        :label-col="{ span: 6 }"
        :wrapper-col="{ span: 18 }"
      >
        <a-form-item
          :label="t('user.username')"
          name="username"
          :rules="isEditing ? [] : usernameRules"
        >
          <a-input v-model:value="formData.username" :disabled="isEditing" />
        </a-form-item>

        <a-form-item
          :label="t('user.password')"
          name="password"
          :rules="passwordRules"
        >
          <a-input-password v-model:value="formData.password" :placeholder="isEditing ? t('user.passwordHint') : ''" />
        </a-form-item>

        <a-form-item
          :label="t('user.name')"
          name="name"
          :rules="nameRules"
        >
          <a-input v-model:value="formData.name" />
        </a-form-item>

        <a-form-item :label="t('user.roles')" name="roles" :rules="roleRules">
          <a-checkbox-group v-model:value="formData.roles">
            <a-space>
              <a-checkbox value="coordinator">{{ t('role.coordinator') }}</a-checkbox>
              <a-checkbox value="screener">{{ t('role.screener') }}</a-checkbox>
              <a-checkbox value="interviewer">{{ t('role.interviewer') }}</a-checkbox>
            </a-space>
          </a-checkbox-group>
        </a-form-item>

        <a-form-item :wrapper-col="{ offset: 6, span: 18 }">
          <a-space>
            <a-button @click="closeModal">{{ t('common.cancel') }}</a-button>
            <a-button type="primary" :loading="saving" @click="handleConfirm">{{ t('common.confirm') }}</a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import type { FormInstance } from 'ant-design-vue'
import RoleTag from '../../components/RoleTag.vue'
import * as usersApi from '../../api/users'
import type { User, Role } from '../../api/users'
import { extractError } from '../../api/client'

const { t } = useI18n()

const users = ref<User[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const saving = ref(false)

const searchText = ref('')
const roleFilter = ref<Role | undefined>(undefined)

const columns = [
  { title: t('user.username'), dataIndex: 'username', key: 'username' },
  { title: t('user.name'), dataIndex: 'name', key: 'name' },
  { title: t('user.roles'), key: 'roles' },
  { title: t('user.status'), key: 'status' },
  { title: t('user.actions'), key: 'actions' },
]

async function fetchUsers() {
  loading.value = true
  try {
    const result = await usersApi.listUsers({
      q: searchText.value || undefined,
      role: roleFilter.value,
      page: page.value,
      pageSize: pageSize.value,
    })
    users.value = result.items
    total.value = result.total
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  fetchUsers()
}

function onPageChange(p: number, ps: number) {
  page.value = p
  pageSize.value = ps
  fetchUsers()
}

async function toggleEnable(record: User) {
  try {
    const updated = await usersApi.updateUser(record.id, { enabled: !record.enabled })
    const idx = users.value.findIndex(u => u.id === record.id)
    if (idx !== -1) users.value[idx] = updated
  } catch (e) {
    message.error(extractError(e).message)
  }
}

// Modal state
const modalVisible = ref(false)
const isEditing = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<FormInstance>()

interface FormData {
  username: string
  password: string
  name: string
  roles: Role[]
}

const defaultForm = (): FormData => ({
  username: '',
  password: '',
  name: '',
  roles: [],
})

const formData = ref<FormData>(defaultForm())

// Keep frontend validation aligned with the backend user creation schema.
const usernameRules = [
  { required: true, message: t('common.required') },
  { min: 3, message: t('user.usernameMin') },
  { max: 50, message: t('user.usernameMax') },
  { pattern: /^[a-z0-9_.-]+$/, message: t('user.usernamePattern') },
]
const passwordRules = computed(() => {
  if (isEditing.value) {
    return [
      {
        validator: (_rule: unknown, value?: string) => {
          if (!value || value.length >= 8) return Promise.resolve()
          return Promise.reject(new Error(t('user.passwordMin')))
        },
      },
    ]
  }
  return [
    { required: true, message: t('common.required') },
    { min: 8, message: t('user.passwordMin') },
  ]
})
const nameRules = [
  { required: true, message: t('common.required') },
  { max: 100, message: t('user.nameMax') },
]
const roleRules = [
  {
    validator: (_rule: unknown, value?: Role[]) => {
      if (value && value.length > 0) return Promise.resolve()
      return Promise.reject(new Error(t('user.roleRequired')))
    },
  },
]

function openAddModal() {
  isEditing.value = false
  editingId.value = null
  formData.value = defaultForm()
  modalVisible.value = true
}

function openEditModal(record: User) {
  isEditing.value = true
  editingId.value = record.id
  formData.value = {
    username: record.username,
    password: '',
    name: record.name,
    roles: [...record.roles],
  }
  modalVisible.value = true
}

function closeModal() {
  modalVisible.value = false
  formRef.value?.resetFields()
}

async function handleConfirm() {
  // Trim display identifiers before validation so accidental spaces do not cause backend 400 errors.
  formData.value.username = formData.value.username.trim()
  formData.value.name = formData.value.name.trim()

  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  const roles = [...formData.value.roles]

  saving.value = true
  try {
    if (isEditing.value && editingId.value !== null) {
      const patch: { name?: string; roles?: Role[] } = { name: formData.value.name, roles }
      const updated = await usersApi.updateUser(editingId.value, patch)
      // If password is provided, reset it
      if (formData.value.password) {
        await usersApi.resetPassword(editingId.value, formData.value.password)
      }
      const idx = users.value.findIndex(u => u.id === editingId.value)
      if (idx !== -1) users.value[idx] = updated
    } else {
      await usersApi.createUser({
        username: formData.value.username,
        password: formData.value.password,
        name: formData.value.name,
        roles,
      })
      await fetchUsers()
    }
    closeModal()
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    saving.value = false
  }
}

onMounted(fetchUsers)
</script>
