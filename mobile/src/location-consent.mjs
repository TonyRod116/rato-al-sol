// Before publishing a build, verify that this policy is publicly accessible.
export const PRIVACY_POLICY_URL = 'https://tony-r.com/rato-al-sol/privacidad.html';

// A cancelled or superseded notice must never trigger a system permission.
export async function requestPermissionAfterNotice({ ask, requestPermission, isCurrent }) {
  const approved = await ask();
  if (!approved || !isCurrent()) return null;
  return requestPermission();
}
