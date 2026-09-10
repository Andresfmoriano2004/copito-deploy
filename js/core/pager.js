// Copito POS — Paginador reutilizable (Fase 2).
// Se carga DESPUÉS de js/app.js y extiende la fachada global App.
// Uso: App.renderPager(el, {page, total, limit}, (nuevaPage) => ...)
// No añade CSS: reusa .btn/.btn-sm existentes.
Object.assign(App, {

  renderPager(el, meta, onGo) {
    if (!el) return;
    const total = Math.max(0, meta.total || 0);
    const limit = Math.max(1, meta.limit || 50);
    const pages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(1, meta.page || 1), pages);
    if (total <= limit) { el.innerHTML = ''; return; }
    const desde = total === 0 ? 0 : (page - 1) * limit + 1;
    const hasta = Math.min(total, page * limit);
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <span style="font-size:0.85rem;color:var(--text-muted);">${desde}–${hasta} de ${total}</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="btn btn-sm btn-secondary" data-pg="prev" type="button" ${page <= 1 ? 'disabled' : ''}>← Ant</button>
          <span style="font-size:0.85rem;font-weight:600;">${page} / ${pages}</span>
          <button class="btn btn-sm btn-secondary" data-pg="next" type="button" ${page >= pages ? 'disabled' : ''}>Sig →</button>
        </div>
      </div>`;
    el.querySelector('[data-pg="prev"]')?.addEventListener('click', () => { if (page > 1) onGo(page - 1); });
    el.querySelector('[data-pg="next"]')?.addEventListener('click', () => { if (page < pages) onGo(page + 1); });
  },

  // Paginador sobre arreglo ya cargado (filtros cliente): corta la página actual.
  paginarLista(lista, page, limit) {
    const total = lista.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const p = Math.min(Math.max(1, page || 1), pages);
    return { data: lista.slice((p - 1) * limit, p * limit), total, page: p, limit, pages };
  }
});
