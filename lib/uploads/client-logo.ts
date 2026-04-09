export const CLIENT_LOGO_ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;

export const CLIENT_LOGO_ACCEPT_ATTR = CLIENT_LOGO_ALLOWED_EXTENSIONS.join(',');

export const CLIENT_LOGO_HELP_TEXT = 'Accepted formats: PNG, JPG, JPEG, WEBP.';

export const CLIENT_LOGO_INVALID_TYPE_ERROR = `Invalid file type. ${CLIENT_LOGO_HELP_TEXT}`;

export function isAllowedClientLogoExtension(ext: string) {
  return CLIENT_LOGO_ALLOWED_EXTENSIONS.includes(ext as (typeof CLIENT_LOGO_ALLOWED_EXTENSIONS)[number]);
}
