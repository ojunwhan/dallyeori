/**
 * MONO `constants/languages.js` LANGUAGES 배열과 동일 (100개)
 */

import { regionalEmojiToAlpha2, alpha2ToRegionalFlag } from '../utils/flagIcon.js';

/** MONO 스펙명 LANGUAGES_FULL — 찾기 탭 국가 필터 등 */
export const LANGUAGES_FULL = [
  // ===== Tier 1: 주요 언어 =====
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', tier: 1 },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', tier: 1 },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', tier: 1 },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', tier: 1 },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳', tier: 1 },
  { code: 'th', name: 'Thai', nativeName: 'ภาษาไทย', flag: '🇹🇭', tier: 1 },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩', tier: 1 },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', flag: '🇲🇾', tier: 1 },
  { code: 'tl', name: 'Filipino', nativeName: 'Filipino', flag: '🇵🇭', tier: 1 },
  { code: 'my', name: 'Myanmar', nativeName: 'မြန်မာစာ', flag: '🇲🇲', tier: 1 },
  { code: 'km', name: 'Khmer', nativeName: 'ភាសាខ្មែរ', flag: '🇰🇭', tier: 1 },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', flag: '🇳🇵', tier: 1 },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол', flag: '🇲🇳', tier: 1 },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbek', flag: '🇺🇿', tier: 1 },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', tier: 1 },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', tier: 1 },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷', tier: 1 },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', tier: 1 },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', tier: 1 },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', tier: 1 },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', tier: 1 },
  // ===== Tier 2: 전체 =====
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', flag: '🇿🇦', tier: 2 },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip', flag: '🇦🇱', tier: 2 },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', flag: '🇪🇹', tier: 2 },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն', flag: '🇦🇲', tier: 2 },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan', flag: '🇦🇿', tier: 2 },
  { code: 'eu', name: 'Basque', nativeName: 'Euskara', flag: '🇪🇸', tier: 2 },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская', flag: '🇧🇾', tier: 2 },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇧🇩', tier: 2 },
  { code: 'bs', name: 'Bosnian', nativeName: 'Bosanski', flag: '🇧🇦', tier: 2 },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', flag: '🇧🇬', tier: 2 },
  { code: 'ca', name: 'Catalan', nativeName: 'Català', flag: '🇪🇸', tier: 2 },
  { code: 'ceb', name: 'Cebuano', nativeName: 'Cebuano', flag: '🇵🇭', tier: 2 },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', flag: '🇭🇷', tier: 2 },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', flag: '🇨🇿', tier: 2 },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', flag: '🇩🇰', tier: 2 },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱', tier: 2 },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti', flag: '🇪🇪', tier: 2 },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', flag: '🇫🇮', tier: 2 },
  { code: 'gl', name: 'Galician', nativeName: 'Galego', flag: '🇪🇸', tier: 2 },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული', flag: '🇬🇪', tier: 2 },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', flag: '🇬🇷', tier: 2 },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', flag: '🇮🇳', tier: 2 },
  { code: 'ht', name: 'Haitian Creole', nativeName: 'Kreyòl Ayisyen', flag: '🇭🇹', tier: 2 },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', flag: '🇳🇬', tier: 2 },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: '🇮🇱', tier: 2 },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', flag: '🇭🇺', tier: 2 },
  { code: 'is', name: 'Icelandic', nativeName: 'Íslenska', flag: '🇮🇸', tier: 2 },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo', flag: '🇳🇬', tier: 2 },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', tier: 2 },
  { code: 'jv', name: 'Javanese', nativeName: 'Basa Jawa', flag: '🇮🇩', tier: 2 },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', flag: '🇮🇳', tier: 2 },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақ', flag: '🇰🇿', tier: 2 },
  { code: 'rw', name: 'Kinyarwanda', nativeName: 'Ikinyarwanda', flag: '🇷🇼', tier: 2 },
  { code: 'ky', name: 'Kyrgyz', nativeName: 'Кыргызча', flag: '🇰🇬', tier: 2 },
  { code: 'lo', name: 'Lao', nativeName: 'ລາວ', flag: '🇱🇦', tier: 2 },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', flag: '🇱🇻', tier: 2 },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', flag: '🇱🇹', tier: 2 },
  { code: 'lb', name: 'Luxembourgish', nativeName: 'Lëtzebuergesch', flag: '🇱🇺', tier: 2 },
  { code: 'mk', name: 'Macedonian', nativeName: 'Македонски', flag: '🇲🇰', tier: 2 },
  { code: 'mg', name: 'Malagasy', nativeName: 'Malagasy', flag: '🇲🇬', tier: 2 },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', flag: '🇮🇳', tier: 2 },
  { code: 'mt', name: 'Maltese', nativeName: 'Malti', flag: '🇲🇹', tier: 2 },
  { code: 'mi', name: 'Maori', nativeName: 'Te Reo Māori', flag: '🇳🇿', tier: 2 },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳', tier: 2 },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', flag: '🇳🇴', tier: 2 },
  { code: 'ny', name: 'Nyanja', nativeName: 'Chichewa', flag: '🇲🇼', tier: 2 },
  { code: 'ps', name: 'Pashto', nativeName: 'پښتو', flag: '🇦🇫', tier: 2 },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', flag: '🇮🇷', tier: 2 },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱', tier: 2 },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', flag: '🇮🇳', tier: 2 },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', flag: '🇷🇴', tier: 2 },
  { code: 'sm', name: 'Samoan', nativeName: 'Gagana Samoa', flag: '🇼🇸', tier: 2 },
  { code: 'gd', name: 'Scottish Gaelic', nativeName: 'Gàidhlig', flag: '🏴', tier: 2 },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски', flag: '🇷🇸', tier: 2 },
  { code: 'sn', name: 'Shona', nativeName: 'ChiShona', flag: '🇿🇼', tier: 2 },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي', flag: '🇵🇰', tier: 2 },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', flag: '🇱🇰', tier: 2 },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', flag: '🇸🇰', tier: 2 },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina', flag: '🇸🇮', tier: 2 },
  { code: 'so', name: 'Somali', nativeName: 'Soomaali', flag: '🇸🇴', tier: 2 },
  { code: 'st', name: 'Southern Sotho', nativeName: 'Sesotho', flag: '🇱🇸', tier: 2 },
  { code: 'su', name: 'Sundanese', nativeName: 'Basa Sunda', flag: '🇮🇩', tier: 2 },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', flag: '🇰🇪', tier: 2 },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: '🇸🇪', tier: 2 },
  { code: 'tg', name: 'Tajik', nativeName: 'Тоҷикӣ', flag: '🇹🇯', tier: 2 },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳', tier: 2 },
  { code: 'tt', name: 'Tatar', nativeName: 'Татарча', flag: '🇷🇺', tier: 2 },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳', tier: 2 },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', tier: 2 },
  { code: 'tk', name: 'Turkmen', nativeName: 'Türkmen', flag: '🇹🇲', tier: 2 },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦', tier: 2 },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', flag: '🇵🇰', tier: 2 },
  { code: 'ug', name: 'Uyghur', nativeName: 'ئۇيغۇرچە', flag: '🇨🇳', tier: 2 },
  { code: 'cy', name: 'Welsh', nativeName: 'Cymraeg', flag: '🏴', tier: 2 },
  { code: 'xh', name: 'Xhosa', nativeName: 'isiXhosa', flag: '🇿🇦', tier: 2 },
  { code: 'yi', name: 'Yiddish', nativeName: 'ייִדיש', flag: '🇮🇱', tier: 2 },
  { code: 'yo', name: 'Yorùbá', nativeName: 'Yorùbá', flag: '🇳🇬', tier: 2 },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu', flag: '🇿🇦', tier: 2 },
];

/** 기존 import 호환 — LANGUAGES_FULL와 동일 배열 */
export const LANGUAGES = LANGUAGES_FULL;

/**
 * @param {string} code
 */
export function getLanguageByCode(code) {
  return LANGUAGES_FULL.find((l) => l.code === code);
}

/**
 * 언어 항목의 리전 플래그 이모지 → ISO alpha-2 (예: ko→KR).
 * 🏴 등 비리전 플래그는 빈 문자열.
 * @param {string} langCode
 */
export function getCountryCodeByLanguage(langCode) {
  const lang = LANGUAGES_FULL.find((l) => l.code === langCode);
  if (!lang) return '';
  return regionalEmojiToAlpha2(lang.flag) || '';
}

/**
 * 리전 플래그 기준 중복 제거 국가 필터 옵션.
 * - value용: countryCode (alpha-2만)
 * - 표시용: label = `${lang.flag} ${lang.name}` — flag는 LANGUAGES_FULL 유니코드 이모지 그대로
 * @returns {{ countryCode: string, label: string }[]}
 */
export function getUniqueCountryFilterOptions() {
  /** @type {Map<string, { countryCode: string, label: string, sortKey: string }>} */
  const byAlpha = new Map();
  for (const lang of LANGUAGES_FULL) {
    const a2 = regionalEmojiToAlpha2(lang.flag);
    if (!a2) continue;
    if (!byAlpha.has(a2)) {
      const label = `${lang.flag} ${lang.name}`;
      byAlpha.set(a2, { countryCode: a2, label, sortKey: lang.name });
    }
  }
  return [...byAlpha.values()]
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'en'))
    .map(({ countryCode, label }) => ({ countryCode, label }));
}

/**
 * @param {string} langCode
 */
export function getLanguageEnglishLabel(langCode) {
  const l = getLanguageByCode(langCode);
  return l ? `${l.flag} ${l.name}` : String(langCode || '');
}

/**
 * @param {string} alpha2 ISO 3166-1 alpha-2
 * @returns {{ flag: string, nameEn: string }}
 */
export function getCountryDisplayFromAlpha2(alpha2) {
  const a2 = String(alpha2 || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(a2)) return { flag: '', nameEn: '' };
  const lang = LANGUAGES_FULL.find((l) => regionalEmojiToAlpha2(l.flag) === a2);
  const flag = lang?.flag || alpha2ToRegionalFlag(a2) || '';
  let nameEn = a2;
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    nameEn = dn.of(a2) || a2;
  } catch {
    /* ignore */
  }
  return { flag, nameEn };
}
