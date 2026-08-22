const STYLE_ID = 'appgpt-liquid-glass-restored';

if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .glass {
      position: relative;
      isolation: isolate;
      background:
        linear-gradient(145deg, rgba(255,255,255,.115), rgba(255,255,255,.035) 42%, rgba(105,155,255,.045) 100%) !important;
      border: 1px solid rgba(255,255,255,.15) !important;
      box-shadow:
        0 26px 74px rgba(0,0,0,.30),
        inset 0 1px 0 rgba(255,255,255,.22),
        inset 0 -1px 0 rgba(255,255,255,.035) !important;
      backdrop-filter: blur(30px) saturate(1.42) brightness(1.035) !important;
      -webkit-backdrop-filter: blur(30px) saturate(1.42) brightness(1.035) !important;
    }

    .glass::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 0;
      border-radius: inherit;
      pointer-events: none;
      background:
        radial-gradient(120% 80% at 8% -12%, rgba(255,255,255,.22), transparent 42%),
        radial-gradient(90% 65% at 100% 105%, rgba(99,216,255,.08), transparent 55%);
      opacity: .92;
    }

    .glass > * { position: relative; z-index: 1; }

    .panel,
    .sidebar,
    .app-sheet {
      border-color: rgba(255,255,255,.155) !important;
    }

    .nav-item,
    .chip,
    .pill,
    .tiny-pill,
    .primary-btn,
    .secondary-btn,
    .ghost-btn,
    .icon-actions button,
    .artifact-actions button,
    .chat-card,
    .template-card,
    .provider-card,
    .issue,
    .message,
    .build-note,
    .artifact-card {
      backdrop-filter: blur(14px) saturate(1.22);
      -webkit-backdrop-filter: blur(14px) saturate(1.22);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.075);
    }

    .nav-item:hover,
    .nav-item.active,
    .chip:hover,
    .ghost-btn:hover,
    .secondary-btn:hover {
      background: linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.055)) !important;
      border-color: rgba(255,255,255,.16) !important;
    }

    .prompt-input,
    input,
    textarea,
    select {
      background: linear-gradient(145deg, rgba(5,10,20,.58), rgba(15,23,42,.48)) !important;
      border-color: rgba(255,255,255,.12) !important;
      backdrop-filter: blur(14px) saturate(1.16);
      -webkit-backdrop-filter: blur(14px) saturate(1.16);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.055);
    }

    .liquid-dock {
      background:
        linear-gradient(145deg, rgba(255,255,255,.13), rgba(12,20,37,.30) 48%, rgba(83,132,255,.075)) !important;
      border-color: rgba(255,255,255,.20) !important;
      box-shadow:
        0 18px 55px rgba(0,0,0,.28),
        inset 0 1px 0 rgba(255,255,255,.28),
        inset 0 -1px 0 rgba(255,255,255,.05) !important;
      backdrop-filter: blur(32px) saturate(1.5) brightness(1.045) !important;
      -webkit-backdrop-filter: blur(32px) saturate(1.5) brightness(1.045) !important;
    }

    .liquid-dock::after {
      content: '';
      position: absolute;
      inset: 1px;
      border-radius: inherit;
      pointer-events: none;
      z-index: 4;
      background: linear-gradient(110deg, rgba(255,255,255,.15), transparent 28%, transparent 72%, rgba(99,216,255,.075));
      mix-blend-mode: screen;
    }

    html[data-theme='light'] .glass {
      background:
        linear-gradient(145deg, rgba(255,255,255,.78), rgba(255,255,255,.46) 48%, rgba(191,224,255,.30)) !important;
      border-color: rgba(255,255,255,.84) !important;
      box-shadow:
        0 24px 66px rgba(65,91,126,.17),
        inset 0 1px 0 rgba(255,255,255,.98),
        inset 0 -1px 0 rgba(255,255,255,.34) !important;
    }

    html[data-theme='light'] .prompt-input,
    html[data-theme='light'] input,
    html[data-theme='light'] textarea,
    html[data-theme='light'] select {
      background: linear-gradient(145deg, rgba(255,255,255,.76), rgba(238,246,255,.58)) !important;
      border-color: rgba(255,255,255,.84) !important;
    }

    html[data-theme='light'] .liquid-dock {
      background: linear-gradient(145deg, rgba(255,255,255,.82), rgba(233,244,255,.52), rgba(201,232,255,.42)) !important;
      border-color: rgba(255,255,255,.90) !important;
      box-shadow: 0 18px 48px rgba(61,91,130,.18), inset 0 1px 0 rgba(255,255,255,1) !important;
    }

    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
      .glass { background: rgba(15,22,39,.94) !important; }
      html[data-theme='light'] .glass { background: rgba(247,251,255,.96) !important; }
    }
  `;
  document.head.append(style);
}
