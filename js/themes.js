/**
 * Empório A.R. Beauty — Temas sazonais automáticos (por data)
 * Isolado: não altera carrinho, filtros, CEP, feed ou sync.
 *
 * Regras:
 * - Feriados / datas institucionais: só no dia (daysBefore:0, daysAfter:0)
 * - Datas de impacto comercial: janela (padrão 3 antes → 2 depois, ou sobrescrita)
 * - Natal: 01/12 até 30/12 (mês comercial de Natal)
 */
(function () {
  'use strict';

  const SEASONAL_THEMES = [
    // --- só no dia ---
    { id: 'ano-novo', month: 1, day: 1, daysBefore: 0, daysAfter: 0, label: '✨ Feliz Ano Novo no Empório A.R!', emoji: '✨' },
    { id: 'tiradentes', month: 4, day: 21, daysBefore: 0, daysAfter: 0, label: '🇧🇷 Tiradentes — Empório A.R', emoji: '🇧🇷' },
    { id: 'trabalho', month: 5, day: 1, daysBefore: 0, daysAfter: 0, label: '⚒️ Dia do Trabalho — ofertas no Empório A.R', emoji: '⚒️' },
    { id: 'sao-joao', month: 6, day: 24, daysBefore: 0, daysAfter: 0, label: '🌽 São João no Empório A.R!', emoji: '🌽' },
    { id: 'amigos', month: 7, day: 20, daysBefore: 0, daysAfter: 0, label: '🤝 Dia do Amigo — Empório A.R', emoji: '🤝' },
    { id: 'independencia', month: 9, day: 7, daysBefore: 0, daysAfter: 0, label: '🇧🇷 Independência do Brasil — Empório A.R', emoji: '🇧🇷' },
    { id: 'professores', month: 10, day: 15, daysBefore: 0, daysAfter: 0, label: '📚 Dia dos Professores — Empório A.R', emoji: '📚' },
    { id: 'finados', month: 11, day: 2, daysBefore: 0, daysAfter: 0, label: '🕯️ Finados — Empório A.R', emoji: '🕯️' },
    { id: 'republica', month: 11, day: 15, daysBefore: 0, daysAfter: 0, label: '🇧🇷 Proclamação da República — Empório A.R', emoji: '🇧🇷' },
    { id: 'consciencia-negra', month: 11, day: 20, daysBefore: 0, daysAfter: 0, label: '✊ Consciência Negra — Empório A.R', emoji: '✊' },

    // --- comércio (janela) ---
    { id: 'carnaval', month: 2, day: 17, label: '🎭 Carnaval no Empório A.R — venha se produzir!', emoji: '🎭' },
    { id: 'mulheres', month: 3, day: 8, label: '💐 Dia Internacional da Mulher — Empório A.R Beauty', emoji: '💐' },
    { id: 'consumidor', month: 3, day: 15, label: '🛍️ Dia do Consumidor — condições especiais no Empório A.R', emoji: '🛍️' },
    { id: 'pascoa', month: 4, day: 5, label: '🐰 Feliz Páscoa no Empório A.R Beauty!', emoji: '🐰' },
    { id: 'maes', month: 5, day: 10, label: '💝 Dia das Mães — o presente perfeito no Empório A.R Beauty', emoji: '💝' },
    { id: 'namorados', month: 6, day: 12, label: '💕 Dia dos Namorados — Empório A.R Beauty', emoji: '💕' },
    { id: 'pais', month: 8, day: 9, label: '👔 Dia dos Pais — Empório A.R', emoji: '👔' },
    { id: 'cliente', month: 9, day: 15, label: '🌟 Dia do Cliente — obrigado por comprar no Empório A.R!', emoji: '🌟' },
    { id: 'criancas', month: 10, day: 12, label: '🎈 Dia das Crianças — Empório A.R', emoji: '🎈' },
    { id: 'halloween', month: 10, day: 31, daysBefore: 3, daysAfter: 1, label: '🎃 Halloween no Empório A.R — ofertas assustadoras!', emoji: '🎃' },
    { id: 'black-friday', month: 11, day: 27, label: '🖤 Black Friday no Empório A.R Beauty — não perca!', emoji: '🖤' },
    { id: 'cyber-monday', month: 11, day: 30, label: '💻 Cyber Monday no Empório A.R Beauty!', emoji: '💻' },
    // Natal: 01/12 → 30/12 (âncora 25/12 → 24 dias antes, 5 dias depois)
    { id: 'natal', month: 12, day: 25, daysBefore: 24, daysAfter: 5, label: '🎄 Feliz Natal no Empório A.R Beauty!', emoji: '🎄' },
    { id: 'vira-ano', month: 12, day: 31, daysBefore: 0, daysAfter: 0, label: '🎆 Réveillon — Empório A.R!', emoji: '🎆' },
  ];

  function brazilTodayParts() {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const [y, m, d] = fmt.format(new Date()).split('-').map(Number);
    return { y, m, d };
  }

  function secondSunday(year, month1to12) {
    const first = new Date(Date.UTC(year, month1to12 - 1, 1));
    const dow = first.getUTCDay();
    const firstSun = dow === 0 ? 1 : 1 + (7 - dow);
    return firstSun + 7;
  }

  function resolveThemeDate(theme, year) {
    if (theme.id === 'maes') return { y: year, m: 5, d: secondSunday(year, 5) };
    if (theme.id === 'pais') return { y: year, m: 8, d: secondSunday(year, 8) };
    if (theme.id === 'black-friday') {
      const first = new Date(Date.UTC(year, 10, 1));
      const dow = first.getUTCDay();
      const firstThu = dow <= 4 ? 1 + (4 - dow) : 1 + (11 - dow);
      return { y: year, m: 11, d: firstThu + 21 + 1 };
    }
    if (theme.id === 'cyber-monday') {
      const bf = resolveThemeDate({ id: 'black-friday' }, year);
      return { y: year, m: 11, d: bf.d + 3 };
    }
    return { y: year, m: theme.month, d: theme.day };
  }

  function daysBetween(a, b) {
    const da = Date.UTC(a.y, a.m - 1, a.d);
    const db = Date.UTC(b.y, b.m - 1, b.d);
    return Math.round((db - da) / 86400000);
  }

  function getActiveSeasonalTheme() {
    const today = brazilTodayParts();
    let best = null;
    let bestDist = 999;
    for (const year of [today.y - 1, today.y, today.y + 1]) {
      for (const theme of SEASONAL_THEMES) {
        const event = resolveThemeDate(theme, year);
        const delta = daysBetween(event, today);
        const before = Number.isFinite(theme.daysBefore) ? theme.daysBefore : 3;
        const after = Number.isFinite(theme.daysAfter) ? theme.daysAfter : 2;
        if (delta >= -before && delta <= after) {
          const dist = Math.abs(delta);
          if (dist < bestDist) {
            bestDist = dist;
            best = theme;
          }
        }
      }
    }
    return best;
  }

  function applySeasonalTheme() {
    try {
      [...document.body.classList].forEach((c) => {
        if (c.startsWith('theme-')) document.body.classList.remove(c);
      });
      const theme = getActiveSeasonalTheme();
      const ban = document.getElementById('seasonalBanner');
      if (!theme) {
        if (ban) {
          ban.style.display = 'none';
          ban.setAttribute('aria-hidden', 'true');
        }
        return;
      }
      document.body.classList.add('theme-' + theme.id);
      if (theme.id === 'halloween') document.body.classList.add('theme-halloween');
      if (ban) {
        ban.style.display = '';
        ban.setAttribute('aria-hidden', 'false');
        ban.textContent = theme.label;
        ban.className = 'seasonal-banner theme-banner-' + theme.id;
      }
    } catch (e) {
      console.warn('seasonal theme', e);
    }
  }

  window.__emporioTheme = {
    list: SEASONAL_THEMES,
    today: brazilTodayParts,
    active: getActiveSeasonalTheme,
    apply: applySeasonalTheme,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySeasonalTheme);
  } else {
    applySeasonalTheme();
  }
})();
