(() => {
  const copy = {
    pl: {headline:'Co chcesz dziś<br><span>mieć z głowy?</span>',all:'Wszystkie',work:'Praca',money:'Finanse',daily:'Codzienność',care:'Opieka',features:'Możliwości',galleryHint:'Przewiń galerię →'},
    en: {headline:'What would you like<br><span>off your mind today?</span>',all:'All',work:'Work',money:'Money',daily:'Everyday',care:'Care',features:'Features',galleryHint:'Scroll through the screens →'},
    uk: {headline:'Про що сьогодні<br><span>хочете менше турбуватися?</span>',all:'Усі',work:'Робота',money:'Фінанси',daily:'Щоденне',care:'Догляд',features:'Можливості',galleryHint:'Гортайте галерею →'}
  };
  function translate() {
    const lang = document.documentElement.lang;
    document.querySelectorAll('[data-catalog]').forEach(el => { el.innerHTML = (copy[lang] || copy.pl)[el.dataset.catalog]; });
    document.querySelectorAll('.product-gallery').forEach(el => el.setAttribute('aria-label',lang==='en'?'App screenshots':lang==='uk'?'Екрани застосунку':'Ekrany aplikacji'));
    document.querySelectorAll('.catalog-filters').forEach(el => el.setAttribute('aria-label',lang==='en'?'App categories':lang==='uk'?'Категорії застосунків':'Kategorie aplikacji'));
  }
  translate();
  new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  const filters = document.querySelectorAll('[data-filter]');
  filters.forEach(button => button.addEventListener('click', () => {
    filters.forEach(item => item.setAttribute('aria-pressed',String(item===button)));
    document.querySelectorAll('[data-category]').forEach(item => { item.hidden=button.dataset.filter!=='all' && item.dataset.category!==button.dataset.filter; });
  }));
})();
