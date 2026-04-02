import {getRequestConfig} from 'next-intl/server';
import {cookies} from 'next/headers';
 
export default getRequestConfig(async () => {
  // Read the locale from the cookie or default to en-IN
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value || 'en-IN';
 
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
