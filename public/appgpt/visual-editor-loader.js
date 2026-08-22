import './visual-editor-pro.js';

if (!document.querySelector('link[data-appgpt-visual-pro]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './visual-editor-pro.css';
  link.dataset.appgptVisualPro = 'true';
  document.head.append(link);
}
