// Rotas da API (/api/...). Todas, exceto status/setup/login, exigem login.
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const U = require('./util');

const r = express.Router();

// ---------- helpers ----------
const erro = (res, msg, code = 400) => res.status(code).json({ erro: msg });
const txt = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v) => (v === null || v === undefined || v === '' ? null : Number.parseInt(v, 10));
const cor = (v, padrao) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : padrao);

function exige(req, res, next) {
  if (req.session && req.session.uid) return next();
  return erro(res, 'Faça login para continuar.', 401);
}

// ---------- autenticação ----------
const temUsuario = () => db.prepare('SELECT COUNT(*) n FROM usuarios').get().n > 0;
const tentativas = new Map(); // proteção simples contra força bruta

r.get('/status', (req, res) => {
  res.json({ configurado: temUsuario(), logado: !!(req.session && req.session.uid), usuario: req.session?.nome || null, hoje: U.hojeISO() });
});

r.post('/setup', (req, res) => {
  if (temUsuario()) return erro(res, 'O usuário já foi criado.', 403);
  const usuario = txt(req.body.usuario, 40).toLowerCase();
  const senha = typeof req.body.senha === 'string' ? req.body.senha : '';
  if (usuario.length < 3) return erro(res, 'O usuário precisa ter pelo menos 3 letras.');
  if (senha.length < 6) return erro(res, 'A senha precisa ter pelo menos 6 caracteres.');
  const info = db.prepare('INSERT INTO usuarios (usuario, senha_hash) VALUES (?, ?)').run(usuario, bcrypt.hashSync(senha, 10));
  req.session.uid = info.lastInsertRowid;
  req.session.nome = usuario;
  res.json({ ok: true });
});

r.post('/login', (req, res) => {
  const ip = req.ip;
  const t = tentativas.get(ip) || { n: 0, ate: 0 };
  if (t.ate > Date.now()) return erro(res, 'Muitas tentativas. Espere alguns minutos.', 429);
  const usuario = txt(req.body.usuario, 40).toLowerCase();
  const u = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario);
  if (!u || !bcrypt.compareSync(String(req.body.senha || ''), u.senha_hash)) {
    t.n += 1;
    if (t.n >= 5) { t.ate = Date.now() + 5 * 60 * 1000; t.n = 0; }
    tentativas.set(ip, t);
    return erro(res, 'Usuário ou senha incorretos.', 401);
  }
  tentativas.delete(ip);
  req.session.uid = u.id;
  req.session.nome = u.usuario;
  res.json({ ok: true });
});

r.post('/logout', (req, res) => { req.session = null; res.json({ ok: true }); });

r.post('/senha', exige, (req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.session.uid);
  if (!u || !bcrypt.compareSync(String(req.body.atual || ''), u.senha_hash)) return erro(res, 'Senha atual incorreta.');
  const nova = String(req.body.nova || '');
  if (nova.length < 6) return erro(res, 'A nova senha precisa ter pelo menos 6 caracteres.');
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(bcrypt.hashSync(nova, 10), u.id);
  res.json({ ok: true });
});

r.use(exige);

// ---------- contas ----------
const SQL_SALDO = `
  c.saldo_inicial
  + COALESCE((SELECT SUM(valor) FROM transacoes WHERE pago=1 AND tipo='receita' AND conta_id=c.id AND cartao_id IS NULL),0)
  - COALESCE((SELECT SUM(valor) FROM transacoes WHERE pago=1 AND tipo IN ('despesa','pagamento_fatura') AND conta_id=c.id AND cartao_id IS NULL),0)
  - COALESCE((SELECT SUM(valor) FROM transacoes WHERE pago=1 AND tipo='transferencia' AND conta_id=c.id),0)
  + COALESCE((SELECT SUM(valor) FROM transacoes WHERE pago=1 AND tipo='transferencia' AND conta_destino_id=c.id),0)`;

function listarContas() {
  return db.prepare(`SELECT c.*, (${SQL_SALDO}) AS saldo FROM contas c ORDER BY c.arquivada, c.nome`).all();
}

r.get('/contas', (req, res) => res.json(listarContas()));

function dadosConta(b) {
  const nome = txt(b.nome, 60);
  if (!nome) return { erro: 'Dê um nome para a conta.' };
  const saldo = b.saldo_inicial === undefined || b.saldo_inicial === '' ? 0 : U.paraCentavos(b.saldo_inicial);
  if (Number.isNaN(saldo)) return { erro: 'Saldo inicial inválido.' };
  const tipos = ['corrente', 'poupanca', 'carteira', 'investimento'];
  return { nome, tipo: tipos.includes(b.tipo) ? b.tipo : 'corrente', saldo_inicial: saldo, cor: cor(b.cor, '#0F9D7A'), arquivada: b.arquivada ? 1 : 0 };
}

r.post('/contas', (req, res) => {
  const d = dadosConta(req.body);
  if (d.erro) return erro(res, d.erro);
  const info = db.prepare('INSERT INTO contas (nome,tipo,saldo_inicial,cor,arquivada) VALUES (@nome,@tipo,@saldo_inicial,@cor,@arquivada)').run(d);
  res.json({ id: info.lastInsertRowid });
});

r.put('/contas/:id', (req, res) => {
  const d = dadosConta(req.body);
  if (d.erro) return erro(res, d.erro);
  db.prepare('UPDATE contas SET nome=@nome,tipo=@tipo,saldo_inicial=@saldo_inicial,cor=@cor,arquivada=@arquivada WHERE id=@id').run({ ...d, id: int(req.params.id) });
  res.json({ ok: true });
});

r.delete('/contas/:id', (req, res) => {
  db.prepare('DELETE FROM contas WHERE id = ?').run(int(req.params.id));
  res.json({ ok: true });
});

// ---------- categorias ----------
r.get('/categorias', (req, res) => res.json(db.prepare('SELECT * FROM categorias ORDER BY tipo DESC, nome').all()));

function dadosCategoria(b) {
  const nome = txt(b.nome, 40);
  if (!nome) return { erro: 'Dê um nome para a categoria.' };
  if (!['receita', 'despesa'].includes(b.tipo)) return { erro: 'Tipo inválido.' };
  return { nome, tipo: b.tipo, cor: cor(b.cor, '#64748B'), icone: txt(b.icone, 8) || '🏷️' };
}

r.post('/categorias', (req, res) => {
  const d = dadosCategoria(req.body);
  if (d.erro) return erro(res, d.erro);
  res.json({ id: db.prepare('INSERT INTO categorias (nome,tipo,cor,icone) VALUES (@nome,@tipo,@cor,@icone)').run(d).lastInsertRowid });
});

r.put('/categorias/:id', (req, res) => {
  const d = dadosCategoria(req.body);
  if (d.erro) return erro(res, d.erro);
  db.prepare('UPDATE categorias SET nome=@nome,tipo=@tipo,cor=@cor,icone=@icone WHERE id=@id').run({ ...d, id: int(req.params.id) });
  res.json({ ok: true });
});

r.delete('/categorias/:id', (req, res) => {
  db.prepare('DELETE FROM categorias WHERE id = ?').run(int(req.params.id));
  res.json({ ok: true });
});

// ---------- cartões ----------
function infoCartao(c, hoje = U.hojeISO()) {
  const atual = U.faturaDaCompra(hoje, c.dia_fechamento);
  const usado = db.prepare(`
    SELECT COALESCE(SUM(t.valor),0) v FROM transacoes t
    WHERE t.cartao_id = ? AND NOT EXISTS (SELECT 1 FROM faturas_pagas f WHERE f.cartao_id = t.cartao_id AND f.mes = t.fatura)`).get(c.id).v;
  const totalAtual = db.prepare('SELECT COALESCE(SUM(valor),0) v FROM transacoes WHERE cartao_id=? AND fatura=?').get(c.id, atual).v;
  const paga = !!db.prepare('SELECT 1 FROM faturas_pagas WHERE cartao_id=? AND mes=?').get(c.id, atual);
  return {
    ...c,
    fatura_atual: atual,
    fatura_atual_total: totalAtual,
    fatura_atual_paga: paga,
    fatura_atual_vencimento: U.vencimentoDaFatura(atual, c.dia_fechamento, c.dia_vencimento),
    limite_usado: usado,
    limite_disponivel: c.limite - usado,
  };
}

r.get('/cartoes', (req, res) => {
  res.json(db.prepare('SELECT * FROM cartoes ORDER BY nome').all().map((c) => infoCartao(c)));
});

function dadosCartao(b) {
  const nome = txt(b.nome, 60);
  if (!nome) return { erro: 'Dê um nome para o cartão.' };
  const limite = b.limite === undefined || b.limite === '' ? 0 : U.paraCentavos(b.limite);
  const fech = int(b.dia_fechamento), venc = int(b.dia_vencimento);
  if (Number.isNaN(limite) || limite < 0) return { erro: 'Limite inválido.' };
  if (!(fech >= 1 && fech <= 31) || !(venc >= 1 && venc <= 31)) return { erro: 'Dias de fechamento e vencimento devem ser de 1 a 31.' };
  return { nome, limite, dia_fechamento: fech, dia_vencimento: venc, cor: cor(b.cor, '#5B4BDB'), conta_id: int(b.conta_id) };
}

function recalculaFaturas(cartaoId) {
  const c = db.prepare('SELECT * FROM cartoes WHERE id = ?').get(cartaoId);
  if (!c) return;
  const up = db.prepare('UPDATE transacoes SET fatura = ? WHERE id = ?');
  for (const t of db.prepare('SELECT id, data FROM transacoes WHERE cartao_id = ?').all(cartaoId)) {
    up.run(U.faturaDaCompra(t.data, c.dia_fechamento), t.id);
  }
}

r.post('/cartoes', (req, res) => {
  const d = dadosCartao(req.body);
  if (d.erro) return erro(res, d.erro);
  res.json({ id: db.prepare('INSERT INTO cartoes (nome,limite,dia_fechamento,dia_vencimento,cor,conta_id) VALUES (@nome,@limite,@dia_fechamento,@dia_vencimento,@cor,@conta_id)').run(d).lastInsertRowid });
});

r.put('/cartoes/:id', (req, res) => {
  const d = dadosCartao(req.body);
  if (d.erro) return erro(res, d.erro);
  const id = int(req.params.id);
  db.transaction(() => {
    db.prepare('UPDATE cartoes SET nome=@nome,limite=@limite,dia_fechamento=@dia_fechamento,dia_vencimento=@dia_vencimento,cor=@cor,conta_id=@conta_id WHERE id=@id').run({ ...d, id });
    recalculaFaturas(id);
  })();
  res.json({ ok: true });
});

r.delete('/cartoes/:id', (req, res) => {
  db.prepare('DELETE FROM cartoes WHERE id = ?').run(int(req.params.id));
  res.json({ ok: true });
});

r.get('/cartoes/:id/fatura', (req, res) => {
  const c = db.prepare('SELECT * FROM cartoes WHERE id = ?').get(int(req.params.id));
  if (!c) return erro(res, 'Cartão não encontrado.', 404);
  const mes = U.ehMes(req.query.mes) ? req.query.mes : U.faturaDaCompra(U.hojeISO(), c.dia_fechamento);
  const itens = db.prepare(`
    SELECT t.*, cat.nome cat_nome, cat.cor cat_cor, cat.icone cat_icone
    FROM transacoes t LEFT JOIN categorias cat ON cat.id = t.categoria_id
    WHERE t.cartao_id = ? AND t.fatura = ? ORDER BY t.data DESC, t.id DESC`).all(c.id, mes);
  const pag = db.prepare('SELECT f.*, t.data data_pagamento, t.conta_id FROM faturas_pagas f LEFT JOIN transacoes t ON t.id=f.transacao_id WHERE f.cartao_id=? AND f.mes=?').get(c.id, mes);
  res.json({
    cartao: infoCartao(c),
    mes,
    fechamento: U.fechamentoDaFatura(mes, c.dia_fechamento),
    vencimento: U.vencimentoDaFatura(mes, c.dia_fechamento, c.dia_vencimento),
    total: itens.reduce((s, t) => s + t.valor, 0),
    paga: !!pag,
    pagamento: pag || null,
    itens,
  });
});

r.post('/cartoes/:id/fatura/pagar', (req, res) => {
  const c = db.prepare('SELECT * FROM cartoes WHERE id = ?').get(int(req.params.id));
  if (!c) return erro(res, 'Cartão não encontrado.', 404);
  const mes = req.body.mes;
  if (!U.ehMes(mes)) return erro(res, 'Mês inválido.');
  const contaId = int(req.body.conta_id);
  if (!db.prepare('SELECT 1 FROM contas WHERE id=?').get(contaId)) return erro(res, 'Escolha a conta que pagou a fatura.');
  if (db.prepare('SELECT 1 FROM faturas_pagas WHERE cartao_id=? AND mes=?').get(c.id, mes)) return erro(res, 'Essa fatura já está paga.');
  const total = db.prepare('SELECT COALESCE(SUM(valor),0) v FROM transacoes WHERE cartao_id=? AND fatura=?').get(c.id, mes).v;
  const valor = req.body.valor ? U.paraCentavos(req.body.valor) : total;
  if (!(valor > 0)) return erro(res, 'Essa fatura não tem valor para pagar.');
  const data = U.ehData(req.body.data) ? req.body.data : U.hojeISO();
  db.transaction(() => {
    const tx = db.prepare(`INSERT INTO transacoes (tipo,descricao,valor,data,conta_id,pago) VALUES ('pagamento_fatura',?,?,?,?,1)`)
      .run(`Fatura ${c.nome} (${mes.slice(5)}/${mes.slice(0, 4)})`, valor, data, contaId);
    db.prepare('INSERT INTO faturas_pagas (cartao_id, mes, transacao_id) VALUES (?,?,?)').run(c.id, mes, tx.lastInsertRowid);
  })();
  res.json({ ok: true });
});

// ---------- transações ----------
const SELECT_TX = `
  SELECT t.*, cat.nome cat_nome, cat.cor cat_cor, cat.icone cat_icone,
         co.nome conta_nome, cd.nome conta_destino_nome, ca.nome cartao_nome, ca.cor cartao_cor
  FROM transacoes t
  LEFT JOIN categorias cat ON cat.id = t.categoria_id
  LEFT JOIN contas co ON co.id = t.conta_id
  LEFT JOIN contas cd ON cd.id = t.conta_destino_id
  LEFT JOIN cartoes ca ON ca.id = t.cartao_id`;

r.get('/transacoes', (req, res) => {
  const mes = U.ehMes(req.query.mes) ? req.query.mes : U.hojeISO().slice(0, 7);
  const where = ['t.data LIKE ?'];
  const args = [`${mes}-%`];
  if (['receita', 'despesa', 'transferencia', 'pagamento_fatura'].includes(req.query.tipo)) { where.push('t.tipo = ?'); args.push(req.query.tipo); }
  if (int(req.query.conta_id)) { where.push('(t.conta_id = ? OR t.conta_destino_id = ?)'); args.push(int(req.query.conta_id), int(req.query.conta_id)); }
  if (int(req.query.cartao_id)) { where.push('t.cartao_id = ?'); args.push(int(req.query.cartao_id)); }
  if (int(req.query.categoria_id)) { where.push('t.categoria_id = ?'); args.push(int(req.query.categoria_id)); }
  if (req.query.busca) { where.push('t.descricao LIKE ?'); args.push(`%${txt(req.query.busca, 60)}%`); }
  if (req.query.pendentes === '1') where.push('t.pago = 0');
  res.json(db.prepare(`${SELECT_TX} WHERE ${where.join(' AND ')} ORDER BY t.data DESC, t.id DESC`).all(...args));
});

function validaTransacao(b) {
  const tipo = b.tipo;
  if (!['receita', 'despesa', 'transferencia'].includes(tipo)) return { erro: 'Tipo inválido.' };
  const valor = U.paraCentavos(b.valor);
  if (!(valor > 0)) return { erro: 'Informe um valor maior que zero.' };
  if (!U.ehData(b.data)) return { erro: 'Data inválida.' };
  const d = {
    tipo, valor, data: b.data,
    descricao: txt(b.descricao, 120),
    categoria_id: tipo === 'transferencia' ? null : int(b.categoria_id),
    conta_id: int(b.conta_id),
    conta_destino_id: tipo === 'transferencia' ? int(b.conta_destino_id) : null,
    cartao_id: tipo === 'despesa' ? int(b.cartao_id) : null,
    pago: b.pago === false || b.pago === 0 || b.pago === '0' ? 0 : 1,
  };
  if (d.cartao_id) {
    const c = db.prepare('SELECT * FROM cartoes WHERE id=?').get(d.cartao_id);
    if (!c) return { erro: 'Cartão não encontrado.' };
    d.conta_id = null; d.pago = 1; d.cartao = c;
  } else if (!d.conta_id || !db.prepare('SELECT 1 FROM contas WHERE id=?').get(d.conta_id)) {
    return { erro: tipo === 'transferencia' ? 'Escolha a conta de origem.' : 'Escolha uma conta (ou um cartão).' };
  }
  if (tipo === 'transferencia') {
    if (!d.conta_destino_id || !db.prepare('SELECT 1 FROM contas WHERE id=?').get(d.conta_destino_id)) return { erro: 'Escolha a conta de destino.' };
    if (d.conta_destino_id === d.conta_id) return { erro: 'Origem e destino precisam ser contas diferentes.' };
  }
  if (!d.descricao) d.descricao = tipo === 'transferencia' ? 'Transferência' : '';
  return d;
}

const INSERT_TX = db.prepare(`INSERT INTO transacoes
  (tipo,descricao,valor,data,categoria_id,conta_id,conta_destino_id,cartao_id,fatura,pago,grupo,parcela,total_parcelas)
  VALUES (@tipo,@descricao,@valor,@data,@categoria_id,@conta_id,@conta_destino_id,@cartao_id,@fatura,@pago,@grupo,@parcela,@total_parcelas)`);

r.post('/transacoes', (req, res) => {
  const d = validaTransacao(req.body);
  if (d.erro) return erro(res, d.erro);
  const cartao = d.cartao; delete d.cartao;
  const parcelas = Math.min(Math.max(int(req.body.parcelas) || 1, 1), 48);
  const repetir = Math.min(Math.max(int(req.body.repetir) || 1, 1), 60); // despesa/receita fixa: repete N meses
  const grupo = parcelas > 1 || repetir > 1 ? crypto.randomUUID() : null;
  const diaOriginal = Number(d.data.slice(8));

  db.transaction(() => {
    if (parcelas > 1 && cartao) {
      // Divide o valor total em parcelas; o centavo que sobra vai na 1ª.
      const base = Math.floor(d.valor / parcelas);
      const resto = d.valor - base * parcelas;
      for (let i = 0; i < parcelas; i++) {
        const data = U.somaMeses(d.data, i, diaOriginal);
        INSERT_TX.run({
          ...d, data, valor: base + (i === 0 ? resto : 0), grupo, parcela: i + 1, total_parcelas: parcelas,
          fatura: U.faturaDaCompra(data, cartao.dia_fechamento),
        });
      }
    } else {
      for (let i = 0; i < repetir; i++) {
        const data = U.somaMeses(d.data, i, diaOriginal);
        const futuro = data > U.hojeISO();
        INSERT_TX.run({
          ...d, data, grupo, parcela: repetir > 1 ? i + 1 : null, total_parcelas: repetir > 1 ? repetir : null,
          pago: cartao ? 1 : (i === 0 ? d.pago : (futuro ? 0 : d.pago)),
          fatura: cartao ? U.faturaDaCompra(data, cartao.dia_fechamento) : null,
        });
      }
    }
  })();
  res.json({ ok: true });
});

r.put('/transacoes/:id', (req, res) => {
  const id = int(req.params.id);
  const atual = db.prepare('SELECT * FROM transacoes WHERE id=?').get(id);
  if (!atual) return erro(res, 'Lançamento não encontrado.', 404);
  if (atual.tipo === 'pagamento_fatura') return erro(res, 'Para mudar um pagamento de fatura, apague e pague de novo.');
  const d = validaTransacao(req.body);
  if (d.erro) return erro(res, d.erro);
  const cartao = d.cartao; delete d.cartao;
  d.fatura = cartao ? U.faturaDaCompra(d.data, cartao.dia_fechamento) : null;
  db.prepare(`UPDATE transacoes SET tipo=@tipo,descricao=@descricao,valor=@valor,data=@data,categoria_id=@categoria_id,
    conta_id=@conta_id,conta_destino_id=@conta_destino_id,cartao_id=@cartao_id,fatura=@fatura,pago=@pago WHERE id=@id`).run({ ...d, id });
  res.json({ ok: true });
});

r.patch('/transacoes/:id/pago', (req, res) => {
  db.prepare('UPDATE transacoes SET pago = ? WHERE id = ? AND cartao_id IS NULL').run(req.body.pago ? 1 : 0, int(req.params.id));
  res.json({ ok: true });
});

r.delete('/transacoes/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM transacoes WHERE id=?').get(int(req.params.id));
  if (!t) return res.json({ ok: true });
  if (req.query.escopo === 'grupo' && t.grupo) db.prepare('DELETE FROM transacoes WHERE grupo = ?').run(t.grupo);
  else if (req.query.escopo === 'proximas' && t.grupo) db.prepare('DELETE FROM transacoes WHERE grupo = ? AND data >= ?').run(t.grupo, t.data);
  else db.prepare('DELETE FROM transacoes WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

// ---------- orçamentos (limite mensal por categoria) ----------
function orcamentosDoMes(mes) {
  return db.prepare(`
    SELECT o.id, o.valor, c.id categoria_id, c.nome, c.cor, c.icone,
      COALESCE((SELECT SUM(valor) FROM transacoes t WHERE t.categoria_id=c.id AND t.tipo='despesa' AND t.data LIKE ?),0) gasto
    FROM orcamentos o JOIN categorias c ON c.id = o.categoria_id ORDER BY c.nome`).all(`${mes}-%`);
}

r.get('/orcamentos', (req, res) => {
  const mes = U.ehMes(req.query.mes) ? req.query.mes : U.hojeISO().slice(0, 7);
  res.json(orcamentosDoMes(mes));
});

r.put('/orcamentos', (req, res) => {
  const cat = int(req.body.categoria_id);
  const valor = U.paraCentavos(req.body.valor);
  if (!db.prepare("SELECT 1 FROM categorias WHERE id=? AND tipo='despesa'").get(cat)) return erro(res, 'Escolha uma categoria de despesa.');
  if (Number.isNaN(valor) || valor < 0) return erro(res, 'Valor inválido.');
  if (valor === 0) db.prepare('DELETE FROM orcamentos WHERE categoria_id=?').run(cat);
  else db.prepare('INSERT INTO orcamentos (categoria_id, valor) VALUES (?,?) ON CONFLICT(categoria_id) DO UPDATE SET valor=excluded.valor').run(cat, valor);
  res.json({ ok: true });
});

// ---------- painel ----------
function totaisDoMes(mes) {
  return db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo='receita' THEN valor END),0) receitas,
      COALESCE(SUM(CASE WHEN tipo='despesa' THEN valor END),0) despesas,
      COALESCE(SUM(CASE WHEN tipo='receita' AND pago=0 THEN valor END),0) receitas_pendentes,
      COALESCE(SUM(CASE WHEN tipo='despesa' AND pago=0 AND cartao_id IS NULL THEN valor END),0) despesas_pendentes
    FROM transacoes WHERE data LIKE ?`).get(`${mes}-%`);
}

function porCategoria(tipo, de, ate) {
  return db.prepare(`
    SELECT COALESCE(c.id,0) id, COALESCE(c.nome,'Sem categoria') nome, COALESCE(c.cor,'#94A3B8') cor, COALESCE(c.icone,'📦') icone, SUM(t.valor) total
    FROM transacoes t LEFT JOIN categorias c ON c.id = t.categoria_id
    WHERE t.tipo = ? AND t.data >= ? AND t.data <= ?
    GROUP BY c.id ORDER BY total DESC`).all(tipo, de, ate);
}

r.get('/dashboard', (req, res) => {
  const hoje = U.hojeISO();
  const mes = U.ehMes(req.query.mes) ? req.query.mes : hoje.slice(0, 7);
  const contas = listarContas().filter((c) => !c.arquivada);
  const cartoes = db.prepare('SELECT * FROM cartoes ORDER BY nome').all().map((c) => infoCartao(c, hoje));
  const pendentes = db.prepare(`${SELECT_TX} WHERE t.pago = 0 AND t.cartao_id IS NULL AND t.data <= ? ORDER BY t.data LIMIT 8`)
    .all(`${hoje.slice(0, 7)}-31`);
  const ultimas = db.prepare(`${SELECT_TX} WHERE t.data LIKE ? ORDER BY t.data DESC, t.id DESC LIMIT 6`).all(`${mes}-%`);
  res.json({
    mes,
    saldo_total: contas.reduce((s, c) => s + c.saldo, 0),
    totais: totaisDoMes(mes),
    contas,
    cartoes,
    despesas_por_categoria: porCategoria('despesa', `${mes}-01`, `${mes}-31`),
    orcamentos: orcamentosDoMes(mes),
    pendentes,
    ultimas,
  });
});

// ---------- relatórios ----------
r.get('/relatorios', (req, res) => {
  const fim = U.ehMes(req.query.mes) ? req.query.mes : U.hojeISO().slice(0, 7);
  const n = Math.min(Math.max(int(req.query.meses) || 6, 1), 24);
  const meses = [];
  for (let i = n - 1; i >= 0; i--) meses.push(U.mesSeguinte(fim, -i));
  const serie = meses.map((m) => ({ mes: m, ...totaisDoMes(m) }));
  const de = `${meses[0]}-01`, ate = `${fim}-31`;
  res.json({
    meses: serie,
    despesas_por_categoria: porCategoria('despesa', de, ate),
    receitas_por_categoria: porCategoria('receita', de, ate),
  });
});

// ---------- exportar CSV ----------
r.get('/exportar.csv', (req, res) => {
  const linhas = db.prepare(`${SELECT_TX} ORDER BY t.data, t.id`).all();
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const tipos = { receita: 'Receita', despesa: 'Despesa', transferencia: 'Transferência', pagamento_fatura: 'Pagamento de fatura' };
  const out = ['Data;Tipo;Descrição;Categoria;Conta;Cartão;Valor;Pago'];
  for (const t of linhas) {
    out.push([t.data, tipos[t.tipo], t.descricao, t.cat_nome, t.tipo === 'transferencia' ? `${t.conta_nome} → ${t.conta_destino_nome}` : t.conta_nome,
      t.cartao_nome, (t.valor / 100).toFixed(2).replace('.', ','), t.pago ? 'Sim' : 'Não'].map(esc).join(';'));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fluxo-${U.hojeISO()}.csv"`);
  res.send('﻿' + out.join('\r\n'));
});

module.exports = r;
