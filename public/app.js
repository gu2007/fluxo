/* Fluxo — front-end (JavaScript puro, sem framework). */
(() => {
  'use strict';

  // ============ utilidades ============
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
  };

  const S = {
    hoje: new Date().toISOString().slice(0, 10),
    mes: null,
    oculto: store.get('fluxo.oculto', false),
    charts: [],
  };

  const brl = (c, forcarVisivel) => (S.oculto && !forcarVisivel ? 'R$ ••••' : fmt.format((c || 0) / 100));
  const valorInput = (c) => ((c || 0) / 100).toFixed(2).replace('.', ',');
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MESES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const nomeMes = (m) => { const [a, mm] = m.split('-').map(Number); return `${MESES[mm - 1]} ${a}`; };
  const mesCurto = (m) => { const [a, mm] = m.split('-').map(Number); return `${MESES_C[mm - 1]}/${String(a).slice(2)}`; };
  const somaMes = (m, n) => { const [a, mm] = m.split('-').map(Number); const t = a * 12 + mm - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  const dataBR = (d) => d.split('-').reverse().join('/');
  const diaSemana = (d) => {
    const dt = new Date(d + 'T12:00:00');
    if (d === S.hoje) return 'Hoje';
    const ontem = new Date(S.hoje + 'T12:00:00'); ontem.setDate(ontem.getDate() - 1);
    if (d === ontem.toISOString().slice(0, 10)) return 'Ontem';
    return dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
  };

  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    let data = {};
    try { data = await res.json(); } catch { /* vazio */ }
    if (res.status === 401 && !path.startsWith('/login') && !path.startsWith('/setup')) { mostrarAuth(); throw new Error(data.erro || 'Sessão expirada'); }
    if (!res.ok) throw new Error(data.erro || 'Algo deu errado.');
    return data;
  }

  function toast(msg, erro) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast' + (erro ? ' erro' : ''); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
  }

  // ============ ícones ============
  const svg = (p) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const IC = {
    painel: svg('<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>'),
    lanc: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
    cartao: svg('<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>'),
    rel: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    contas: svg('<path d="M3 10 12 4l9 6M5 10v9M19 10v9M9 10v9M15 10v9M3 21h18"/>'),
    cat: svg('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
    orc: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/>'),
    mais: svg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
    ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  };

  // ============ navegação ============
  const ROTAS = {
    painel: { titulo: 'Painel', ic: 'painel', mes: true, render: viewPainel },
    lancamentos: { titulo: 'Lançamentos', ic: 'lanc', mes: true, render: viewLancamentos },
    cartoes: { titulo: 'Cartões', ic: 'cartao', mes: false, render: viewCartoes },
    cartao: { titulo: 'Fatura', mes: false, render: viewFatura },
    relatorios: { titulo: 'Relatórios', ic: 'rel', mes: true, render: viewRelatorios },
    contas: { titulo: 'Contas', ic: 'contas', mes: false, render: viewContas },
    orcamentos: { titulo: 'Orçamentos', ic: 'orc', mes: true, render: viewOrcamentos },
    categorias: { titulo: 'Categorias', ic: 'cat', mes: false, render: viewCategorias },
    ajustes: { titulo: 'Ajustes', ic: 'ajustes', mes: false, render: viewAjustes },
    mais: { titulo: 'Mais', ic: 'mais', mes: false, render: viewMais },
  };
  const NAV_LATERAL = ['painel', 'lancamentos', 'cartoes', 'contas', 'relatorios', 'orcamentos', 'categorias', 'ajustes'];
  const NAV_TAB = ['painel', 'lancamentos', null, 'cartoes', 'mais'];

  function montarNav() {
    $('#side-nav').innerHTML = NAV_LATERAL.map((k) => `<a href="#/${k}" data-r="${k}">${IC[ROTAS[k].ic]}<span>${ROTAS[k].titulo}</span></a>`).join('');
    $('#tabbar').innerHTML = NAV_TAB.map((k) => (k ? `<a href="#/${k}" data-r="${k}">${IC[ROTAS[k].ic]}<span>${ROTAS[k].titulo}</span></a>` : '<span class="vago"></span>')).join('');
  }

  function rotaAtual() {
    const [nome, arg] = location.hash.replace(/^#\/?/, '').split('/');
    return { nome: ROTAS[nome] ? nome : 'painel', arg };
  }

  async function render() {
    const { nome, arg } = rotaAtual();
    const R = ROTAS[nome];
    const grupo = { cartao: 'cartoes', contas: 'mais', orcamentos: 'mais', categorias: 'mais', ajustes: 'mais', relatorios: 'mais' };
    $$('#side-nav a').forEach((a) => a.classList.toggle('ativo', a.dataset.r === nome || (nome === 'cartao' && a.dataset.r === 'cartoes')));
    $$('#tabbar a').forEach((a) => a.classList.toggle('ativo', a.dataset.r === nome || a.dataset.r === grupo[nome]));
    $('#titulo').textContent = R.titulo;
    $('#mes-nav').hidden = !R.mes;
    $('#mes-label').textContent = nomeMes(S.mes);
    S.charts.forEach((c) => c.destroy()); S.charts = [];
    const view = $('#view');
    try {
      await R.render(view, arg);
    } catch (e) {
      if (e.message !== 'Sessão expirada') view.innerHTML = `<div class="card vazio"><span class="grande">⚠️</span>${esc(e.message)}</div>`;
    }
  }

  // ============ componentes ============
  function itemTransacao(t, opts = {}) {
    const ehReceita = t.tipo === 'receita';
    const ehTransf = t.tipo === 'transferencia';
    const ehFatura = t.tipo === 'pagamento_fatura';
    const icone = ehTransf ? '⇄' : ehFatura ? '💳' : (t.cat_icone || '📦');
    const corFundo = ehTransf || ehFatura ? 'var(--bg)' : `${t.cat_cor || '#94A3B8'}22`;
    let sub = ehTransf ? `${esc(t.conta_nome)} → ${esc(t.conta_destino_nome)}`
      : t.cartao_id ? `${esc(t.cat_nome || 'Sem categoria')} · ${esc(t.cartao_nome)}`
      : `${esc(t.cat_nome || (ehFatura ? 'Pagamento de fatura' : 'Sem categoria'))} · ${esc(t.conta_nome || '')}`;
    if (opts.comData) sub = `${dataBR(t.data)} · ${sub}`;
    const parc = t.total_parcelas ? `<span class="tag">${t.parcela}/${t.total_parcelas}</span>` : '';
    const pend = !t.pago ? '<span class="tag warn">pendente</span>' : '';
    const sinal = ehReceita ? '+' : ehTransf ? '' : '−';
    const cls = ehReceita ? 'pos' : ehTransf ? '' : 'neg';
    return `<div class="item clic" data-tx="${t.id}">
      <div class="avatar" style="background:${corFundo}">${esc(icone)}</div>
      <div class="item-main"><div class="item-tit">${esc(t.descricao || t.cat_nome || 'Lançamento')}${parc}${pend}</div><div class="item-sub">${sub}</div></div>
      <div class="item-val ${cls}">${sinal} ${brl(t.valor, true)}</div>
    </div>`;
  }

  function ligarTransacoes(el, lista) {
    $$('[data-tx]', el).forEach((n) => n.addEventListener('click', () => {
      const t = lista.find((x) => x.id === Number(n.dataset.tx));
      if (t) abrirLancamento(t);
    }));
  }

  const vazio = (emoji, msg) => `<div class="vazio"><span class="grande">${emoji}</span>${msg}</div>`;

  function barraOrc(o) {
    const p = o.valor ? Math.round((o.gasto / o.valor) * 100) : 0;
    const cls = p > 100 ? 'estourou' : p >= 80 ? 'alto' : '';
    return `<div class="item clic" data-orc="${o.categoria_id}">
      <div class="avatar" style="background:${o.cor}22">${esc(o.icone)}</div>
      <div class="item-main"><div class="item-tit">${esc(o.nome)}</div>
        <div class="item-sub">${brl(o.gasto, true)} de ${brl(o.valor, true)}</div>
        <div class="barra"><i class="${cls}" style="width:${Math.min(p, 100)}%"></i></div></div>
      <div class="item-val ${p > 100 ? 'neg' : ''}">${p}%<small>${o.valor - o.gasto >= 0 ? 'resta ' + brl(o.valor - o.gasto, true) : 'passou ' + brl(o.gasto - o.valor, true)}</small></div>
    </div>`;
  }

  function cartaoVisual(c) {
    const p = c.limite ? Math.min(100, Math.round((c.limite_usado / c.limite) * 100)) : 0;
    return `<div class="cc" data-cc="${c.id}" style="background:linear-gradient(135deg, ${c.cor} 0%, ${c.cor}CC 100%)">
      <div class="cc-top"><span>${esc(c.nome)}</span><span>${c.fatura_atual_paga ? 'paga ✓' : 'fatura ' + mesCurto(c.fatura_atual)}</span></div>
      <div><small style="opacity:.8;position:relative">Fatura atual</small><div class="cc-valor">${brl(c.fatura_atual_total)}</div></div>
      <div class="cc-info"><span>Vence ${dataBR(c.fatura_atual_vencimento).slice(0, 5)}</span><span>Disponível ${brl(c.limite_disponivel)}</span></div>
      ${c.limite ? `<div class="barra"><i style="width:${p}%"></i></div>` : ''}
    </div>`;
  }

  function graficoRosca(canvas, dados) {
    if (!window.Chart || !dados.length) return;
    S.charts.push(new Chart(canvas, {
      type: 'doughnut',
      data: { labels: dados.map((d) => d.nome), datasets: [{ data: dados.map((d) => d.total / 100), backgroundColor: dados.map((d) => d.cor), borderWidth: 0, hoverOffset: 6 }] },
      options: { cutout: '68%', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmt.format(c.raw)}` } } } },
    }));
  }

  function legendaCategorias(dados) {
    const total = dados.reduce((s, d) => s + d.total, 0) || 1;
    return `<div class="legenda">${dados.map((d) => `<div class="item">
      <div class="avatar" style="background:${d.cor}22">${esc(d.icone)}</div>
      <div class="item-main"><div class="item-tit">${esc(d.nome)}</div><div class="barra"><i style="width:${(d.total / total) * 100}%;background:${d.cor}"></i></div></div>
      <div class="item-val">${brl(d.total, true)}<small>${Math.round((d.total / total) * 100)}%</small></div></div>`).join('')}</div>`;
  }

  // ============ telas ============
  async function viewPainel(el) {
    const d = await api(`/dashboard?mes=${S.mes}`);
    const { totais } = d;
    const balanco = totais.receitas - totais.despesas;
    el.innerHTML = `
      <section class="hero">
        <div><div class="hero-label">Saldo em contas <button class="olho" id="olho">${S.oculto ? '👁‍🗨' : '👁'}</button></div>
          <div class="hero-valor">${brl(d.saldo_total)}</div></div>
        <div class="hero-row">
          <div class="hero-pill"><span class="dot in">↑</span><div><small>Receitas</small><b>${brl(totais.receitas)}</b></div></div>
          <div class="hero-pill"><span class="dot out">↓</span><div><small>Despesas</small><b>${brl(totais.despesas)}</b></div></div>
        </div>
      </section>

      <div class="grid-2">
        <div class="card"><h2>Despesas por categoria <a class="link" href="#/relatorios">Ver mais</a></h2>
          ${d.despesas_por_categoria.length ? `<div class="chart-box" style="height:200px"><canvas id="ch-cat"></canvas></div>${legendaCategorias(d.despesas_por_categoria.slice(0, 5))}` : vazio('🥳', 'Nenhuma despesa neste mês.')}
        </div>
        <div style="display:grid;gap:18px;align-content:start">
          <div class="card"><h2>Balanço do mês</h2>
            <div class="item-val ${balanco >= 0 ? 'pos' : 'neg'}" style="text-align:left;font-size:26px">${balanco >= 0 ? '+' : '−'} ${brl(Math.abs(balanco))}</div>
            ${totais.receitas_pendentes || totais.despesas_pendentes ? `<div class="item-sub" style="margin-top:4px">A receber ${brl(totais.receitas_pendentes)} · A pagar ${brl(totais.despesas_pendentes)}</div>` : ''}
          </div>
          <div class="card"><h2>Contas <a class="link" href="#/contas">Gerenciar</a></h2>
            <div class="lista">${d.contas.length ? d.contas.map((c) => `<div class="item"><div class="avatar" style="background:${c.cor}22;color:${c.cor}">${IC.contas}</div><div class="item-main"><div class="item-tit">${esc(c.nome)}</div><div class="item-sub">${tipoConta(c.tipo)}</div></div><div class="item-val ${c.saldo < 0 ? 'neg' : ''}">${brl(c.saldo)}</div></div>`).join('') : vazio('🏦', 'Cadastre sua primeira conta para começar.<br><br><button class="btn btn-primary" id="nova-conta">Adicionar conta</button>')}</div>
          </div>
        </div>
      </div>

      ${d.cartoes.length ? `<div class="card"><h2>Cartões de crédito <a class="link" href="#/cartoes">Ver todos</a></h2><div class="grid-3">${d.cartoes.map(cartaoVisual).join('')}</div></div>` : ''}

      <div class="grid-2">
        <div class="card"><h2>Contas a pagar/receber</h2><div class="lista" id="pend">${d.pendentes.length ? d.pendentes.map((t) => itemTransacao(t, { comData: true })).join('') : vazio('✅', 'Nada pendente até o fim do mês.')}</div></div>
        <div class="card"><h2>Últimos lançamentos <a class="link" href="#/lancamentos">Ver todos</a></h2><div class="lista" id="ult">${d.ultimas.length ? d.ultimas.map((t) => itemTransacao(t, { comData: true })).join('') : vazio('📝', 'Toque em ＋ para lançar.')}</div></div>
      </div>

      ${d.orcamentos.length ? `<div class="card"><h2>Orçamentos do mês <a class="link" href="#/orcamentos">Editar</a></h2><div class="lista">${d.orcamentos.map(barraOrc).join('')}</div></div>` : ''}
    `;
    $('#olho').onclick = () => { S.oculto = !S.oculto; store.set('fluxo.oculto', S.oculto); render(); };
    const nc = $('#nova-conta'); if (nc) nc.onclick = () => abrirConta();
    graficoRosca($('#ch-cat'), d.despesas_por_categoria);
    ligarTransacoes($('#pend'), d.pendentes);
    ligarTransacoes($('#ult'), d.ultimas);
    $$('[data-cc]', el).forEach((n) => (n.onclick = () => (location.hash = `#/cartao/${n.dataset.cc}`)));
    $$('[data-orc]', el).forEach((n) => (n.onclick = () => (location.hash = '#/orcamentos')));
  }

  S.filtro = { tipo: '', busca: '' };
  async function viewLancamentos(el) {
    const q = new URLSearchParams({ mes: S.mes });
    if (S.filtro.tipo === 'pendentes') q.set('pendentes', '1'); else if (S.filtro.tipo) q.set('tipo', S.filtro.tipo);
    if (S.filtro.busca) q.set('busca', S.filtro.busca);
    const lista = await api(`/transacoes?${q}`);
    const rec = lista.filter((t) => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
    const des = lista.filter((t) => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
    const porDia = {};
    lista.forEach((t) => (porDia[t.data] = porDia[t.data] || []).push(t));
    const filtros = [['', 'Todos'], ['despesa', 'Despesas'], ['receita', 'Receitas'], ['transferencia', 'Transferências'], ['pendentes', 'Pendentes']];
    el.innerHTML = `
      <div class="chips">${filtros.map(([k, n]) => `<button class="chip ${S.filtro.tipo === k ? 'ativo' : ''}" data-f="${k}">${n}</button>`).join('')}</div>
      <input id="busca" type="search" placeholder="Buscar pela descrição…" value="${esc(S.filtro.busca)}">
      <div class="resumo">
        <div><small>Receitas</small><b class="pos">${brl(rec, true)}</b></div>
        <div><small>Despesas</small><b class="neg">${brl(des, true)}</b></div>
        <div><small>Balanço</small><b class="${rec - des >= 0 ? 'pos' : 'neg'}">${brl(rec - des, true)}</b></div>
      </div>
      <div class="card" id="lst">${lista.length ? Object.entries(porDia).map(([dia, ts]) => `<div class="dia">${diaSemana(dia)}</div><div class="lista">${ts.map((t) => itemTransacao(t)).join('')}</div>`).join('') : vazio('🔍', 'Nenhum lançamento neste mês com esse filtro.')}</div>
      <a class="link" href="/api/exportar.csv" style="justify-self:center">⬇ Exportar tudo em planilha (CSV)</a>`;
    $$('[data-f]', el).forEach((b) => (b.onclick = () => { S.filtro.tipo = b.dataset.f; render(); }));
    const busca = $('#busca');
    busca.oninput = () => { clearTimeout(busca.t); busca.t = setTimeout(() => { S.filtro.busca = busca.value.trim(); render().then(() => { const b = $('#busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }); }, 350); };
    ligarTransacoes($('#lst'), lista);
  }

  async function viewCartoes(el) {
    const cartoes = await api('/cartoes');
    el.innerHTML = `
      ${cartoes.length ? `<div class="grid-3">${cartoes.map(cartaoVisual).join('')}</div>` : `<div class="card">${vazio('💳', 'Nenhum cartão cadastrado ainda.')}</div>`}
      <button class="btn btn-primary" id="novo-cc" style="justify-self:start">＋ Adicionar cartão</button>`;
    $$('[data-cc]', el).forEach((n) => (n.onclick = () => (location.hash = `#/cartao/${n.dataset.cc}`)));
    $('#novo-cc').onclick = () => abrirCartao();
  }

  S.faturaMes = {};
  async function viewFatura(el, id) {
    const q = S.faturaMes[id] ? `?mes=${S.faturaMes[id]}` : '';
    const f = await api(`/cartoes/${id}/fatura${q}`);
    S.faturaMes[id] = f.mes;
    $('#titulo').textContent = f.cartao.nome;
    el.innerHTML = `
      <div class="mes-nav" style="justify-self:start">
        <button class="icon-btn" data-fm="-1">‹</button><span class="mes-label">Fatura ${nomeMes(f.mes)}</span><button class="icon-btn" data-fm="1">›</button>
      </div>
      <section class="hero" style="background:linear-gradient(135deg, ${f.cartao.cor} 0%, ${f.cartao.cor}BB 100%)">
        <div><div class="hero-label" style="color:#ffffffcc">${f.paga ? 'Fatura paga ✓' : 'Total da fatura'}</div><div class="hero-valor">${brl(f.total, true)}</div></div>
        <div class="hero-row">
          <div class="hero-pill"><div><small style="color:#ffffffbb">Fecha em</small><b>${dataBR(f.fechamento)}</b></div></div>
          <div class="hero-pill"><div><small style="color:#ffffffbb">Vence em</small><b>${dataBR(f.vencimento)}</b></div></div>
        </div>
      </section>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${!f.paga && f.total > 0 ? '<button class="btn btn-primary" id="pagar">Pagar fatura</button>' : ''}
        <button class="btn btn-ghost" id="edit-cc">Editar cartão</button>
        <a class="btn btn-ghost" href="#/cartoes" style="text-decoration:none">Voltar</a>
      </div>
      <div class="card"><h2>Compras nesta fatura <span class="item-sub">${f.itens.length} ${f.itens.length === 1 ? 'item' : 'itens'}</span></h2>
        <div class="lista" id="itens">${f.itens.length ? f.itens.map((t) => itemTransacao({ ...t, cartao_nome: f.cartao.nome }, { comData: true })).join('') : vazio('🧾', 'Nenhuma compra nesta fatura.')}</div></div>`;
    $$('[data-fm]', el).forEach((b) => (b.onclick = () => { S.faturaMes[id] = somaMes(f.mes, Number(b.dataset.fm)); render(); }));
    $('#edit-cc').onclick = () => abrirCartao(f.cartao);
    const pg = $('#pagar'); if (pg) pg.onclick = () => abrirPagarFatura(f);
    ligarTransacoes($('#itens'), f.itens.map((t) => ({ ...t, cartao_nome: f.cartao.nome })));
  }

  async function viewRelatorios(el) {
    const d = await api(`/relatorios?mes=${S.mes}&meses=6`);
    el.innerHTML = `
      <div class="card"><h2>Receitas x despesas (6 meses)</h2><div class="chart-box"><canvas id="ch-bar"></canvas></div></div>
      <div class="grid-2">
        <div class="card"><h2>Para onde foi o dinheiro</h2>${d.despesas_por_categoria.length ? `<div class="chart-box" style="height:200px"><canvas id="ch-d"></canvas></div>${legendaCategorias(d.despesas_por_categoria)}` : vazio('📊', 'Sem despesas no período.')}</div>
        <div class="card"><h2>De onde veio o dinheiro</h2>${d.receitas_por_categoria.length ? `<div class="chart-box" style="height:200px"><canvas id="ch-r"></canvas></div>${legendaCategorias(d.receitas_por_categoria)}` : vazio('📊', 'Sem receitas no período.')}</div>
      </div>`;
    if (window.Chart) {
      const escuro = matchMedia('(prefers-color-scheme: dark)').matches;
      const grade = escuro ? '#1F3549' : '#E4E8EE', texto = escuro ? '#8DA0B3' : '#6A7889';
      S.charts.push(new Chart($('#ch-bar'), {
        type: 'bar',
        data: {
          labels: d.meses.map((m) => mesCurto(m.mes)),
          datasets: [
            { label: 'Receitas', data: d.meses.map((m) => m.receitas / 100), backgroundColor: '#12B886', borderRadius: 6, maxBarThickness: 26 },
            { label: 'Despesas', data: d.meses.map((m) => m.despesas / 100), backgroundColor: '#F0546A', borderRadius: 6, maxBarThickness: 26 },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: texto, usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt.format(c.raw)}` } } },
          scales: { x: { grid: { display: false }, ticks: { color: texto } }, y: { grid: { color: grade }, border: { display: false }, ticks: { color: texto, callback: (v) => 'R$ ' + v.toLocaleString('pt-BR') } } },
        },
      }));
    }
    graficoRosca($('#ch-d'), d.despesas_por_categoria);
    graficoRosca($('#ch-r'), d.receitas_por_categoria);
  }

  const tipoConta = (t) => ({ corrente: 'Conta corrente', poupanca: 'Poupança', carteira: 'Dinheiro / carteira', investimento: 'Investimento' }[t] || t);

  async function viewContas(el) {
    const contas = await api('/contas');
    const total = contas.filter((c) => !c.arquivada).reduce((s, c) => s + c.saldo, 0);
    el.innerHTML = `
      <section class="hero"><div><div class="hero-label">Saldo total</div><div class="hero-valor">${brl(total)}</div></div></section>
      <div class="card"><div class="lista" id="lc">${contas.length ? contas.map((c) => `<div class="item clic" data-c="${c.id}" style="${c.arquivada ? 'opacity:.55' : ''}">
        <div class="avatar" style="background:${c.cor}22;color:${c.cor}">${IC.contas}</div>
        <div class="item-main"><div class="item-tit">${esc(c.nome)}${c.arquivada ? '<span class="tag">arquivada</span>' : ''}</div><div class="item-sub">${tipoConta(c.tipo)}</div></div>
        <div class="item-val ${c.saldo < 0 ? 'neg' : ''}">${brl(c.saldo)}</div></div>`).join('') : vazio('🏦', 'Nenhuma conta ainda.')}</div></div>
      <button class="btn btn-primary" id="nova" style="justify-self:start">＋ Adicionar conta</button>`;
    $$('[data-c]', el).forEach((n) => (n.onclick = () => abrirConta(contas.find((c) => c.id === Number(n.dataset.c)))));
    $('#nova').onclick = () => abrirConta();
  }

  async function viewOrcamentos(el) {
    const [orcs, cats] = await Promise.all([api(`/orcamentos?mes=${S.mes}`), api('/categorias')]);
    const total = orcs.reduce((s, o) => s + o.valor, 0), gasto = orcs.reduce((s, o) => s + o.gasto, 0);
    el.innerHTML = `
      ${orcs.length ? `<div class="resumo"><div><small>Planejado</small><b>${brl(total, true)}</b></div><div><small>Gasto</small><b class="neg">${brl(gasto, true)}</b></div><div><small>Resta</small><b class="${total - gasto >= 0 ? 'pos' : 'neg'}">${brl(total - gasto, true)}</b></div></div>` : ''}
      <div class="card"><h2>Limites por categoria</h2><div class="lista">${orcs.length ? orcs.map(barraOrc).join('') : vazio('🎯', 'Defina quanto quer gastar por mês em cada categoria.')}</div></div>
      <button class="btn btn-primary" id="novo" style="justify-self:start">＋ Definir limite</button>`;
    const abrir = (catId) => {
      const o = orcs.find((x) => x.categoria_id === catId);
      abrirSheet(`<h3>Limite mensal</h3><form id="f">
        <label>Categoria<select name="categoria_id">${cats.filter((c) => c.tipo === 'despesa').map((c) => `<option value="${c.id}" ${c.id === catId ? 'selected' : ''}>${esc(c.icone)} ${esc(c.nome)}</option>`).join('')}</select></label>
        <label>Quanto posso gastar por mês<input name="valor" inputmode="decimal" placeholder="0,00" value="${o ? valorInput(o.valor) : ''}" required></label>
        <p class="form-erro" id="fe"></p>
        <div class="sheet-acoes">${o ? '<button type="button" class="btn btn-danger" id="rm">Remover</button>' : ''}<button class="btn btn-primary">Salvar</button></div></form>`);
      $('#f').onsubmit = enviar('#f', async (v) => { await api('/orcamentos', { method: 'PUT', body: v }); });
      const rm = $('#rm'); if (rm) rm.onclick = async () => { await api('/orcamentos', { method: 'PUT', body: { categoria_id: catId, valor: '0' } }); fecharSheet(); toast('Limite removido'); render(); };
    };
    $$('[data-orc]', el).forEach((n) => (n.onclick = () => abrir(Number(n.dataset.orc))));
    $('#novo').onclick = () => abrir(null);
  }

  async function viewCategorias(el) {
    const cats = await api('/categorias');
    const bloco = (tipo, tit) => `<div class="card"><h2>${tit}</h2><div class="lista">${cats.filter((c) => c.tipo === tipo).map((c) => `<div class="item clic" data-k="${c.id}"><div class="avatar" style="background:${c.cor}22">${esc(c.icone)}</div><div class="item-main"><div class="item-tit">${esc(c.nome)}</div></div><span style="width:12px;height:12px;border-radius:50%;background:${c.cor}"></span></div>`).join('')}</div></div>`;
    el.innerHTML = `<div class="grid-2">${bloco('despesa', 'Despesas')}${bloco('receita', 'Receitas')}</div>
      <button class="btn btn-primary" id="nova" style="justify-self:start">＋ Nova categoria</button>`;
    $$('[data-k]', el).forEach((n) => (n.onclick = () => abrirCategoria(cats.find((c) => c.id === Number(n.dataset.k)))));
    $('#nova').onclick = () => abrirCategoria();
  }

  async function viewAjustes(el) {
    el.innerHTML = `
      <div class="card"><h2>Trocar senha</h2>
        <form id="fs"><label>Senha atual<input type="password" name="atual" autocomplete="current-password" required></label>
        <label>Nova senha<input type="password" name="nova" autocomplete="new-password" minlength="6" required></label>
        <p class="form-erro" id="fe"></p><button class="btn btn-primary" style="justify-self:start">Salvar nova senha</button></form></div>
      <div class="card"><h2>Seus dados</h2><p class="item-sub" style="white-space:normal">Baixe todos os lançamentos numa planilha que abre no Excel ou Google Sheets.</p>
        <a class="btn btn-ghost" href="/api/exportar.csv" style="text-decoration:none;display:inline-block">⬇ Exportar CSV</a></div>
      <div class="card"><h2>Instalar no celular</h2><p class="item-sub" style="white-space:normal">No Chrome do Android: menu ⋮ → <b>Adicionar à tela inicial</b>. No iPhone (Safari): botão compartilhar → <b>Adicionar à Tela de Início</b>. Ele abre como um app, sem barra do navegador.</p></div>
      <button class="btn btn-danger" id="sair2" style="justify-self:start">Sair da conta</button>`;
    $('#fs').onsubmit = enviar('#fs', async (v) => { await api('/senha', { method: 'POST', body: v }); }, 'Senha alterada', false);
    $('#sair2').onclick = sair;
  }

  async function viewMais(el) {
    const itens = [['contas', 'Contas', 'Bancos, carteira e saldos'], ['relatorios', 'Relatórios', 'Gráficos dos últimos meses'], ['orcamentos', 'Orçamentos', 'Limites de gasto por categoria'], ['categorias', 'Categorias', 'Organize seus gastos'], ['ajustes', 'Ajustes', 'Senha, exportar, instalar']];
    el.innerHTML = `<div class="mais-grid">${itens.map(([k, n, d]) => `<a href="#/${k}"><span style="color:var(--mint-2)">${IC[ROTAS[k].ic]}</span>${n}<small>${d}</small></a>`).join('')}</div>`;
  }

  // ============ folhas (formulários) ============
  function abrirSheet(html) {
    $('#sheet-body').innerHTML = html;
    $('#sheet-bg').hidden = false;
    document.body.style.overflow = 'hidden';
    const primeiro = $('#sheet-body [autofocus]');
    if (primeiro && matchMedia('(min-width: 861px)').matches) setTimeout(() => primeiro.focus(), 50);
  }
  function fecharSheet() { $('#sheet-bg').hidden = true; document.body.style.overflow = ''; }
  $('#sheet-bg').addEventListener('click', (e) => { if (e.target.id === 'sheet-bg') fecharSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharSheet(); });

  // Envia um formulário: junta os campos, chama `fn`, mostra erro ou fecha e recarrega a tela.
  function enviar(sel, fn, msg = 'Salvo!', fechar = true) {
    return async (e) => {
      e.preventDefault();
      const form = $(sel), btn = $('button:not([type=button])', form), err = $('.form-erro', form);
      const v = Object.fromEntries(new FormData(form));
      $$('input[type=checkbox]', form).forEach((c) => (v[c.name] = c.checked));
      btn.disabled = true; err.textContent = '';
      try {
        await fn(v);
        if (fechar) fecharSheet(); else form.reset();
        toast(msg); render();
      } catch (ex) { err.textContent = ex.message; } finally { btn.disabled = false; }
    };
  }

  const PALETA = ['#12B886', '#0EA5E9', '#5B4BDB', '#8B5CF6', '#EC4899', '#F0546A', '#F97316', '#EAB308', '#22C55E', '#0B1B2B', '#64748B', '#820AD1'];
  const seletorCores = (atual) => `<div class="cores">${PALETA.map((c) => `<label><input type="radio" name="cor" value="${c}" ${c.toLowerCase() === (atual || PALETA[0]).toLowerCase() ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div>`;

  async function abrirLancamento(t, tipoInicial = 'despesa') {
    const [contas, cats, cartoes] = await Promise.all([api('/contas'), api('/categorias'), api('/cartoes')]);
    const ativas = contas.filter((c) => !c.arquivada);
    if (!ativas.length) { toast('Cadastre uma conta antes de lançar.', true); location.hash = '#/contas'; return abrirConta(); }
    if (t && t.tipo === 'pagamento_fatura') {
      abrirSheet(`<h3>Pagamento de fatura</h3><div class="lista">${itemTransacao(t, { comData: true })}</div>
        <p class="item-sub" style="white-space:normal">Apagar este pagamento faz a fatura voltar a ficar em aberto.</p>
        <div class="sheet-acoes"><button class="btn btn-danger" id="del">Apagar pagamento</button><button class="btn" id="cx">Fechar</button></div>`);
      $('#cx').onclick = fecharSheet;
      $('#del').onclick = async () => { await api(`/transacoes/${t.id}`, { method: 'DELETE' }); fecharSheet(); toast('Pagamento apagado'); render(); };
      return;
    }
    const ed = !!t;
    let tipo = t ? t.tipo : tipoInicial;
    const hoje = S.mes === S.hoje.slice(0, 7) ? S.hoje : `${S.mes}-01`;

    const origemAtual = t ? (t.cartao_id ? `k${t.cartao_id}` : `c${t.conta_id}`) : (store.get('fluxo.origem', '') || `c${ativas[0].id}`);
    const opcoesOrigem = (comCartao) =>
      `<optgroup label="Contas">${ativas.map((c) => `<option value="c${c.id}">${esc(c.nome)}</option>`).join('')}</optgroup>` +
      (comCartao && cartoes.length ? `<optgroup label="Cartões de crédito">${cartoes.map((c) => `<option value="k${c.id}">💳 ${esc(c.nome)}</option>`).join('')}</optgroup>` : '');

    abrirSheet(`
      <h3>${ed ? 'Editar lançamento' : 'Novo lançamento'}</h3>
      <form id="ft">
        <div class="seg">${['despesa', 'receita', 'transferencia'].map((k) => `<button type="button" data-tipo="${k}">${{ despesa: 'Despesa', receita: 'Receita', transferencia: 'Transferência' }[k]}</button>`).join('')}</div>
        <div class="valor-box" id="vb"><small>Valor</small>
          <input class="input-valor" name="valor" inputmode="decimal" placeholder="0,00" autocomplete="off" required autofocus value="${t ? valorInput(t.valor) : ''}"></div>
        <label>Descrição<input name="descricao" maxlength="120" placeholder="Ex.: gasolina, semana do iFood…" value="${esc(t?.descricao || '')}"></label>
        <div class="row">
          <label>Data<input type="date" name="data" required value="${t ? t.data : hoje}"></label>
          <label id="l-cat">Categoria<select name="categoria_id"></select></label>
        </div>
        <label id="l-orig"><span id="t-orig">Conta</span><select name="origem"></select></label>
        <label id="l-dest">Para a conta<select name="conta_destino_id">${ativas.map((c) => `<option value="${c.id}" ${t?.conta_destino_id === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
        ${ed ? '' : `
        <label id="l-parc">Parcelas<select name="parcelas">${Array.from({ length: 24 }, (_, i) => `<option value="${i + 1}">${i === 0 ? 'À vista' : `${i + 1}x`}</option>`).join('')}</select></label>
        <div id="l-rep"><label class="check"><input type="checkbox" name="fixa" id="fixa"> É fixa (repete todo mês)</label>
          <label id="l-rep-n" hidden>Repetir por quantos meses<select name="repetir">${[2, 3, 4, 5, 6, 9, 12, 18, 24, 36].map((n) => `<option value="${n}" ${n === 12 ? 'selected' : ''}>${n} meses</option>`).join('')}</select></label></div>`}
        <label class="check" id="l-pago"><input type="checkbox" name="pago" ${!t || t.pago ? 'checked' : ''}> <span id="t-pago">Já foi pago</span></label>
        <p class="form-erro" id="fe"></p>
        <div class="sheet-acoes">${ed ? '<button type="button" class="btn btn-danger" id="del">Apagar</button>' : ''}<button class="btn btn-primary">${ed ? 'Salvar' : 'Lançar'}</button></div>
      </form>`);

    const f = $('#ft');
    const ajustar = () => {
      $$('.seg button', f).forEach((b) => b.classList.toggle('ativo', b.dataset.tipo === tipo));
      $('#vb').className = `valor-box ${tipo}`;
      const sel = f.categoria_id, atualCat = sel.value || t?.categoria_id;
      sel.innerHTML = cats.filter((c) => c.tipo === tipo).map((c) => `<option value="${c.id}">${esc(c.icone)} ${esc(c.nome)}</option>`).join('');
      if (atualCat && [...sel.options].some((o) => o.value == atualCat)) sel.value = atualCat;
      const origSel = f.origem, atualOrig = origSel.value || origemAtual;
      origSel.innerHTML = opcoesOrigem(tipo === 'despesa');
      origSel.value = [...origSel.options].some((o) => o.value === atualOrig) ? atualOrig : origSel.options[0].value;
      const ehCartao = origSel.value.startsWith('k');
      $('#l-cat').hidden = tipo === 'transferencia';
      $('#l-dest').hidden = tipo !== 'transferencia';
      $('#t-orig').textContent = tipo === 'transferencia' ? 'Da conta' : tipo === 'receita' ? 'Recebido em' : 'Pago com';
      $('#l-pago').hidden = ehCartao;
      $('#t-pago').textContent = tipo === 'receita' ? 'Já foi recebido' : tipo === 'transferencia' ? 'Já foi feita' : 'Já foi pago';
      if (!ed) {
        $('#l-parc').hidden = !ehCartao;
        $('#l-rep').hidden = ehCartao || tipo === 'transferencia';
        $('#l-rep-n').hidden = !$('#fixa').checked;
      }
    };
    $$('.seg button', f).forEach((b) => (b.onclick = () => { tipo = b.dataset.tipo; ajustar(); }));
    f.origem.onchange = ajustar;
    if (!ed) $('#fixa').onchange = ajustar;
    ajustar();

    f.onsubmit = enviar('#ft', async (v) => {
      const corpo = {
        tipo, valor: v.valor, descricao: v.descricao, data: v.data, pago: v.pago,
        categoria_id: v.categoria_id, conta_destino_id: v.conta_destino_id,
      };
      if (v.origem.startsWith('k')) corpo.cartao_id = v.origem.slice(1); else corpo.conta_id = v.origem.slice(1);
      if (!ed) {
        store.set('fluxo.origem', v.origem);
        if (corpo.cartao_id) corpo.parcelas = v.parcelas;
        else if (v.fixa) corpo.repetir = v.repetir;
      }
      await api(ed ? `/transacoes/${t.id}` : '/transacoes', { method: ed ? 'PUT' : 'POST', body: corpo });
    }, ed ? 'Lançamento atualizado' : 'Lançado!');

    if (ed) $('#del').onclick = () => {
      if (!t.grupo) return apagarTx(t.id, 'um');
      abrirSheet(`<h3>Apagar lançamento</h3><p class="item-sub" style="white-space:normal">Este lançamento faz parte de uma série (${t.parcela}/${t.total_parcelas}).</p>
        <div style="display:grid;gap:10px"><button class="btn btn-danger" data-e="um">Apagar só este</button><button class="btn btn-danger" data-e="proximas">Este e os próximos</button><button class="btn btn-danger" data-e="grupo">Todos da série</button><button class="btn" id="cx">Cancelar</button></div>`);
      $$('[data-e]').forEach((b) => (b.onclick = () => apagarTx(t.id, b.dataset.e)));
      $('#cx').onclick = fecharSheet;
    };
  }

  async function apagarTx(id, escopo) {
    if (escopo === 'um' && !confirm('Apagar este lançamento?')) return;
    await api(`/transacoes/${id}?escopo=${escopo}`, { method: 'DELETE' });
    fecharSheet(); toast('Apagado'); render();
  }

  function abrirConta(c) {
    abrirSheet(`<h3>${c ? 'Editar conta' : 'Nova conta'}</h3><form id="fc">
      <label>Nome<input name="nome" required maxlength="60" placeholder="Ex.: Nubank, Inter, Carteira" value="${esc(c?.nome || '')}" autofocus></label>
      <div class="row"><label>Tipo<select name="tipo">${['corrente', 'poupanca', 'carteira', 'investimento'].map((k) => `<option value="${k}" ${c?.tipo === k ? 'selected' : ''}>${tipoConta(k)}</option>`).join('')}</select></label>
      <label>Saldo inicial<input name="saldo_inicial" inputmode="decimal" placeholder="0,00" value="${c ? valorInput(c.saldo_inicial) : ''}"></label></div>
      <p class="item-sub" style="white-space:normal;margin:-6px 0 0">Coloque quanto tem hoje nessa conta. Daqui pra frente os lançamentos atualizam o saldo.</p>
      <label>Cor${seletorCores(c?.cor)}</label>
      ${c ? `<label class="check"><input type="checkbox" name="arquivada" ${c.arquivada ? 'checked' : ''}> Arquivar (some do painel)</label>` : ''}
      <p class="form-erro" id="fe"></p>
      <div class="sheet-acoes">${c ? '<button type="button" class="btn btn-danger" id="del">Excluir</button>' : ''}<button class="btn btn-primary">Salvar</button></div></form>`);
    $('#fc').onsubmit = enviar('#fc', async (v) => { await api(c ? `/contas/${c.id}` : '/contas', { method: c ? 'PUT' : 'POST', body: v }); });
    if (c) $('#del').onclick = async () => {
      if (!confirm(`Excluir "${c.nome}"? Todos os lançamentos dessa conta também serão apagados. Se só quiser esconder, use "Arquivar".`)) return;
      await api(`/contas/${c.id}`, { method: 'DELETE' }); fecharSheet(); toast('Conta excluída'); render();
    };
  }

  async function abrirCartao(c) {
    const contas = (await api('/contas')).filter((x) => !x.arquivada);
    abrirSheet(`<h3>${c ? 'Editar cartão' : 'Novo cartão'}</h3><form id="fk">
      <label>Nome<input name="nome" required maxlength="60" placeholder="Ex.: Nubank, Inter Mastercard" value="${esc(c?.nome || '')}" autofocus></label>
      <label>Limite<input name="limite" inputmode="decimal" placeholder="0,00" value="${c ? valorInput(c.limite) : ''}"></label>
      <div class="row"><label>Dia que fecha<input name="dia_fechamento" type="number" min="1" max="31" required value="${c?.dia_fechamento || ''}"></label>
      <label>Dia que vence<input name="dia_vencimento" type="number" min="1" max="31" required value="${c?.dia_vencimento || ''}"></label></div>
      <label>Conta que paga a fatura<select name="conta_id"><option value="">—</option>${contas.map((x) => `<option value="${x.id}" ${c?.conta_id === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
      <label>Cor${seletorCores(c?.cor || '#5B4BDB')}</label>
      <p class="form-erro" id="fe"></p>
      <div class="sheet-acoes">${c ? '<button type="button" class="btn btn-danger" id="del">Excluir</button>' : ''}<button class="btn btn-primary">Salvar</button></div></form>`);
    $('#fk').onsubmit = enviar('#fk', async (v) => { await api(c ? `/cartoes/${c.id}` : '/cartoes', { method: c ? 'PUT' : 'POST', body: v }); });
    if (c) $('#del').onclick = async () => {
      if (!confirm(`Excluir o cartão "${c.nome}" e todas as compras dele?`)) return;
      await api(`/cartoes/${c.id}`, { method: 'DELETE' }); fecharSheet(); toast('Cartão excluído'); location.hash = '#/cartoes';
    };
  }

  async function abrirPagarFatura(f) {
    const contas = (await api('/contas')).filter((x) => !x.arquivada);
    abrirSheet(`<h3>Pagar fatura</h3><form id="fp">
      <div class="valor-box despesa"><small>Valor</small><input class="input-valor" name="valor" inputmode="decimal" value="${valorInput(f.total)}"></div>
      <div class="row"><label>Data<input type="date" name="data" value="${S.hoje}"></label>
      <label>Pago com<select name="conta_id">${contas.map((x) => `<option value="${x.id}" ${f.cartao.conta_id === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label></div>
      <p class="form-erro" id="fe"></p><button class="btn btn-primary">Confirmar pagamento</button></form>`);
    $('#fp').onsubmit = enviar('#fp', async (v) => { await api(`/cartoes/${f.cartao.id}/fatura/pagar`, { method: 'POST', body: { ...v, mes: f.mes } }); }, 'Fatura paga!');
  }

  function abrirCategoria(c) {
    const emojis = ['🍔', '🛒', '⛽', '🔧', '🚌', '🏠', '💡', '📱', '🎓', '💊', '🏋️', '🎉', '👕', '🔁', '🛡️', '📦', '🐶', '🎁', '✈️', '☕', '🍺', '🎮', '💇', '🧾', '🛵', '💼', '💻', '🏷️', '💰', '📈', '➕', '❤️'];
    abrirSheet(`<h3>${c ? 'Editar categoria' : 'Nova categoria'}</h3><form id="fg">
      <label>Nome<input name="nome" required maxlength="40" value="${esc(c?.nome || '')}" autofocus></label>
      <label>Tipo<select name="tipo"><option value="despesa">Despesa</option><option value="receita" ${c?.tipo === 'receita' ? 'selected' : ''}>Receita</option></select></label>
      <label>Ícone<div class="cores">${emojis.map((e) => `<label><input type="radio" name="icone" value="${e}" ${(c?.icone || '📦') === e ? 'checked' : ''}><span style="display:grid;place-items:center;background:var(--bg);font-size:16px">${e}</span></label>`).join('')}</div></label>
      <label>Cor${seletorCores(c?.cor)}</label>
      <p class="form-erro" id="fe"></p>
      <div class="sheet-acoes">${c ? '<button type="button" class="btn btn-danger" id="del">Excluir</button>' : ''}<button class="btn btn-primary">Salvar</button></div></form>`);
    $('#fg').onsubmit = enviar('#fg', async (v) => { await api(c ? `/categorias/${c.id}` : '/categorias', { method: c ? 'PUT' : 'POST', body: v }); });
    if (c) $('#del').onclick = async () => {
      if (!confirm(`Excluir "${c.nome}"? Os lançamentos dela ficam "Sem categoria".`)) return;
      await api(`/categorias/${c.id}`, { method: 'DELETE' }); fecharSheet(); toast('Categoria excluída'); render();
    };
  }

  // ============ login ============
  let modoSetup = false;
  async function mostrarAuth() {
    $('#app').hidden = true; $('#auth').hidden = false; fecharSheet();
    try { modoSetup = !(await api('/status')).configurado; } catch { /* offline */ }
    $('#auth-sub').textContent = modoSetup ? 'Primeiro acesso: crie seu usuário e senha.' : 'Entre para ver suas finanças.';
    $('#auth-btn').textContent = modoSetup ? 'Criar e entrar' : 'Entrar';
    $('[name=senha]', $('#auth-form')).autocomplete = modoSetup ? 'new-password' : 'current-password';
  }

  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    const btn = $('#auth-btn'); btn.disabled = true; $('#auth-erro').textContent = '';
    try { await api(modoSetup ? '/setup' : '/login', { method: 'POST', body: v }); iniciarApp(); }
    catch (ex) { $('#auth-erro').textContent = ex.message; }
    finally { btn.disabled = false; }
  };

  async function sair() { await api('/logout', { method: 'POST' }); mostrarAuth(); }

  async function iniciarApp(status) {
    status = status || await api('/status');
    S.hoje = status.hoje || S.hoje;
    S.mes = S.mes || S.hoje.slice(0, 7);
    $('#user-nome').textContent = status.usuario || '';
    $('#auth').hidden = true; $('#app').hidden = false;
    render();
  }

  // ============ início ============
  montarNav();
  $('#sair').onclick = sair;
  $('#fab').onclick = () => abrirLancamento(null, 'despesa');
  $$('[data-novo]').forEach((b) => (b.onclick = () => abrirLancamento(null, b.dataset.novo)));
  $$('#mes-nav [data-mes]').forEach((b) => (b.onclick = () => { const n = Number(b.dataset.mes); S.mes = n ? somaMes(S.mes, n) : S.hoje.slice(0, 7); render(); }));
  window.addEventListener('hashchange', render);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  api('/status').then((s) => (s.logado ? iniciarApp(s) : mostrarAuth())).catch(mostrarAuth);
})();
