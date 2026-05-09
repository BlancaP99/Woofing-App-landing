// ============================================================
//  Woofing — Cookie Consent Manager
//  Controla el banner y carga el Meta Pixel solo con consentimiento
// ============================================================

const COOKIE_KEY = 'woofing_cookie_consent';
const PIXEL_ID   = '2060550988146665';

// --- Carga el Meta Pixel ---
function loadMetaPixel() {
  if (window._pixelLoaded) return;
  window._pixelLoaded = true;

  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window,document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');

  fbq('init', PIXEL_ID);
  fbq('track', 'PageView');
}

// --- Guarda decisión y actúa ---
function setConsent(accepted) {
  localStorage.setItem(COOKIE_KEY, accepted ? 'accepted' : 'rejected');
  hideBanner();
  if (accepted) loadMetaPixel();
}

// --- Muestra / oculta el banner ---
function showBanner() {
  const banner = document.getElementById('cookie-banner');
  if (banner) {
    banner.removeAttribute('hidden');
    // Pequeño delay para que la animación de entrada funcione
    requestAnimationFrame(() => banner.classList.add('visible'));
  }
}

function hideBanner() {
  const banner = document.getElementById('cookie-banner');
  if (banner) {
    banner.classList.remove('visible');
    banner.classList.add('hiding');
    setTimeout(() => banner.setAttribute('hidden', ''), 400);
  }
}

// --- Init: comprueba si ya hay decisión guardada ---
function initCookieConsent() {
  const saved = localStorage.getItem(COOKIE_KEY);

  if (saved === 'accepted') {
    loadMetaPixel();
  } else if (saved === 'rejected') {
    // No cargamos nada, no mostramos banner
  } else {
    // Primera visita: mostramos banner
    showBanner();
  }
}

// --- Expone función para el botón "Gestionar cookies" del footer (opcional) ---
function reopenCookieBanner() {
  localStorage.removeItem(COOKIE_KEY);
  showBanner();
}

// Arrancamos cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCookieConsent);
} else {
  initCookieConsent();
}
