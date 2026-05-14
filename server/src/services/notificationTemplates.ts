// ---------------------------------------------------------------------------
// Notification Templates — bilingual (en / zhCN) with {{placeholder}} syntax
// ---------------------------------------------------------------------------

export type Locale = 'en' | 'zhCN';

export interface RenderedTemplate {
  subject: string;
  text: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Template dictionary
// ---------------------------------------------------------------------------

interface ChannelTemplate {
  subject: string;
  text: string;
}

type TemplateMap = Record<string, Record<Locale, ChannelTemplate>>;

const TEMPLATES: TemplateMap = {
  new_to_oa: {
    en: {
      subject: 'Online Assessment Invitation — {{positionName}}',
      text: [
        'Dear {{candidateName}},',
        '',
        'You have been invited to complete an online assessment for {{positionName}}.',
        '',
        'Your access code: {{oneTimeCode}}',
        'Assessment link: {{oaLink}}',
        'Deadline: {{oaDeadline}}',
        '',
        'Please complete before the deadline.',
        '',
        'Best regards,',
        '{{companyName}}',
      ].join('\n'),
    },
    zhCN: {
      subject: '在线测评邀请 — {{positionName}}',
      text: [
        '亲爱的 {{candidateName}}，',
        '',
        '您已被邀请完成 {{positionName}} 职位的在线测评。',
        '',
        '您的访问码：{{oneTimeCode}}',
        '测评链接：{{oaLink}}',
        '截止日期：{{oaDeadline}}',
        '',
        '请在截止日期前完成测评。',
        '',
        '此致',
        '{{companyName}}',
      ].join('\n'),
    },
  },

  oa_reminder: {
    en: {
      subject: 'Reminder: Online Assessment Deadline — {{positionName}}',
      text: [
        'Dear {{candidateName}},',
        '',
        'This is a reminder that your online assessment for {{positionName}} is due on {{oaDeadline}}.',
        '',
        'Assessment link: {{oaLink}}',
        'Your access code: {{oneTimeCode}}',
        '',
        'Please complete it before the deadline.',
        '',
        'Best regards,',
        '{{companyName}}',
      ].join('\n'),
    },
    zhCN: {
      subject: '提醒：在线测评截止提醒 — {{positionName}}',
      text: [
        '亲爱的 {{candidateName}}，',
        '',
        '提醒您，{{positionName}} 职位的在线测评将于 {{oaDeadline}} 截止。',
        '',
        '测评链接：{{oaLink}}',
        '您的访问码：{{oneTimeCode}}',
        '',
        '请在截止日期前完成。',
        '',
        '此致',
        '{{companyName}}',
      ].join('\n'),
    },
  },

  oa_no_response: {
    en: {
      subject: 'Online Assessment Not Completed — {{positionName}}',
      text: [
        'Dear {{candidateName}},',
        '',
        'We regret to inform you that you did not complete the online assessment for {{positionName}} before the deadline.',
        '',
        'Your application has been moved to a no-response status.',
        '',
        'Best regards,',
        '{{companyName}}',
      ].join('\n'),
    },
    zhCN: {
      subject: '在线测评未完成 — {{positionName}}',
      text: [
        '亲爱的 {{candidateName}}，',
        '',
        '遗憾地通知您，您未在截止日期前完成 {{positionName}} 职位的在线测评。',
        '',
        '您的申请已被标记为无回应状态。',
        '',
        '此致',
        '{{companyName}}',
      ].join('\n'),
    },
  },

  oa_to_human: {
    en: {
      subject: 'Interview Scheduling — {{positionName}}',
      text: [
        'Dear {{candidateName}},',
        '',
        'Congratulations! You have passed the online assessment for {{positionName}}.',
        '',
        'Please book your interview slot here: {{statusLink}}',
        '',
        'Best regards,',
        '{{companyName}}',
      ].join('\n'),
    },
    zhCN: {
      subject: '面试预约通知 — {{positionName}}',
      text: [
        '亲爱的 {{candidateName}}，',
        '',
        '恭喜您通过了 {{positionName}} 职位的在线测评！',
        '',
        '请点击以下链接预约面试时间：{{statusLink}}',
        '',
        '此致',
        '{{companyName}}',
      ].join('\n'),
    },
  },

  date_confirmed: {
    en: {
      subject: 'Interview Date Confirmed — {{positionName}}',
      text: [
        'Dear {{candidateName}},',
        '',
        'Your interview for {{positionName}} has been confirmed.',
        '',
        'Date: {{slotDate}}',
        'Time: {{slotTime}}',
        'Interviewer: {{interviewerName}}',
        '',
        'Please be on time.',
        '',
        'Best regards,',
        '{{companyName}}',
      ].join('\n'),
    },
    zhCN: {
      subject: '面试时间已确认 — {{positionName}}',
      text: [
        '亲爱的 {{candidateName}}，',
        '',
        '您的 {{positionName}} 面试时间已确认。',
        '',
        '日期：{{slotDate}}',
        '时间：{{slotTime}}',
        '面试官：{{interviewerName}}',
        '',
        '请准时参加面试。',
        '',
        '此致',
        '{{companyName}}',
      ].join('\n'),
    },
  },

  terminal_status: {
    en: {
      subject: 'Application Update — {{positionName}}',
      text: [
        'Dear {{candidateName}},',
        '',
        'We have an update regarding your application for {{positionName}}.',
        '',
        '{{resultText}}',
        '',
        'Thank you for your interest.',
        '',
        'Best regards,',
        '{{companyName}}',
      ].join('\n'),
    },
    zhCN: {
      subject: '申请状态更新 — {{positionName}}',
      text: [
        '亲爱的 {{candidateName}}，',
        '',
        '关于您的 {{positionName}} 职位申请，我们有最新消息。',
        '',
        '{{resultText}}',
        '',
        '感谢您的关注。',
        '',
        '此致',
        '{{companyName}}',
      ].join('\n'),
    },
  },
};

// ---------------------------------------------------------------------------
// Placeholder substitution
// ---------------------------------------------------------------------------

function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? '');
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<pre style="font-family:sans-serif;white-space:pre-wrap">${escaped}</pre>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function renderTemplate(
  triggerEvent: string,
  locale: Locale,
  vars: Record<string, string>,
): RenderedTemplate {
  const eventTemplates = TEMPLATES[triggerEvent];
  if (!eventTemplates) {
    // Fallback for unknown events
    const subject = `Notification: ${triggerEvent}`;
    const text = `Event: ${triggerEvent}`;
    return { subject, text, html: textToHtml(text) };
  }

  const tpl = eventTemplates[locale] ?? eventTemplates['en'];
  const subject = substitute(tpl.subject, vars);
  const text = substitute(tpl.text, vars);
  const html = textToHtml(text);

  return { subject, text, html };
}
