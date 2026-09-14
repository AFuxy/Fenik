/**
 * Cookie-backed ephemeral flash message middleware.
 * Stores temporary notifications in an HTTP cookie that is cleared immediately upon read,
 * ensuring URLs never contain ?error=... or ?success=... query parameters.
 */
export function flashMiddleware(req, res, next) {
  let flash = { success: null, error: null };
  const raw = req.cookies?.flash_message || req.signedCookies?.flash_message;

  if (raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') {
        if (parsed.success) flash.success = String(parsed.success);
        if (parsed.error) flash.error = String(parsed.error);
        if (parsed.type === 'success' && parsed.message) flash.success = String(parsed.message);
        if (parsed.type === 'error' && parsed.message) flash.error = String(parsed.message);
      }
    } catch {
      // Ignore JSON parse errors
    }
    // Clear immediately upon read so it only displays once
    res.clearCookie('flash_message', { path: '/' });
  }

  // Attach setFlash helper to response
  res.setFlash = (typeOrObj, message) => {
    let payload = {};
    if (typeof typeOrObj === 'object' && typeOrObj !== null) {
      payload = typeOrObj;
    } else if (typeof typeOrObj === 'string') {
      if (typeOrObj === 'success') payload = { success: message };
      else if (typeOrObj === 'error') payload = { error: message };
      else payload = { [typeOrObj]: message };
    }

    res.cookie('flash_message', JSON.stringify(payload), {
      httpOnly: true,
      maxAge: 60 * 1000, // 60 seconds
      sameSite: 'lax',
      path: '/',
    });
  };

  req.flash = flash;
  res.locals = res.locals || {};
  res.locals.flash = flash;

  next();
}
