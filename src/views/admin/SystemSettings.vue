<template>
  <div style="padding: 24px">
    <a-spin :spinning="loadingSettings">
      <a-form :label-col="{ span: 4 }" :wrapper-col="{ span: 14 }">
        <!-- Card 1: Basic Information -->
        <a-card :title="t('settings.basicInfo')" style="margin-bottom: 24px">
          <a-form-item :label="t('settings.companyName')">
            <a-input v-model:value="form.companyName" />
          </a-form-item>
          <a-form-item :label="t('settings.baseUrl')">
            <a-input v-model:value="form.baseUrl" />
            <div style="color: #888; font-size: 12px; margin-top: 4px">{{ t('settings.baseUrlHint') }}</div>
          </a-form-item>
          <a-form-item :label="t('settings.oaDeadlineDays')">
            <a-input-number v-model:value="form.oaDeadlineDays" :min="1" />
            <div style="color: #888; font-size: 12px; margin-top: 4px">{{ t('settings.oaDeadlineDaysHint') }}</div>
          </a-form-item>
        </a-card>

        <!-- Card 2: Email Server -->
        <a-card :title="t('settings.emailServer')" style="margin-bottom: 24px">
          <a-form-item :label="t('settings.emailMode')">
            <a-radio-group v-model:value="form.smtp.mode">
              <a-radio value="smtp">{{ t('settings.emailModeSmtp') }}</a-radio>
              <a-radio value="api">{{ t('settings.emailModeApi') }}</a-radio>
            </a-radio-group>
          </a-form-item>
          <template v-if="form.smtp.mode === 'smtp'">
            <a-form-item :label="t('settings.smtpHost')">
              <a-input v-model:value="form.smtp.host" />
            </a-form-item>
            <a-form-item :label="t('settings.smtpPort')">
              <a-input-number v-model:value="form.smtp.port" :min="1" :max="65535" />
            </a-form-item>
            <a-form-item :label="t('settings.smtpUsername')">
              <a-input v-model:value="form.smtp.username" />
            </a-form-item>
            <a-form-item :label="t('settings.smtpPassword')">
              <a-input-password v-model:value="form.smtp.password" />
            </a-form-item>
          </template>
          <template v-else>
            <a-form-item :label="t('settings.emailApiUrl')">
              <a-input v-model:value="form.smtp.apiUrl" />
              <div style="color: #888; font-size: 12px; margin-top: 4px">{{ t('settings.emailApiUrlHint') }}</div>
            </a-form-item>
            <a-form-item :label="t('settings.emailApiAppCode')">
              <a-input v-model:value="form.smtp.apiAppCode" />
            </a-form-item>
            <a-form-item :label="t('settings.emailApiAppSecret')">
              <a-input-password v-model:value="form.smtp.apiAppSecret" />
            </a-form-item>
          </template>
        </a-card>

        <!-- Card 3: SMS Server -->
        <a-card :title="t('settings.smsServer')" style="margin-bottom: 24px">
          <a-form-item :label="t('settings.smsApiUrl')">
            <a-input v-model:value="form.sms.apiUrl" />
          </a-form-item>
          <a-form-item :label="t('settings.smsApiKey')">
            <a-input-password v-model:value="form.sms.apiKey" />
          </a-form-item>
          <a-form-item :label="t('settings.smsSenderNumber')">
            <a-input v-model:value="form.sms.senderNumber" />
          </a-form-item>
        </a-card>

        <!-- Bottom action row -->
        <a-form-item :wrapper-col="{ offset: 4, span: 14 }">
          <div style="display: flex; justify-content: flex-end; gap: 12px">
            <a-button @click="handleReset">{{ t('common.reset') }}</a-button>
            <a-button type="primary" :loading="saving" @click="handleSave">{{ t('common.save') }}</a-button>
          </div>
        </a-form-item>
      </a-form>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import * as settingsApi from '../../api/settings'
import { extractError } from '../../api/client'

const { t } = useI18n()

const loadingSettings = ref(true)
const saving = ref(false)

const defaultSettings: settingsApi.SystemSettings = {
  companyName: '',
  baseUrl: '',
  oaDeadlineDays: 7,
  smtp: {
    mode: 'smtp',
    host: '',
    port: 587,
    username: '',
    password: '',
    apiUrl: '',
    apiAppCode: '',
    apiAppSecret: '',
  },
  sms: { apiUrl: '', apiKey: '', senderNumber: '' },
}

const form = reactive({ ...defaultSettings, smtp: { ...defaultSettings.smtp }, sms: { ...defaultSettings.sms } })

let originalSettings = { ...defaultSettings, smtp: { ...defaultSettings.smtp }, sms: { ...defaultSettings.sms } }

async function loadSettings() {
  loadingSettings.value = true
  try {
    const s = await settingsApi.getSettings()
    form.companyName = s.companyName
    form.baseUrl = s.baseUrl
    form.oaDeadlineDays = s.oaDeadlineDays
    form.smtp = { ...s.smtp }
    form.sms = { ...s.sms }
    originalSettings = { ...s, smtp: { ...s.smtp }, sms: { ...s.sms } }
  } finally {
    loadingSettings.value = false
  }
}

function handleReset() {
  form.companyName = originalSettings.companyName
  form.baseUrl = originalSettings.baseUrl
  form.oaDeadlineDays = originalSettings.oaDeadlineDays
  form.smtp = { ...originalSettings.smtp }
  form.sms = { ...originalSettings.sms }
}

async function handleSave() {
  saving.value = true
  try {
    const updated = await settingsApi.updateSettings({
      companyName: form.companyName,
      baseUrl: form.baseUrl,
      oaDeadlineDays: form.oaDeadlineDays,
      smtp: form.smtp,
      sms: form.sms,
    })
    originalSettings = { ...updated, smtp: { ...updated.smtp }, sms: { ...updated.sms } }
    message.success(t('settings.saveSettings'))
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    saving.value = false
  }
}

onMounted(loadSettings)
</script>
