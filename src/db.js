// Banco de dados SQLite: cria as tabelas na primeira execução e insere categorias padrão.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'fluxo.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  usuario TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contas (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'corrente',      -- corrente | poupanca | carteira | investimento
  saldo_inicial INTEGER NOT NULL DEFAULT 0,   -- valores sempre em centavos
  cor TEXT NOT NULL DEFAULT '#0F9D7A',
  arquivada INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,                         -- receita | despesa
  cor TEXT NOT NULL,
  icone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cartoes (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  limite INTEGER NOT NULL DEFAULT 0,
  dia_fechamento INTEGER NOT NULL,
  dia_vencimento INTEGER NOT NULL,
  cor TEXT NOT NULL DEFAULT '#5B4BDB',
  conta_id INTEGER REFERENCES contas(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS transacoes (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL,                         -- receita | despesa | transferencia | pagamento_fatura
  descricao TEXT NOT NULL DEFAULT '',
  valor INTEGER NOT NULL,                     -- centavos, sempre positivo
  data TEXT NOT NULL,                         -- YYYY-MM-DD
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  conta_id INTEGER REFERENCES contas(id) ON DELETE CASCADE,
  conta_destino_id INTEGER REFERENCES contas(id) ON DELETE CASCADE,
  cartao_id INTEGER REFERENCES cartoes(id) ON DELETE CASCADE,
  fatura TEXT,                                -- YYYY-MM (mês de fechamento) p/ compras no cartão
  pago INTEGER NOT NULL DEFAULT 1,
  grupo TEXT,                                 -- liga parcelas / recorrências
  parcela INTEGER,
  total_parcelas INTEGER,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_data ON transacoes(data);
CREATE INDEX IF NOT EXISTS idx_tx_fatura ON transacoes(cartao_id, fatura);

CREATE TABLE IF NOT EXISTS orcamentos (
  id INTEGER PRIMARY KEY,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  valor INTEGER NOT NULL,
  UNIQUE(categoria_id)
);

CREATE TABLE IF NOT EXISTS faturas_pagas (
  cartao_id INTEGER NOT NULL REFERENCES cartoes(id) ON DELETE CASCADE,
  mes TEXT NOT NULL,
  transacao_id INTEGER REFERENCES transacoes(id) ON DELETE CASCADE,
  PRIMARY KEY (cartao_id, mes)
);
`);

// Quando o pagamento de uma fatura é apagado, a fatura volta a ficar em aberto.
db.exec(`
CREATE TRIGGER IF NOT EXISTS tr_fatura_reabre AFTER DELETE ON transacoes
WHEN OLD.tipo = 'pagamento_fatura'
BEGIN
  DELETE FROM faturas_pagas WHERE transacao_id = OLD.id;
END;
`);

// Categorias padrão (só na primeira vez)
const temCategorias = db.prepare('SELECT COUNT(*) AS n FROM categorias').get().n;
if (!temCategorias) {
  const ins = db.prepare('INSERT INTO categorias (nome, tipo, cor, icone) VALUES (?, ?, ?, ?)');
  const padrao = [
    ['Entregas (apps)', 'receita', '#0F9D7A', '🛵'],
    ['Salário', 'receita', '#16A34A', '💼'],
    ['Freelance', 'receita', '#0EA5E9', '💻'],
    ['Vendas', 'receita', '#14B8A6', '🏷️'],
    ['Outras receitas', 'receita', '#64748B', '➕'],
    ['Alimentação', 'despesa', '#F97316', '🍔'],
    ['Mercado', 'despesa', '#EAB308', '🛒'],
    ['Combustível', 'despesa', '#EF4444', '⛽'],
    ['Moto (manutenção)', 'despesa', '#B91C1C', '🔧'],
    ['Transporte', 'despesa', '#F43F5E', '🚌'],
    ['Moradia', 'despesa', '#8B5CF6', '🏠'],
    ['Contas e serviços', 'despesa', '#6366F1', '💡'],
    ['Celular e internet', 'despesa', '#3B82F6', '📱'],
    ['Faculdade', 'despesa', '#0891B2', '🎓'],
    ['Saúde', 'despesa', '#10B981', '💊'],
    ['Academia', 'despesa', '#22C55E', '🏋️'],
    ['Lazer', 'despesa', '#EC4899', '🎉'],
    ['Roupas', 'despesa', '#A855F7', '👕'],
    ['Assinaturas', 'despesa', '#7C3AED', '🔁'],
    ['Seguro', 'despesa', '#475569', '🛡️'],
    ['Outras despesas', 'despesa', '#94A3B8', '📦'],
  ];
  db.transaction(() => padrao.forEach((c) => ins.run(...c)))();
}

module.exports = db;
