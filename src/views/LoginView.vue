<template>
  <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f2f5;">
    <a-card style="width: 400px;" :title="t('auth.loginTitle')">
      <a-form
        ref="formRef"
        :model="formData"
        layout="vertical"
        @finish="handleSubmit"
      >
        <a-form-item
          :label="t('user.username')"
          name="username"
          :rules="[{ required: true, message: t('common.required') }]"
        >
          <a-input v-model:value="formData.username" :placeholder="t('user.username')" />
        </a-form-item>

        <a-form-item
          :label="t('user.password')"
          name="password"
          :rules="[{ required: true, message: t('common.required') }]"
        >
          <a-input-password v-model:value="formData.password" :placeholder="t('user.password')" />
        </a-form-item>

        <a-alert v-if="errorMsg" type="error" :message="errorMsg" style="margin-bottom: 16px;" show-icon />

        <a-form-item>
          <a-button type="primary" html-type="submit" :loading="loading" block>
            {{ t('auth.login') }}
          </a-button>
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { extractError } from '../api/client'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const formData = ref({ username: '', password: '' })
const loading = ref(false)
const errorMsg = ref<string | null>(null)

async function handleSubmit() {
  loading.value = true
  errorMsg.value = null
  try {
    await auth.login(formData.value.username, formData.value.password)
    await router.replace('/admin/candidates')
  } catch (e) {
    const { code } = extractError(e)
    if (code === 'ACCOUNT_DISABLED') {
      errorMsg.value = t('auth.accountDisabled')
    } else {
      errorMsg.value = auth.error ?? t('auth.loginFailed')
    }
  } finally {
    loading.value = false
  }
}
</script>
