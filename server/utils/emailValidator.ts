/**
 * Fixes common email typos (e.g., gmeil.com -> gmail.com)
 */
export function fixEmailTypos(email: string): string {
  if (!email) return email;
  let cleanEmail = email.toLowerCase().trim();

  // Common typo fixes for gmail
  cleanEmail = cleanEmail.replace(/@(gmeil|g-mail|gmal|gamil|gmai)\.com$/, '@gmail.com');
  // Common typo fixes for hotmail
  cleanEmail = cleanEmail.replace(/@(hotmal|hotmeil|hotmial)\.com$/, '@hotmail.com');
  // Common typo fixes for yahoo
  cleanEmail = cleanEmail.replace(/@(yaho|yahooo|yhoo)\.com$/, '@yahoo.com');

  return cleanEmail;
}

/**
 * Checks if an email is a role-based generic email (info@, support@, etc.)
 */
export function isRoleBasedEmail(email: string): boolean {
  if (!email) return false;
  const rolePrefixes = [
    'info@', 'support@', 'admin@', 'sales@', 'contact@', 
    'help@', 'billing@', 'marketing@', 'webmaster@', 'hello@'
  ];
  const cleanEmail = email.toLowerCase().trim();
  return rolePrefixes.some(prefix => cleanEmail.startsWith(prefix));
}
