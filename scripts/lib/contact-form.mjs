/**
 * 「お問い合わせ」導線の遷移先（Google フォーム）。
 *
 * 変更方法:
 *   1. 下の CONTACT_FORM_URL に viewform / forms.gle の https URL を入れる
 *   2. node scripts/sync-contact-form.mjs
 *
 * 空文字、または Google フォーム以外の URL のときは既存の contact.html を維持する。
 * サイトから個人情報・画面データをフォームへ自動送信しない（リンクのみ）。
 */
export const CONTACT_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfFMY4unRXIsYLiPh3-lgr3vFpX4DcYgvWKtq38BDNOa1NY9g/viewform';

const FORM_URL_RE = /^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/i;

export function isGoogleFormUrl(url) {
  return FORM_URL_RE.test(String(url || '').trim());
}

export function expectedContactHref() {
  const url = String(CONTACT_FORM_URL || '').trim();
  return isGoogleFormUrl(url) ? url : 'contact.html';
}

export function contactFormBrowserSnippet() {
  return `const CONTACT_FORM_URL = ${JSON.stringify(CONTACT_FORM_URL)};
function isGoogleFormUrl(url) {
  return /^https:\\/\\/(docs\\.google\\.com\\/forms\\/|forms\\.gle\\/)/i.test(String(url || '').trim());
}
function applyContactFormLinks() {
  const url = String(CONTACT_FORM_URL || '').trim();
  const valid = isGoogleFormUrl(url);
  document.querySelectorAll('a.contact-form-link').forEach((a) => {
    const optional = a.getAttribute('data-contact-form-optional') === '1';
    if (valid) {
      a.setAttribute('href', url);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.hidden = false;
      a.removeAttribute('hidden');
      a.setAttribute('aria-label', 'お問い合わせ（新しいタブで開きます）');
    } else if (optional) {
      a.hidden = true;
      a.removeAttribute('href');
      a.removeAttribute('target');
      a.removeAttribute('rel');
      a.removeAttribute('aria-label');
    } else {
      a.removeAttribute('aria-label');
    }
  });
  document.querySelectorAll('[data-contact-form-only]').forEach((el) => {
    el.hidden = !valid;
  });
  document.querySelectorAll('[data-contact-form-fallback]').forEach((el) => {
    el.hidden = valid;
  });
}
`;
}
