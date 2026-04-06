import {getRequestConfig} from 'next-intl/server';
import {cookies} from 'next/headers';
import {DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale} from '@/i18n/locales';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;

  let locale: SupportedLocale = DEFAULT_LOCALE;

  if (cookieLocale) {
    if (isSupportedLocale(cookieLocale)) {
      locale = cookieLocale;
    } else {
      console.warn(
        `[i18n] Unsupported NEXT_LOCALE cookie value "${cookieLocale}". Falling back to "${DEFAULT_LOCALE}".`
      );
    }
  }

  try {
    return {
      locale,
      messages: (await import(`../messages/${locale}.json`)).default
    };
  } catch (error) {
    console.warn(
      `[i18n] Failed to load messages for locale "${locale}". Falling back to "${DEFAULT_LOCALE}".`,
      error
    );

    return {
      locale: DEFAULT_LOCALE,
      messages: (await import(`../messages/${DEFAULT_LOCALE}.json`)).default
    };
  }
});
