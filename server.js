const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 5000;

const genai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(express.json({ limit: '2mb' }));

// Service Worker: injeta um BUILD_ID único a cada (re)start do processo, garantindo
// que o cache do PWA seja invalidado a cada deploy sem precisar bumpar versão na mão.
const BUILD_ID = 'sc-' + Date.now().toString(36);
const SW_TEMPLATE = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
const SW_BODY = SW_TEMPLATE.replace(/__BUILD_ID__/g, BUILD_ID);
app.get('/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Service-Worker-Allowed', '/');
  res.send(SW_BODY);
});

app.use(express.static(__dirname));

function isHashed(s) {
  return typeof s === 'string' && s.startsWith('$2');
}

const defaultCats = [
  { id:'qualidade', nome:'Qualidade Assegurada', emoji:'✅', sub:'Documentação, registros e conformidade', itens:[
    '1. Controle de Pragas — certificado mensal disponível e dentro da validade',
    '2. Potabilidade da Água / Limpeza da Caixa D\'Água — laudo semestral disponível',
    '3. CNPJ, Alvará de Funcionamento e Licença Sanitária (CMVS) — válidos e disponíveis',
    '4. AVCB e extintores dentro do prazo de validade',
    '5. PGR, PCMSO e LTCAT — atualizados e disponíveis',
    '6. ASOs dos funcionários — admissional e periódicos em dia',
    '7. Manutenção dos equipamentos de refrigeração — laudo disponível',
    '8. Manutenção do Ar Condicionado / PMOC — em dia',
    '9. Manutenção da Tubulação da Coifa — laudo semestral disponível',
    '10. Limpeza da Caixa de Gordura — laudo de empresa terceirizada (semestral)',
    '11. Empresa Coletora de Óleo — contrato e comprovantes arquivados',
    '12. Calibração do Termômetro e da Balança — calibração anual comprovada',
    '13. Manual de Boas Práticas — disponível e atualizado',
    '14. Fichas Técnicas e FDS dos Produtos de Limpeza — disponíveis e homologados',
    '15. Certificados de Treinamentos Periódicos — em dia',
    '16. Placa de visitação à cozinha (conforme exigência da região), placa de proibido fumar, Código de Defesa do Consumidor disponível, Tabela de Informação Nutricional e Tabela de Alergênicos',
    '17. Procedimento de recebimento realizado conforme padrão e planilha de temperatura',
    '18. Quadro de gestão à vista atualizado',
    '19. Planilha de Checklist de Temperatura dos alimentos em dia',
    '20. Planilha de Checklist de recebimento de mercadorias em dia',
    '21. Planilha de Checklist de Temperatura dos equipamentos em dia',
    '22. Escala de limpeza atualizada e disponível'
  ]},
  { id:'estoque', nome:'Estoque e Insumos', emoji:'📦', sub:'Organização, validades e controle', itens:[
    'Itens identificados com data de validade e data de abertura',
    'Critério PVPS aplicado (Primeiro que Vence, Primeiro que Sai)',
    'Alimentos não armazenados diretamente no chão',
    'Separação adequada entre alimentos crus e cozidos',
    'Embalagens íntegras e sem sinais de violação',
    'Estoque seco organizado, limpo e ventilado',
    'Temperaturas das câmaras dentro do padrão (registro atualizado)',
    'Ausência de produtos vencidos ou sem sinalização',
    'Controle de estoque atualizado e alinhado ao físico',
    'Insumos de limpeza armazenados separados dos alimentos'
  ]},
  { id:'manutencao', nome:'Manutenção e Infraestrutura', emoji:'🔧', sub:'Conservação das instalações', itens:[
    'Equipamentos de refrigeração funcionando e sem avarias',
    'Equipamentos de cocção em bom estado',
    'Exaustores e coifas limpos e funcionando',
    'Instalações elétricas seguras e sem fiação exposta',
    'Encanamento sem vazamentos ou infiltrações',
    'Iluminação adequada em todos os ambientes',
    'Pisos, paredes e tetos sem rachaduras ou danos',
    'Ralos com proteção e em bom estado',
    'Banheiros em bom estado de conservação',
    'Ausência de pragas ou sinais de infestação',
    'Extintor(es) com acesso livre e dentro da validade',
    'Saídas de emergência sinalizadas e desobstruídas',
    'Luminárias protegidas contra quebra e queda, bem conservadas em toda a loja',
    'Aberturas protegidas por telas milimétricas e bem conservadas',
    'Relógio em funcionamento na parede da cozinha e timer para controle do tempo de higienização dos alimentos',
    'Produção e utilização de água quente para limpeza dos utensílios',
    'Caixa de gordura/esgoto vedados (não exala odor e não favorece acesso de pragas)',
    'Conservação geral dos mobiliários de apoio (prateleiras, estantes e bancadas)'
  ]},
  { id:'cozinha', nome:'Operação de Cozinha', emoji:'🍳', sub:'Processos, higiene e fluxo operacional', itens:[
    'Equipe com uniforme completo, limpo e adequado',
    'Uso correto de EPI (luvas, toucas, aventais)',
    'Higiene pessoal adequada (unhas, cabelos, sem adornos)',
    'Lavagem de mãos realizada nos momentos corretos',
    'Bancadas e superfícies de trabalho limpas e organizadas',
    'Tábuas de corte higienizadas e codificadas por cor',
    'Controle de temperatura dos alimentos durante preparo',
    'Fluxo unidirecional respeitado (área suja / limpa)',
    'Descarte correto de óleos e gorduras',
    'Alimentos cobertos durante armazenamento temporário',
    'Higienização correta de frutas, legumes e verduras',
    'Utensílios limpos e armazenados corretamente'
  ]},
  { id:'atendimento', nome:'Atendimento ao Cliente', emoji:'🤝', sub:'Experiência, padrão e apresentação', itens:[
    'Equipe de salão com postura e apresentação adequados',
    'Recepção e abordagem dentro do padrão da marca',
    'Cardápio atualizado, limpo e em bom estado',
    'Salão, mesas e cadeiras limpos e organizados',
    'Comunicação visual e identidade da marca em conformidade',
    'Tempo de atendimento dentro do esperado',
    'Tratamento de reclamações e situações de desconforto',
    'Caixa organizado e com procedimento correto',
    'Banheiros do cliente limpos e abastecidos',
    'Área externa (fachada, calçada) limpa e organizada'
  ]},
  { id:'produto', nome:'Produto', emoji:'🍔', sub:'Disponibilidade, padrão e qualidade', itens:[
    'Disponibilidade (pronto para consumo e preparo) para os clientes de todas as opções do cardápio',
    'Procedimentos operacionais impressos e disponíveis',
    'Cortes e gramaturas conforme o padrão da marca',
    'Produtos em quantidades adequadas nos equipamentos expositores (pista fria, vitrine) sem comprometer a temperatura',
    'Produtos com características sensoriais adequadas (incluindo o óleo da fritadeira)'
  ]},
  { id:'prevencao', nome:'Prevenção de Contaminação Microbiológica', emoji:'🦠', sub:'Higienização e controle microbiológico', itens:[
    'Presença de água filtrada em torneira',
    'Presença de produto de higienização de hortifrutis (hortifruticidas) e sabonete bactericida',
    'Pia de higienização das mãos com sabonete bactericida, álcool gel, papel toalha não reciclado, lixeira com pedal e procedimento afixado junto à pia',
    'Presença de máquina de gelo ou gelo comprado com certificado de potabilidade',
    'Ausência de caixas de papelão ou madeira (salvo nos momentos de recebimento de mercadorias)',
    'Apresentação das latas (não amassadas e sem ferrugem) e processo de higienização adequado para latas de bebidas e de alimentos'
  ]},
  { id:'abertura', nome:'Abertura de Restaurante', emoji:'🌅', sub:'Tarefas para iniciar o dia', itens:[
    'Conferir se há gás aberto',
    'Ligar Coifa/Exaustão',
    'Ligar iluminação do restaurante',
    'Checar Validades',
    'Conferir e ajustar Produção das Seções',
    'Conferir Checklist de Temperatura das Seções',
    'Conferir a Qualidade do Óleo (caso haja troca, informar na Planilha)',
    'Conferir Tabela de Degelo e caso necessário, faça o ajuste',
    'Conferir se Máquinas de Cartão/Lio e Pagers estão carregados',
    'Conferir se Totens estão atualizados e com os produtos disponíveis',
    'Conferir se o Delivery está atualizado (Ifood, FdQ etc.)',
    'Conferir se o Menu Digital está atualizado',
    'Conferir se os Banners estão com as Campanhas atuais',
    'Conferir se as seções possuem insumos prontos para abrir o restaurante',
    'Conferir se o restaurante está limpo e com Caderno de Limpeza feito',
    'Realizar a Abertura do Dia no GCom e inserir o operador',
    'Conferir se o Gestor de Pedidos (Ifood, FdQ etc.) estão funcionando',
    'Realizar a Reunião Pré Plantão (Objetivos e Metas)',
    'Conferir o Posicionamento de todos — inclusive o(a) embaixador(a)',
    'Restaurante aberto'
  ]},
  { id:'passagem', nome:'Passagem de Turno', emoji:'🔄', sub:'Tarefas para troca de plantão', itens:[
    'Checar Validades',
    'Conferir/Designar Produção (Otimizadas/Reposição para janta)',
    'Conferir Checklist de Temperatura das Seções',
    'Conferir a Qualidade do Óleo e os dados da Planilha',
    'Conferir Tabela de Degelo e caso necessário, faça o ajuste',
    'Conferir se Máquinas de Cartão/Lio e Pagers estão carregados',
    'Conferir se o restaurante está limpo para iniciar turno (checar Caderno)',
    'Conferir o processo de revezamento dos colaboradores (intervalo)',
    'Conferir se o caixa da manhã foi fechado e se há troco suficiente',
    'Realizar a Reunião Pré Plantão (Objetivos e Metas)',
    'Conferir o Posicionamento de todos — inclusive o(a) embaixador(a)',
    'Passagem de plantão realizada'
  ]},
  { id:'fechamento', nome:'Fechamento de Restaurante', emoji:'🌙', sub:'Tarefas para encerrar o dia', itens:[
    'Certifique-se de que todos os pedidos já foram produzidos',
    'Realizar o Fechamento dos Caixas e Encerramento do Dia',
    'Checar Validades',
    'Conferir possíveis desperdícios (devidamente pesados e lançados)',
    'Conferir se o Forno já está sendo lavado',
    'Conferir se a fritadeira já está desligada',
    'Conferir todos os checklists das seções para se certificar da limpeza',
    'Conferir se o descongelamento está de acordo com a tabela',
    'Conferir se o Estoque e Sala de Máquinas estão limpos e organizados',
    'Conferir se os equipamentos não utilizados estão desligados',
    'Desligar Coifa/Exaustão e gás',
    'Desligar toda a iluminação',
    'Trancar todas as portas'
  ]}
];

const defaultExtraTipos = [
  { id:'abertura', nome:'Abertura de Restaurante', catIds:['abertura'] },
  { id:'passagem', nome:'Passagem de Turno',       catIds:['passagem'] },
  { id:'fechamento',nome:'Fechamento de Restaurante',catIds:['fechamento'] },
  { id:'semanal',  nome:'Avaliação Semanal',       catIds:['qualidade','atendimento','prevencao'] }
];

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vo_users (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      cargo TEXT,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE vo_users ADD COLUMN IF NOT EXISTS foto TEXT;
    ALTER TABLE vo_users ADD COLUMN IF NOT EXISTS superior_id TEXT;
    CREATE TABLE IF NOT EXISTS vo_cats (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      emoji TEXT,
      sub TEXT,
      itens JSONB NOT NULL DEFAULT '[]'::jsonb,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS vo_tipos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      cat_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS vo_avisos (
      id SERIAL PRIMARY KEY,
      titulo TEXT NOT NULL,
      conteudo TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'comunicado',
      cargos_alvo TEXT NOT NULL DEFAULT 'todos',
      criado_por TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS vo_avisos_criado_em_idx ON vo_avisos (criado_em DESC);
    CREATE TABLE IF NOT EXISTS vo_aviso_leituras (
      aviso_id INTEGER NOT NULL REFERENCES vo_avisos(id) ON DELETE CASCADE,
      usuario_id TEXT NOT NULL,
      lido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (aviso_id, usuario_id)
    );
    CREATE TABLE IF NOT EXISTS vo_relatos (
      id SERIAL PRIMARY KEY,
      usuario_id TEXT,
      usuario_nome TEXT,
      usuario_cargo TEXT,
      tipo TEXT NOT NULL DEFAULT 'erro',
      descricao TEXT NOT NULL,
      anexo TEXT,
      status TEXT NOT NULL DEFAULT 'aberto',
      resposta TEXT,
      resposta_em TIMESTAMPTZ,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS vo_relatos_status_idx ON vo_relatos (status, criado_em DESC);
    CREATE INDEX IF NOT EXISTS vo_relatos_usuario_idx ON vo_relatos (usuario_id, criado_em DESC);
    CREATE TABLE IF NOT EXISTS vo_quiz_questions (
      id SERIAL PRIMARY KEY,
      pergunta TEXT NOT NULL,
      opcoes JSONB NOT NULL DEFAULT '[]'::jsonb,
      correta INTEGER NOT NULL DEFAULT 0,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      position INTEGER NOT NULL DEFAULT 0,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS vo_quiz_results (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_nome TEXT NOT NULL,
      cargo TEXT,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      tempo_seg INTEGER NOT NULL,
      respostas JSONB NOT NULL DEFAULT '[]'::jsonb,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS vo_quiz_positions (
      user_id TEXT PRIMARY KEY,
      last_position INTEGER,
      last_movement INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const adminHash = await bcrypt.hash('admin123', 10);
  await pool.query(
    `INSERT INTO vo_users (id, nome, cargo, email, senha, role, ativo)
     VALUES ('u1','Administrador','Admin','admin@smartcheck.net.br',$1,'admin', TRUE)
     ON CONFLICT (id) DO NOTHING`,
    [adminHash]
  );

  // Seed default categories on first run / merge in any new defaults
  const { rows } = await pool.query('SELECT id, itens FROM vo_cats');
  const existingById = new Map(rows.map(r => [r.id, r.itens]));
  const norm = s => (s || '').toString().trim().toLowerCase();
  for (let i = 0; i < defaultCats.length; i++) {
    const def = defaultCats[i];
    if (!existingById.has(def.id)) {
      await pool.query(
        `INSERT INTO vo_cats (id, nome, emoji, sub, itens, position)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO NOTHING`,
        [def.id, def.nome, def.emoji, def.sub, JSON.stringify(def.itens), i]
      );
    } else {
      // Add any default items that don't already exist (no destructive change)
      const current = existingById.get(def.id) || [];
      const merged = [...current];
      def.itens.forEach(it => {
        if (!merged.some(x => norm(x) === norm(it))) merged.push(it);
      });
      if (merged.length !== current.length) {
        await pool.query(
          'UPDATE vo_cats SET itens = $1 WHERE id = $2',
          [JSON.stringify(merged), def.id]
        );
      }
    }
  }

  // Seed default tipo "Avaliação Geral" only if no tipos exist (admin-managed afterwards)
  const tiposCount = await pool.query('SELECT COUNT(*)::int AS n FROM vo_tipos');
  if (tiposCount.rows[0].n === 0) {
    const allCatIds = defaultCats.map(c => c.id);
    await pool.query(
      `INSERT INTO vo_tipos (id, nome, cat_ids, position)
       VALUES ('geral','Avaliação Geral',$1,0)
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(allCatIds)]
    );
  }

  // Seed extra tipos (abertura, passagem, fechamento) if they were never created.
  // Uses ON CONFLICT DO NOTHING so admin edits to existing tipos are preserved.
  const { rows: existingTipoRows } = await pool.query('SELECT id FROM vo_tipos');
  const existingTipoIds = new Set(existingTipoRows.map(r => r.id));
  const maxPos = existingTipoRows.length;
  for (let i = 0; i < defaultExtraTipos.length; i++) {
    const t = defaultExtraTipos[i];
    if (!existingTipoIds.has(t.id)) {
      await pool.query(
        `INSERT INTO vo_tipos (id, nome, cat_ids, position)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO NOTHING`,
        [t.id, t.nome, JSON.stringify(t.catIds), maxPos + i]
      );
    }
  }

  // Reparo único: o seed inicial do tipo 'semanal' usou IDs de categoria inválidos
  // (equipamentos/processos não existem). Se o registro ainda contiver esses IDs
  // inválidos, sobrescreve com IDs válidos do catálogo padrão.
  try {
    const { rows } = await pool.query(`SELECT cat_ids FROM vo_tipos WHERE id='semanal'`);
    if (rows.length) {
      let cur = rows[0].cat_ids;
      if (typeof cur === 'string') { try { cur = JSON.parse(cur); } catch(_){ cur = []; } }
      if (Array.isArray(cur) && (cur.includes('equipamentos') || cur.includes('processos'))) {
        await pool.query(
          `UPDATE vo_tipos SET cat_ids=$1 WHERE id='semanal'`,
          [JSON.stringify(['qualidade','atendimento','prevencao'])]
        );
      }
    }
  } catch(e) { console.warn('migracao semanal pulada:', e.message); }
}

function publicUser(u) {
  return {
    id: u.id,
    nome: u.nome,
    cargo: u.cargo,
    email: u.email,
    role: u.role,
    ativo: u.ativo,
    foto: u.foto || null,
    superiorId: u.superior_id || u.superiorId || null,
  };
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nome, cargo, email, role, ativo, foto, superior_id AS \"superiorId\" FROM vo_users ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { nome, cargo, email, senha, role } = req.body || {};
    if (!nome || !email || !senha || senha.length < 6) {
      return res.status(400).json({ error: 'invalid_input' });
    }
    const id = 'u' + Date.now();
    const hash = await bcrypt.hash(senha, 10);
    try {
      const { rows } = await pool.query(
        `INSERT INTO vo_users (id, nome, cargo, email, senha, role, ativo, superior_id)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7)
         RETURNING id, nome, cargo, email, role, ativo, superior_id AS \"superiorId\"`,
        [id, nome, cargo || null, email.toLowerCase(), hash, role || 'user', (req.body && req.body.superiorId) || null]
      );
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'email_exists' });
      }
      throw err;
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});


app.put('/api/users/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { nome, cargo, email, role, ativo, senha, superiorId } = req.body || {};
    const n = (nome || '').toString().trim();
    const e = (email || '').toString().trim().toLowerCase();
    if (!n || !e) return res.status(400).json({ error: 'invalid_input' });
    const r = role === 'admin' ? 'admin' : 'user';
    const a = ativo !== false;
    let query, params;
    if (senha) {
      if (senha.length < 6) return res.status(400).json({ error: 'senha_fraca' });
      const hash = await bcrypt.hash(senha, 10);
      query = `UPDATE vo_users SET nome=$1, cargo=$2, email=$3, role=$4, ativo=$5, superior_id=$6, senha=$7 WHERE id=$8 RETURNING id, nome, cargo, email, role, ativo, foto, superior_id AS "superiorId"`;
      params = [n, cargo || null, e, r, a, superiorId || null, hash, id];
    } else {
      query = `UPDATE vo_users SET nome=$1, cargo=$2, email=$3, role=$4, ativo=$5, superior_id=$6 WHERE id=$7 RETURNING id, nome, cargo, email, role, ativo, foto, superior_id AS "superiorId"`;
      params = [n, cargo || null, e, r, a, superiorId || null, id];
    }
    try {
      const { rows } = await pool.query(query, params);
      if (!rows[0]) return res.status(404).json({ error: 'not_found' });
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'email_exists' });
      throw err;
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    if (req.params.id === 'u1') {
      return res.status(400).json({ error: 'cannot_delete_default_admin' });
    }
    await pool.query('DELETE FROM vo_users WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body || {};
    if (!email || !senha) return res.status(400).json({ error: 'invalid_input' });
    const { rows } = await pool.query(
      'SELECT * FROM vo_users WHERE LOWER(email)=LOWER($1) AND ativo=TRUE',
      [email]
    );
    const u = rows[0];
    if (!u) return res.status(401).json({ error: 'invalid_credentials' });

    let ok = false;
    if (isHashed(u.senha)) {
      ok = await bcrypt.compare(senha, u.senha);
    } else {
      ok = u.senha === senha;
      if (ok) {
        const newHash = await bcrypt.hash(senha, 10);
        await pool.query('UPDATE vo_users SET senha=$1 WHERE id=$2', [newHash, u.id]);
      }
    }
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
    res.json(publicUser(u));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/cats', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nome, emoji, sub, itens FROM vo_cats ORDER BY position ASC, nome ASC'
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.put('/api/cats', async (req, res) => {
  const cats = req.body;
  if (!Array.isArray(cats)) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  for (const c of cats) {
    if (!c || typeof c.id !== 'string' || !c.id || typeof c.nome !== 'string' || !Array.isArray(c.itens)) {
      return res.status(400).json({ error: 'invalid_input' });
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = cats.map(c => c.id);
    if (ids.length === 0) {
      await client.query('DELETE FROM vo_cats');
    } else {
      await client.query(
        `DELETE FROM vo_cats WHERE id <> ALL($1::text[])`,
        [ids]
      );
    }
    for (let i = 0; i < cats.length; i++) {
      const c = cats[i];
      await client.query(
        `INSERT INTO vo_cats (id, nome, emoji, sub, itens, position)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE
           SET nome = EXCLUDED.nome,
               emoji = EXCLUDED.emoji,
               sub = EXCLUDED.sub,
               itens = EXCLUDED.itens,
               position = EXCLUDED.position`,
        [c.id, c.nome, c.emoji || null, c.sub || null, JSON.stringify(c.itens), i]
      );
    }
    await client.query('COMMIT');
    const { rows } = await client.query(
      'SELECT id, nome, emoji, sub, itens FROM vo_cats ORDER BY position ASC, nome ASC'
    );
    res.json(rows);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  } finally {
    client.release();
  }
});

app.get('/api/tipos', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nome, cat_ids FROM vo_tipos ORDER BY position ASC, nome ASC'
    );
    res.json(rows.map(r => ({ id: r.id, nome: r.nome, catIds: r.cat_ids || [] })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.put('/api/tipos', async (req, res) => {
  const tipos = req.body;
  if (!Array.isArray(tipos) || tipos.length === 0) {
    return res.status(400).json({ error: 'invalid_input', detail: 'É necessário ao menos 1 tipo' });
  }
  for (const t of tipos) {
    if (!t || typeof t.id !== 'string' || !t.id || typeof t.nome !== 'string' || !t.nome.trim() || !Array.isArray(t.catIds)) {
      return res.status(400).json({ error: 'invalid_input' });
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = tipos.map(t => t.id);
    await client.query(`DELETE FROM vo_tipos WHERE id <> ALL($1::text[])`, [ids]);
    for (let i = 0; i < tipos.length; i++) {
      const t = tipos[i];
      await client.query(
        `INSERT INTO vo_tipos (id, nome, cat_ids, position)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE
           SET nome = EXCLUDED.nome,
               cat_ids = EXCLUDED.cat_ids,
               position = EXCLUDED.position`,
        [t.id, t.nome.trim(), JSON.stringify(t.catIds), i]
      );
    }
    await client.query('COMMIT');
    const { rows } = await client.query(
      'SELECT id, nome, cat_ids FROM vo_tipos ORDER BY position ASC, nome ASC'
    );
    res.json(rows.map(r => ({ id: r.id, nome: r.nome, catIds: r.cat_ids || [] })));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  } finally {
    client.release();
  }
});

app.post('/api/plano', async (req, res) => {
  if (!genai) {
    return res.status(503).json({ error: 'ai_not_configured' });
  }
  try {
    const { restaurante, tipoNome, nota, naoConformes, naoAvaliados } = req.body || {};
    const nc = Array.isArray(naoConformes) ? naoConformes : [];
    const na = Array.isArray(naoAvaliados) ? naoAvaliados : [];
    if (nc.length === 0 && na.length === 0) {
      return res.json({ plano: 'Vistoria sem pontos não conformes nem itens não avaliados. Operação dentro do padrão — manter rotinas atuais.' });
    }
    const ncTxt = nc.length
      ? nc.map((x, i) => `${i + 1}. [${x.categoria}] ${x.item}${x.observacao ? ' (obs: ' + x.observacao + ')' : ''}`).join('\n')
      : '— nenhum —';
    const naTxt = na.length
      ? na.map((x, i) => `${i + 1}. [${x.categoria}] ${x.item} — motivo: ${x.motivo || 'não informado'}`).join('\n')
      : '— nenhum —';

    const prompt = `Você é um consultor especialista em operações de restaurantes no Brasil. Com base na vistoria abaixo, escreva um PLANO DE AÇÃO em português brasileiro, objetivo e prático, para corrigir os pontos não atingidos.

Restaurante: ${restaurante || '(não informado)'}
Tipo de avaliação: ${tipoNome || '(não informado)'}
Nota geral: ${typeof nota === 'number' ? nota.toFixed(1) : nota}/5

PONTOS NÃO CONFORMES (precisam correção):
${ncTxt}

ITENS NÃO AVALIADOS (não foi possível verificar):
${naTxt}

Formato da resposta:
- Comece com 1 parágrafo curto de resumo (no máximo 3 linhas), citando os principais riscos.
- Em seguida, liste de 3 a 8 ações práticas, cada uma com PRIORIDADE (Alta / Média / Baixa) e PRAZO sugerido (24h, 7 dias, 30 dias).
- Para itens "não avaliados", sugira como viabilizar a verificação.
- Tom profissional, direto e respeitoso. Não invente fatos que não estejam na vistoria.
- Use texto simples (sem títulos grandes nem tabelas). Pode usar marcadores "-" e quebras de linha.
- Limite total: 350 palavras.`;

    const response = await genai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const plano = (response.text || '').trim();
    if (!plano) return res.status(502).json({ error: 'empty_response' });
    res.json({ plano });
  } catch (e) {
    console.error('AI error:', e);
    res.status(500).json({ error: 'ai_error', detail: e.message || String(e) });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nome, cargo, email, role, ativo, foto, superior_id AS \"superiorId\" FROM vo_users WHERE id=$1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

// Atualiza a foto de perfil. Aceita data URL (image/jpeg ou image/png) ou null para remover.
// Tamanho máximo: ~700KB já que o body limit do Express é 2MB e há overhead de JSON.
app.put('/api/users/:id/foto', async (req, res) => {
  try {
    const { foto } = req.body || {};
    if (foto !== null && foto !== '') {
      if (typeof foto !== 'string') return res.status(400).json({ error: 'invalid_input' });
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(foto)) {
        return res.status(400).json({ error: 'invalid_format' });
      }
      if (foto.length > 900_000) return res.status(413).json({ error: 'too_large' });
    }
    const value = (foto && foto.length) ? foto : null;
    const { rows } = await pool.query(
      `UPDATE vo_users SET foto=$1 WHERE id=$2
       RETURNING id, nome, cargo, email, role, ativo, foto`,
      [value, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

// Troca de senha
app.put('/api/users/:id/senha', async (req, res) => {
  try {
    const { senha } = req.body || {};
    if (!senha || senha.length < 6) return res.status(400).json({ error: 'senha_fraca' });
    const hash = await bcrypt.hash(senha, 10);
    const { rows } = await pool.query(
      `UPDATE vo_users SET senha=$1 WHERE id=$2 RETURNING id`,
      [hash, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// INTRANET (mensagens automáticas ao superior)
// ──────────────────────────────────────────────────────────────────────────
app.post('/api/intranet', async (req, res) => {
  try {
    const { para, paraNome, de, cargo, assunto, corpo, ts } = req.body || {};
    if (!para || !assunto || !corpo) return res.status(400).json({ error: 'missing_fields' });
    await pool.query(
      `CREATE TABLE IF NOT EXISTS vo_intranet (
         id SERIAL PRIMARY KEY,
         para_id TEXT NOT NULL,
         para_nome TEXT,
         de_nome TEXT,
         cargo TEXT,
         assunto TEXT,
         corpo TEXT,
         lido BOOLEAN DEFAULT false,
         criado_em TIMESTAMPTZ DEFAULT NOW()
       )`
    );
    const { rows } = await pool.query(
      `INSERT INTO vo_intranet (para_id, para_nome, de_nome, cargo, assunto, corpo)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [para.toString(), paraNome||'', de||'', cargo||'', assunto, corpo]
    );
    res.json({ ok:true, id: rows[0].id });
  } catch(e) {
    console.error('POST /api/intranet:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/intranet', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    await pool.query(
      `CREATE TABLE IF NOT EXISTS vo_intranet (
         id SERIAL PRIMARY KEY,
         para_id TEXT NOT NULL,
         para_nome TEXT,
         de_nome TEXT,
         cargo TEXT,
         assunto TEXT,
         corpo TEXT,
         lido BOOLEAN DEFAULT false,
         criado_em TIMESTAMPTZ DEFAULT NOW()
       )`
    );
    const { rows } = await pool.query(
      `SELECT id, de_nome, cargo, assunto, corpo, lido, criado_em
         FROM vo_intranet WHERE para_id=$1 ORDER BY criado_em DESC LIMIT 100`,
      [userId.toString()]
    );
    res.json(rows);
  } catch(e) {
    console.error('GET /api/intranet:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.put('/api/intranet/:id/lido', async (req, res) => {
  try {
    await pool.query('UPDATE vo_intranet SET lido=true WHERE id=$1', [req.params.id]);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: 'db_error' }); }
});


async function getQuizRanking() {
  const { rows } = await pool.query(`
    WITH best AS (
      SELECT DISTINCT ON (user_id)
        user_id, user_nome, cargo, score, total, tempo_seg, criado_em
      FROM vo_quiz_results
      ORDER BY user_id, score DESC, tempo_seg ASC, criado_em ASC
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, tempo_seg ASC, criado_em ASC) AS position
      FROM best
    )
    SELECT r.*, COALESCE(p.last_movement,0) AS movement
      FROM ranked r
      LEFT JOIN vo_quiz_positions p ON p.user_id = r.user_id
     ORDER BY position ASC
     LIMIT 100`);
  return rows;
}

async function refreshQuizPositions(previousPositions) {
  const ranking = await getQuizRanking();
  for (const r of ranking) {
    const prev = previousPositions && previousPositions.has(r.user_id) ? previousPositions.get(r.user_id) : null;
    const movement = prev ? (prev - Number(r.position)) : 0;
    await pool.query(
      `INSERT INTO vo_quiz_positions (user_id, last_position, last_movement, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (user_id) DO UPDATE SET last_position=$2, last_movement=$3, updated_at=NOW()`,
      [r.user_id, Number(r.position), movement]
    );
  }
  return getQuizRanking();
}

app.get('/api/quiz/questions', async (req, res) => {
  try {
    const admin = (req.query.admin || '') === '1';
    const { rows } = await pool.query(
      `SELECT id, pergunta, opcoes, correta, ativo FROM vo_quiz_questions ${admin ? '' : 'WHERE ativo=TRUE'} ORDER BY position ASC, id ASC`
    );
    res.json(rows.map(r => ({ id:r.id, pergunta:r.pergunta, opcoes:r.opcoes || [], correta:r.correta, ativo:r.ativo })));
  } catch (e) { console.error(e); res.status(500).json({ error:'db_error' }); }
});

app.put('/api/quiz/questions', async (req, res) => {
  const questions = req.body;
  if (!Array.isArray(questions)) return res.status(400).json({ error:'invalid_input' });
  for (const q of questions) {
    if (!q || !q.pergunta || !Array.isArray(q.opcoes) || q.opcoes.length < 2) return res.status(400).json({ error:'invalid_input' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = questions.filter(q => q.id).map(q => Number(q.id)).filter(Number.isFinite);
    if (ids.length) await client.query('DELETE FROM vo_quiz_questions WHERE id <> ALL($1::int[])', [ids]);
    else await client.query('DELETE FROM vo_quiz_questions');
    for (let i=0;i<questions.length;i++) {
      const q = questions[i];
      const opcoes = q.opcoes.map(x => String(x || '').trim()).filter(Boolean).slice(0,4);
      const correta = Math.max(0, Math.min(opcoes.length - 1, Number(q.correta) || 0));
      if (q.id) {
        await client.query(`UPDATE vo_quiz_questions SET pergunta=$1, opcoes=$2, correta=$3, ativo=$4, position=$5 WHERE id=$6`,
          [String(q.pergunta).trim(), JSON.stringify(opcoes), correta, q.ativo !== false, i, q.id]);
      } else {
        await client.query(`INSERT INTO vo_quiz_questions (pergunta, opcoes, correta, ativo, position) VALUES ($1,$2,$3,$4,$5)`,
          [String(q.pergunta).trim(), JSON.stringify(opcoes), correta, q.ativo !== false, i]);
      }
    }
    await client.query('COMMIT');
    const { rows } = await pool.query('SELECT id, pergunta, opcoes, correta, ativo FROM vo_quiz_questions ORDER BY position ASC, id ASC');
    res.json(rows.map(r => ({ id:r.id, pergunta:r.pergunta, opcoes:r.opcoes || [], correta:r.correta, ativo:r.ativo })));
  } catch(e) { await client.query('ROLLBACK').catch(()=>{}); console.error(e); res.status(500).json({ error:'db_error' }); }
  finally { client.release(); }
});

app.get('/api/quiz/ranking', async (_req, res) => {
  try { res.json(await getQuizRanking()); }
  catch(e) { console.error(e); res.status(500).json({ error:'db_error' }); }
});

app.post('/api/quiz/results', async (req, res) => {
  try {
    const { userId, userNome, cargo, score, total, tempoSeg, respostas } = req.body || {};
    if (!userId || !userNome || !Number.isFinite(Number(score)) || !Number.isFinite(Number(total))) return res.status(400).json({ error:'invalid_input' });
    const before = await getQuizRanking();
    const prev = new Map(before.map(r => [r.user_id, Number(r.position)]));
    await pool.query(
      `INSERT INTO vo_quiz_results (user_id, user_nome, cargo, score, total, tempo_seg, respostas) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [String(userId), String(userNome).slice(0,120), cargo || null, Number(score), Number(total), Math.max(0, Number(tempoSeg)||0), JSON.stringify(Array.isArray(respostas)?respostas:[])]
    );
    const ranking = await refreshQuizPositions(prev);
    res.json({ ok:true, ranking });
  } catch(e) { console.error(e); res.status(500).json({ error:'db_error' }); }
});

// ──────────────────────────────────────────────────────────────────────────
// AVISOS (mural de comunicados Admin → Usuários)
// ──────────────────────────────────────────────────────────────────────────
const CATEGORIAS_AVISO = new Set(['comunicado','atualizacao','aviso','dica']);

function parseCargosAlvo(raw) {
  const s = (raw || 'todos').toString().trim();
  if (!s || s === 'todos') return 'todos';
  return s.split(',').map(x => x.trim()).filter(Boolean).join(',') || 'todos';
}
function avisoVisivelParaCargo(cargosAlvo, cargoUsuario) {
  if (!cargosAlvo || cargosAlvo === 'todos') return true;
  if (!cargoUsuario) return false;
  return cargosAlvo.split(',').map(s=>s.trim()).includes(cargoUsuario);
}

// GET /api/avisos?userId=...&cargo=...&since=ISO
// - userId obrigatório (para marcar lido/não-lido)
// - cargo filtra por segmento; admin recebe tudo
// - since: timestamp ISO opcional → retorna só avisos criados depois (para push polling)
app.get('/api/avisos', async (req, res) => {
  try {
    const userId = (req.query.userId || '').toString();
    const cargo = (req.query.cargo || '').toString();
    const role = (req.query.role || '').toString();
    const since = (req.query.since || '').toString();
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    const params = [];
    let where = '1=1';
    if (since) { params.push(since); where += ` AND a.criado_em > $${params.length}`; }
    params.push(userId);
    const userIdIdx = params.length;
    const { rows } = await pool.query(
      `SELECT a.id, a.titulo, a.conteudo, a.categoria, a.cargos_alvo, a.criado_por, a.criado_em,
              (l.usuario_id IS NOT NULL) AS lido
         FROM vo_avisos a
         LEFT JOIN vo_aviso_leituras l
           ON l.aviso_id = a.id AND l.usuario_id = $${userIdIdx}
        WHERE ${where}
        ORDER BY a.criado_em DESC
        LIMIT 200`,
      params
    );
    const visiveis = role === 'admin'
      ? rows
      : rows.filter(r => avisoVisivelParaCargo(r.cargos_alvo, cargo));
    res.json(visiveis);
  } catch (e) {
    console.error('GET /api/avisos:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

// POST /api/avisos — cria aviso (apenas admin no front; backend confia no client por consistência com o restante da app)
app.post('/api/avisos', async (req, res) => {
  try {
    const { titulo, conteudo, categoria, cargosAlvo, criadoPor } = req.body || {};
    const t = (titulo || '').toString().trim();
    const c = (conteudo || '').toString().trim();
    if (!t || !c) return res.status(400).json({ error: 'missing_fields' });
    if (t.length > 120) return res.status(400).json({ error: 'titulo_too_long' });
    if (c.length > 4000) return res.status(400).json({ error: 'conteudo_too_long' });
    const cat = CATEGORIAS_AVISO.has(categoria) ? categoria : 'comunicado';
    const alvos = parseCargosAlvo(cargosAlvo);
    const { rows } = await pool.query(
      `INSERT INTO vo_avisos (titulo, conteudo, categoria, cargos_alvo, criado_por)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, titulo, conteudo, categoria, cargos_alvo, criado_por, criado_em`,
      [t, c, cat, alvos, (criadoPor || '').toString().slice(0,80) || null]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /api/avisos:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

// PUT /api/avisos/:id — edita aviso
app.put('/api/avisos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const { titulo, conteudo, categoria, cargosAlvo } = req.body || {};
    const t = (titulo || '').toString().trim();
    const c = (conteudo || '').toString().trim();
    if (!t || !c) return res.status(400).json({ error: 'missing_fields' });
    if (t.length > 120) return res.status(400).json({ error: 'titulo_too_long' });
    if (c.length > 4000) return res.status(400).json({ error: 'conteudo_too_long' });
    const cat = CATEGORIAS_AVISO.has(categoria) ? categoria : 'comunicado';
    const alvos = parseCargosAlvo(cargosAlvo);
    const { rows } = await pool.query(
      `UPDATE vo_avisos
          SET titulo=$1, conteudo=$2, categoria=$3, cargos_alvo=$4
        WHERE id=$5
        RETURNING id, titulo, conteudo, categoria, cargos_alvo, criado_por, criado_em`,
      [t, c, cat, alvos, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('PUT /api/avisos:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

// DELETE /api/avisos/:id
app.delete('/api/avisos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const r = await pool.query('DELETE FROM vo_avisos WHERE id=$1', [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/avisos:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

// POST /api/avisos/:id/marcar-lido — marca como lido pelo usuário
app.post('/api/avisos/:id/marcar-lido', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { userId } = req.body || {};
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    await pool.query(
      `INSERT INTO vo_aviso_leituras (aviso_id, usuario_id)
       VALUES ($1,$2) ON CONFLICT (aviso_id, usuario_id) DO NOTHING`,
      [id, userId.toString()]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('POST marcar-lido:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// RELATOS (Usuários → Admin: erros, sugestões, dúvidas)
// ──────────────────────────────────────────────────────────────────────────
const TIPOS_RELATO = new Set(['erro','sugestao','duvida']);
const STATUS_RELATO = new Set(['aberto','visto','resolvido']);

// GET /api/relatos?userId=...&role=...
// admin: todos; usuário comum: apenas os próprios
app.get('/api/relatos', async (req, res) => {
  try {
    const userId = (req.query.userId || '').toString();
    const role = (req.query.role || '').toString();
    let rows;
    if (role === 'admin') {
      ({ rows } = await pool.query(
        `SELECT id, usuario_id, usuario_nome, usuario_cargo, tipo, descricao,
                (anexo IS NOT NULL) AS tem_anexo, status, resposta, resposta_em, criado_em
           FROM vo_relatos ORDER BY
             CASE status WHEN 'aberto' THEN 0 WHEN 'visto' THEN 1 ELSE 2 END,
             criado_em DESC LIMIT 500`
      ));
    } else {
      if (!userId) return res.status(400).json({ error: 'missing_userId' });
      ({ rows } = await pool.query(
        `SELECT id, usuario_id, usuario_nome, usuario_cargo, tipo, descricao,
                (anexo IS NOT NULL) AS tem_anexo, status, resposta, resposta_em, criado_em
           FROM vo_relatos WHERE usuario_id=$1 ORDER BY criado_em DESC LIMIT 200`,
        [userId]
      ));
    }
    res.json(rows);
  } catch (e) {
    console.error('GET /api/relatos:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

// GET /api/relatos/:id/anexo — devolve a imagem anexada (data URL)
app.get('/api/relatos/:id/anexo', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const { rows } = await pool.query('SELECT anexo FROM vo_relatos WHERE id=$1', [id]);
    if (!rows[0] || !rows[0].anexo) return res.status(404).json({ error: 'not_found' });
    res.json({ anexo: rows[0].anexo });
  } catch (e) {
    console.error('GET anexo:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

// POST /api/relatos — cria relato
app.post('/api/relatos', async (req, res) => {
  try {
    const { usuarioId, usuarioNome, usuarioCargo, tipo, descricao, anexo } = req.body || {};
    const desc = (descricao || '').toString().trim();
    if (!desc) return res.status(400).json({ error: 'missing_descricao' });
    if (desc.length > 4000) return res.status(400).json({ error: 'descricao_too_long' });
    const tp = TIPOS_RELATO.has(tipo) ? tipo : 'erro';
    let anexoVal = null;
    if (anexo) {
      if (typeof anexo !== 'string') return res.status(400).json({ error: 'invalid_anexo' });
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(anexo)) {
        return res.status(400).json({ error: 'invalid_anexo_format' });
      }
      if (anexo.length > 900_000) return res.status(413).json({ error: 'anexo_too_large' });
      anexoVal = anexo;
    }
    const { rows } = await pool.query(
      `INSERT INTO vo_relatos (usuario_id, usuario_nome, usuario_cargo, tipo, descricao, anexo, status)
       VALUES ($1,$2,$3,$4,$5,$6,'aberto')
       RETURNING id, usuario_id, usuario_nome, usuario_cargo, tipo, descricao,
                 (anexo IS NOT NULL) AS tem_anexo, status, resposta, resposta_em, criado_em`,
      [
        (usuarioId || '').toString().slice(0,64) || null,
        (usuarioNome || '').toString().slice(0,120) || null,
        (usuarioCargo || '').toString().slice(0,80) || null,
        tp, desc, anexoVal
      ]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /api/relatos:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

// PUT /api/relatos/:id — admin atualiza status e/ou resposta
app.put('/api/relatos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const { status, resposta } = req.body || {};
    const sets = [];
    const params = [];
    if (status !== undefined) {
      if (!STATUS_RELATO.has(status)) return res.status(400).json({ error: 'invalid_status' });
      params.push(status); sets.push(`status=$${params.length}`);
    }
    if (resposta !== undefined) {
      const r = (resposta || '').toString().trim();
      if (r.length > 4000) return res.status(400).json({ error: 'resposta_too_long' });
      if (r) {
        params.push(r); sets.push(`resposta=$${params.length}`);
        sets.push(`resposta_em=NOW()`);
      } else {
        sets.push(`resposta=NULL`);
        sets.push(`resposta_em=NULL`);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE vo_relatos SET ${sets.join(', ')} WHERE id=$${params.length}
       RETURNING id, usuario_id, usuario_nome, usuario_cargo, tipo, descricao,
                 (anexo IS NOT NULL) AS tem_anexo, status, resposta, resposta_em, criado_em`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('PUT /api/relatos:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

// DELETE /api/relatos/:id — admin remove relato
app.delete('/api/relatos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const r = await pool.query('DELETE FROM vo_relatos WHERE id=$1', [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/relatos:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

ensureSchema()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Smart Check server running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize schema:', err);
    process.exit(1);
  });
