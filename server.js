// Fluxo — servidor principal.

// Esconde o aviso "SQLite is an experimental feature" do Node (o resto dos avisos continua aparecendo).
const emitWarningOriginal = process.emitWarning;
process.emitWarning = (aviso, ...resto) => {
  if (String(aviso && aviso.message ? aviso.message : aviso).includes('SQLite')) return;
  return emitWarningOriginal.call(process, aviso, ...resto);
};
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');

const PORT = Number(process.env.PORT) || 3100;
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Chave secreta das sessões: gerada sozinha na primeira execução e guardada em data/.
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
const SECRET = process.env.SESSION_SECRET || fs.readFileSync(SECRET_FILE, 'utf8').trim();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // atrás do Nginx

app.use(express.json({ limit: '200kb' }));
app.use(cookieSession({
  name: 'fluxo',
  keys: [SECRET],
  maxAge: 30 * 24 * 60 * 60 * 1000, // fica logado por 30 dias
  httpOnly: true,
  sameSite: 'lax',
}));
// Cookie "secure" só quando o acesso vem por HTTPS (via Nginx); em HTTP local continua funcionando.
app.use((req, res, next) => { req.sessionOptions.secure = req.secure; next(); });

// Renova a sessão a cada acesso (para não deslogar quem usa todo dia).
app.use((req, res, next) => { if (req.session && req.session.uid) req.session.t = Math.floor(Date.now() / 60000); next(); });

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

app.use('/api', require('./src/api'));
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));
app.get('/{*rota}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno. Tente de novo.' });
});

app.listen(PORT, () => console.log(`Fluxo rodando em http://localhost:${PORT}`));
