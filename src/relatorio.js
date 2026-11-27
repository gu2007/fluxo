// Extrato mensal em PDF: resumo, gastos por categoria/subcategoria, cartões e todos os lançamentos.
const PDFDocument = require('pdfkit');
const db = require('./db');
const U = require('./util');

const COR = { ink: '#0B1B2B', ink2: '#164257', mint: '#12B886', mintEsc: '#0E9F73', coral: '#F0546A', muted: '#6A7889', linha: '#E4E8EE', fundo: '#F3F5F8', texto: '#0F1C2A' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (m) => `${MESES[Number(m.slice(5)) - 1]} de ${m.slice(0, 4)}`;
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = (c) => fmt.format((c || 0) / 100);
const dataBR = (d) => d.split('-').reverse().join('/');
const pct = (v, t) => (t ? `${Math.round((v / t) * 100)}%` : '0%');
// As fontes padrão do PDF só têm caracteres latinos: tira emojis e símbolos que não existem nelas.
const txt = (s) => String(s ?? '').replace(/[−–—]/g, '-').replace(/[^\u0000-ÿ›‹•…‘’“”€]/gu, '').replace(/\s+/g, ' ').trim();

function dados(mes) {
  const like = `${mes}-%`;
  const fim = `${mes}-31`;
  const tx = db.prepare(`
    SELECT t.*, c.nome cat_nome, c.cor cat_cor, p.id pai_id, p.nome pai_nome, p.cor pai_cor,
           co.nome conta_nome, cd.nome conta_destino_nome, ca.nome cartao_nome
    FROM transacoes t
    LEFT JOIN categorias c ON c.id = t.categoria_id
    LEFT JOIN categorias p ON p.id = c.parent_id
    LEFT JOIN contas co ON co.id = t.conta_id
    LEFT JOIN contas cd ON cd.id = t.conta_destino_id
    LEFT JOIN cartoes ca ON ca.id = t.cartao_id
    WHERE t.data LIKE ? ORDER BY t.data, t.id`).all(like);

  // Árvore: categoria principal -> subcategorias -> lançamentos
  const arvore = (tipo) => {
    const grupos = new Map();
    for (const t of tx.filter((x) => x.tipo === tipo)) {
      const pid = t.pai_id || t.categoria_id || 0;
      const g = grupos.get(pid) || { nome: t.pai_nome || t.cat_nome || 'Sem categoria', cor: t.pai_cor || t.cat_cor || '#94A3B8', total: 0, subs: new Map() };
      const sid = t.pai_id ? t.categoria_id : 0;
      const s = g.subs.get(sid) || { nome: t.pai_id ? t.cat_nome : null, total: 0, itens: [] };
      s.total += t.valor; s.itens.push(t); g.total += t.valor;
      g.subs.set(sid, s); grupos.set(pid, g);
    }
    return [...grupos.values()]
      .map((g) => {
        const subs = [...g.subs.values()].sort((a, b) => b.total - a.total);
        // lançamentos feitos direto na categoria principal, ao lado de subcategorias, viram "Geral"
        if (subs.some((x) => x.nome)) subs.forEach((x) => { if (!x.nome) x.nome = 'Geral'; });
        return { ...g, subs };
      })
      .sort((a, b) => b.total - a.total);
  };

  // Saldo de cada conta no fim do mês (só o que já foi pago/recebido).
  const contas = db.prepare(`
    SELECT c.nome, c.arquivada, c.saldo_inicial
      + COALESCE((SELECT SUM(valor) FROM transacoes WHERE pago=1 AND tipo='receita' AND conta_id=c.id AND cartao_id IS NULL AND data<=?),0)
      - COALESCE((SELECT SUM(valor) FROM transacoes WHERE pago=1 AND tipo IN ('despesa','pagamento_fatura') AND conta_id=c.id AND cartao_id IS NULL AND data<=?),0)
      - COALESCE((SELECT SUM(valor) FROM transacoes WHERE pago=1 AND tipo='transferencia' AND conta_id=c.id AND data<=?),0)
      + COALESCE((SELECT SUM(valor) FROM transacoes WHERE pago=1 AND tipo='transferencia' AND conta_destino_id=c.id AND data<=?),0) AS saldo
    FROM contas c ORDER BY c.nome`).all(fim, fim, fim, fim).filter((c) => !c.arquivada || c.saldo);

  const cartoes = db.prepare('SELECT * FROM cartoes ORDER BY nome').all().map((c) => {
    const total = db.prepare('SELECT COALESCE(SUM(valor),0) v FROM transacoes WHERE cartao_id=? AND fatura=?').get(c.id, mes).v;
    const paga = !!db.prepare('SELECT 1 FROM faturas_pagas WHERE cartao_id=? AND mes=?').get(c.id, mes);
    const noMes = tx.filter((t) => t.cartao_id === c.id && t.tipo === 'despesa').reduce((a, t) => a + t.valor, 0);
    return { nome: c.nome, total, paga, noMes, vencimento: U.vencimentoDaFatura(mes, c.dia_fechamento, c.dia_vencimento) };
  }).filter((c) => c.total || c.noMes);

  const receitas = tx.filter((t) => t.tipo === 'receita').reduce((a, t) => a + t.valor, 0);
  const despesas = tx.filter((t) => t.tipo === 'despesa').reduce((a, t) => a + t.valor, 0);
  const ant = U.mesSeguinte(mes, -1);
  const antTot = db.prepare(`SELECT COALESCE(SUM(CASE WHEN tipo='receita' THEN valor END),0) r, COALESCE(SUM(CASE WHEN tipo='despesa' THEN valor END),0) d FROM transacoes WHERE data LIKE ?`).get(`${ant}-%`);
  return {
    mes, receitas, despesas, antTot, contas, cartoes,
    gastos: arvore('despesa'),
    entradas: arvore('receita'),
    movimentos: tx.filter((t) => t.tipo === 'transferencia' || t.tipo === 'pagamento_fatura'),
    pendentes: tx.filter((t) => !t.pago && !t.cartao_id),
  };
}

function gerarPDF(mes, usuario, saida) {
  const d = dados(mes);
  const doc = new PDFDocument({ size: 'A4', margins: { top: 46, bottom: 56, left: 42, right: 42 }, bufferPages: true, info: { Title: `Fluxo - Extrato de ${nomeMes(mes)}`, Author: 'Fluxo' } });
  doc.pipe(saida);
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  const limite = () => doc.page.height - doc.page.margins.bottom;
  const precisa = (h) => { if (doc.y + h > limite()) { doc.addPage(); doc.y = doc.page.margins.top; } };

  const titulo = (t, sub) => {
    precisa(60);
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(COR.texto).text(txt(t), L, doc.y);
    if (sub) doc.font('Helvetica').fontSize(9).fillColor(COR.muted).text(txt(sub), L, doc.y + 1);
    doc.moveDown(0.5);
  };
  // Linha com texto à esquerda e valor à direita
  const linha = (esq, dir, o = {}) => {
    const h = o.h || 16;
    precisa(h + 2);
    const y = doc.y, x = L + (o.recuo || 0);
    if (o.fundo) doc.rect(L, y - 3, W, h + 2).fill(o.fundo);
    doc.font(o.negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.tam || 9.5).fillColor(o.cor || COR.texto);
    doc.text(txt(esq), x, y, { width: W - (o.recuo || 0) - 160, lineBreak: false, ellipsis: true, height: h });
    const larguraValor = o.pct !== undefined ? 110 : 150;
    doc.fillColor(o.corValor || o.cor || COR.texto).text(txt(dir), L + W - (o.pct !== undefined ? 150 : 150), y, { width: larguraValor, align: 'right', lineBreak: false });
    if (o.pct !== undefined) doc.font('Helvetica').fillColor(COR.muted).text(o.pct, L + W - 36, y, { width: 36, align: 'right', lineBreak: false });
    doc.y = y + h;
  };
  const barra = (frac, cor, recuo = 0) => {
    const y = doc.y - 4, larg = W - recuo - 170;
    doc.roundedRect(L + recuo, y, larg, 4, 2).fill(COR.linha);
    if (frac > 0) doc.roundedRect(L + recuo, y, Math.max(3, larg * Math.min(frac, 1)), 4, 2).fill(cor);
    doc.y = y + 10;
  };

  // ---------- cabeçalho ----------
  doc.rect(0, 0, doc.page.width, 118).fill(COR.ink);
  doc.roundedRect(L, 34, 26, 26, 7).fill(COR.mint);
  [[0, 16], [6, 11], [12, 6]].forEach(([dy, w]) => doc.rect(L + 6, 41 + dy, w, 3).fill(COR.ink));
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#FFFFFF').text('Fluxo', L + 36, 37);
  doc.font('Helvetica').fontSize(9).fillColor('#9FB7CB').text('Controle financeiro pessoal', L + 36, 58);
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#FFFFFF').text(txt(`Extrato de ${nomeMes(mes)}`), L, 36, { width: W, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#9FB7CB')
    .text(txt(`${usuario ? usuario + ' · ' : ''}gerado em ${dataBR(U.hojeISO())}`), L, 64, { width: W, align: 'right' });
  doc.y = 140;

  // ---------- resumo ----------
  const bal = d.receitas - d.despesas;
  const caixas = [
    ['Receitas', brl(d.receitas), COR.mintEsc, d.antTot.r ? `${d.receitas >= d.antTot.r ? '+' : '-'}${Math.abs(Math.round(((d.receitas - d.antTot.r) / d.antTot.r) * 100))}% vs mês anterior` : ''],
    ['Despesas', brl(d.despesas), COR.coral, d.antTot.d ? `${d.despesas >= d.antTot.d ? '+' : '-'}${Math.abs(Math.round(((d.despesas - d.antTot.d) / d.antTot.d) * 100))}% vs mês anterior` : ''],
    ['Balanço do mês', `${bal >= 0 ? '+' : '-'} ${brl(Math.abs(bal))}`, bal >= 0 ? COR.mintEsc : COR.coral, bal >= 0 ? 'sobrou dinheiro' : 'gastou mais do que entrou'],
  ];
  const cw = (W - 20) / 3, cy = doc.y;
  caixas.forEach(([rot, val, cor, nota], i) => {
    const x = L + i * (cw + 10);
    doc.roundedRect(x, cy, cw, 66, 8).fill(COR.fundo);
    doc.rect(x, cy + 10, 3, 46).fill(cor);
    doc.font('Helvetica').fontSize(9).fillColor(COR.muted).text(rot, x + 14, cy + 11);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(cor).text(txt(val), x + 14, cy + 25, { width: cw - 20, lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(COR.muted).text(txt(nota), x + 14, cy + 47, { width: cw - 20, lineBreak: false });
  });
  doc.y = cy + 80;

  if (d.contas.length) {
    titulo('Saldo das contas no fim do mês');
    const tot = d.contas.reduce((a, c) => a + c.saldo, 0);
    d.contas.forEach((c, i) => linha(c.nome, brl(c.saldo), { fundo: i % 2 ? null : '#FAFBFC', corValor: c.saldo < 0 ? COR.coral : COR.texto }));
    linha('Total', brl(tot), { negrito: true });
  }

  // ---------- por categoria ----------
  const blocoCategorias = (grupos, total, cor) => {
    if (!grupos.length) { linha('Nada lançado neste mês.', '', { cor: COR.muted }); return; }
    grupos.forEach((g) => {
      precisa(40);
      linha(g.nome, brl(g.total), { negrito: true, tam: 10.5, h: 15, pct: pct(g.total, total) });
      barra(g.total / (total || 1), g.cor || cor);
      const subsReais = g.subs.filter((s) => s.nome);
      if (subsReais.length) subsReais.forEach((s) => linha(`›  ${s.nome}`, brl(s.total), { recuo: 14, cor: COR.muted, corValor: COR.texto, h: 14, pct: pct(s.total, g.total) }));
      doc.y += 5;
    });
  };
  titulo('Para onde foi o dinheiro', 'Despesas por categoria. Os percentuais das subcategorias são em relação à categoria.');
  blocoCategorias(d.gastos, d.despesas, COR.coral);
  titulo('De onde veio o dinheiro', 'Receitas por categoria.');
  blocoCategorias(d.entradas, d.receitas, COR.mint);

  if (d.cartoes.length) {
    titulo('Cartões de crédito', 'Fatura que vence neste mês e o total comprado no cartão durante o mês.');
    linha('Cartão', 'Fatura do mês', { negrito: true, cor: COR.muted });
    d.cartoes.forEach((c, i) => {
      linha(`${c.nome}  ·  vence ${dataBR(c.vencimento)}  ·  ${c.paga ? 'paga' : 'em aberto'}  ·  compras no mês ${brl(c.noMes)}`, brl(c.total), { fundo: i % 2 ? null : '#FAFBFC' });
    });
  }

  // ---------- detalhamento ----------
  const itemLinha = (t, i, recuo) => {
    const forma = t.cartao_id ? `cartão ${t.cartao_nome}` : (t.conta_nome || '');
    const parc = t.total_parcelas ? ` (${t.parcela}/${t.total_parcelas})` : '';
    const pend = t.pago ? '' : ' [pendente]';
    precisa(15);
    const y = doc.y;
    if (i % 2 === 0) doc.rect(L, y - 3, W, 15).fill('#FAFBFC');
    doc.font('Helvetica').fontSize(8.5).fillColor(COR.muted).text(dataBR(t.data).slice(0, 5), L + recuo, y, { width: 32, lineBreak: false });
    doc.fillColor(COR.texto).text(txt(`${t.descricao || t.cat_nome || 'Lançamento'}${parc}${pend}`), L + recuo + 34, y, { width: W - recuo - 34 - 236, lineBreak: false, ellipsis: true, height: 11 });
    doc.fillColor(COR.muted).text(txt(forma), L + W - 228, y, { width: 140, lineBreak: false, ellipsis: true, height: 11 });
    doc.fillColor(COR.texto).text(brl(t.valor), L + W - 85, y, { width: 85, align: 'right', lineBreak: false });
    doc.y = y + 14;
  };
  const detalhe = (grupos) => {
    grupos.forEach((g) => {
      precisa(46);
      doc.y += 4;
      linha(g.nome, brl(g.total), { negrito: true, tam: 10.5, fundo: COR.fundo, h: 17 });
      g.subs.forEach((s) => {
        if (s.nome) { precisa(32); linha(`›  ${s.nome}`, brl(s.total), { recuo: 8, negrito: true, cor: COR.muted, corValor: COR.texto, h: 15 }); }
        s.itens.forEach((t, i) => itemLinha(t, i, s.nome ? 16 : 6));
      });
    });
  };
  doc.addPage(); doc.y = doc.page.margins.top;
  titulo('Todos os gastos do mês', 'Separados por categoria e subcategoria. Compras no cartão aparecem na data da compra.');
  if (d.gastos.length) detalhe(d.gastos); else linha('Nenhum gasto neste mês.', '', { cor: COR.muted });
  titulo('Todas as entradas do mês');
  if (d.entradas.length) detalhe(d.entradas); else linha('Nenhuma entrada neste mês.', '', { cor: COR.muted });

  if (d.movimentos.length) {
    titulo('Movimentações entre contas', 'Transferências e pagamentos de fatura. Não contam como gasto: o gasto já está nas compras do cartão.');
    d.movimentos.forEach((t, i) => itemLinha({
      ...t,
      descricao: t.tipo === 'transferencia' ? `${t.descricao} (${t.conta_nome} > ${t.conta_destino_nome})` : t.descricao,
      conta_nome: t.tipo === 'transferencia' ? '' : t.conta_nome,
    }, i, 0));
  }

  // ---------- rodapé ----------
  const n = doc.bufferedPageRange().count;
  for (let i = 0; i < n; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // permite escrever no rodapé sem criar página nova
    const y = doc.page.height - 36;
    doc.save().moveTo(L, y - 8).lineTo(L + W, y - 8).lineWidth(0.5).strokeColor(COR.linha).stroke().restore();
    doc.font('Helvetica').fontSize(8).fillColor(COR.muted);
    doc.text(txt(`Fluxo · Extrato de ${nomeMes(mes)}`), L, y, { width: W / 2, lineBreak: false, height: 10 });
    doc.text(`Página ${i + 1} de ${n}`, L + W / 2, y, { width: W / 2, align: 'right', lineBreak: false, height: 10 });
  }
  doc.end();
}

module.exports = { gerarPDF };
