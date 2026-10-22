(() => {
  let theme = 'system';
  try {
    const settings = JSON.parse(localStorage.getItem('wenwu-settings-v1') || 'null');
    if (settings && ['light', 'dark', 'system'].includes(settings.theme)) theme = settings.theme;
  } catch { /* The initial page can still follow the browser color preference. */ }
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
})();
