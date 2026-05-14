<template>
  <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f2f5;">
    <a-card style="width: 400px;" :title="t('auth.candidateLoginTitle')">
      <a-form
        ref="formRef"
        :model="formData"
        layout="vertical"
        @finish="handleSubmit"
      >
        <a-form-item
          :label="t('auth.oneTimeCode')"
          name="oneTimeCode"
          :rules="[{ required: true, message: t('common.required') }]"
        >
          <a-input v-model:value="formData.oneTimeCode" :placeholder="t('auth.oneTimeCodePlaceholder')" />
        </a-form-item>

        <a-form-item
          :label="t('auth.phoneLast4')"
          name="phoneLast4"
          :rules="[
            { required: true, message: t('common.required') },
            { pattern: /^\d{4}$/, message: t('auth.phoneLast4Hint') },
          ]"
        >
          <a-input v-model:value="formData.phoneLast4" :placeholder="t('auth.phoneLast4Placeholder')" maxlength="4" />
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

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const formData = ref({ oneTimeCode: '', phoneLast4: '' })
const loading = ref(false)
const errorMsg = ref<string | null>(null)

async function handleSubmit() {
  loading.value = true
  errorMsg.value = null
  try {
    await auth.candidateLogin(formData.value.oneTimeCode, formData.value.phoneLast4)
    await router.replace('/candidate/home')
  } catch {
    errorMsg.value = auth.error ?? t('auth.loginFailed')
  } finally {
    loading.value = false
  }
}
</script>
