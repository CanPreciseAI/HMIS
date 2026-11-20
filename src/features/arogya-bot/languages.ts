export type ArogyaLanguage = {
  code: string;
  label: string;
  nativeLabel: string;
};

/** Languages Arogya Bot can answer and summarise in. */
export const AROGYA_LANGUAGES: ArogyaLanguage[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు" },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી" },
  { code: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو" },
];

export const AROGYA_LANGUAGE_STORAGE_KEY = "arogya-bot-language";

export function findLanguage(code: string): ArogyaLanguage {
  return (
    AROGYA_LANGUAGES.find((language) => language.code === code) ??
    AROGYA_LANGUAGES[0]!
  );
}
