export function getUserNextRoute(userData) {
  if (!userData) {
    return "/onboarding";
  }

  if (userData.avatarUrl) {
    return "/home";
  }

  if (!userData.facePhotoUrl) {
    return "/onboarding";
  }

  if (!Array.isArray(userData.bodyPhotoUrls) || userData.bodyPhotoUrls.length < 2) {
    return "/onboarding";
  }

  if (!userData.onboardingDone) {
    return "/onboarding";
  }

  return "/generate-model";
}

export function hasCompletedOnboarding(userData) {
  return getUserNextRoute(userData) === "/home";
}

export function isOnboardingRoute(pathname) {
  return pathname === "/onboarding" || pathname === "/generate-model";
}
