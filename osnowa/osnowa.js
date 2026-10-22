document.querySelectorAll('[data-screen-theme]').forEach(button => {
  button.addEventListener('click', () => {
    const theme = button.dataset.screenTheme;
    document.querySelectorAll('[data-screen-theme]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    document.querySelector('.os-screens').classList.toggle('is-dark', theme === 'dark');
    document.querySelectorAll('[data-shot]').forEach(img => {
      const url = `screenshots/${img.dataset.shot}-${theme}.png`;
      img.src = url;
      img.closest('a').href = url;
    });
  });
});
