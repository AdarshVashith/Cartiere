export function isFirestorePermissionDenied(error) {
  if (!error) return false;

  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message : '';

  return code === 'permission-denied' || message.toLowerCase().includes('missing or insufficient permissions');
}

export function warnFirestorePermission(scope, error) {
  if (isFirestorePermissionDenied(error)) {
    console.warn(`${scope}: Firestore permissions are blocking this read.`, error);
    return;
  }

  console.error(scope, error);
}
