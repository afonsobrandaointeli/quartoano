// server.js

require('dotenv').config(); // Carrega as variáveis do arquivo .env (se existir)
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Configura o EJS como view engine e define a pasta de views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configura a pasta para arquivos estáticos (CSS, JS, imagens, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Para tratar dados enviados via formulário (application/x-www-form-urlencoded)
app.use(express.urlencoded({ extended: false }));

// Connection string para o PostgreSQL – use a variável de ambiente ou o valor padrão
const DATABASE_URL =
  process.env.DATABASE_URL
  
const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false // Necessário para alguns provedores que exigem SSL
    }
  }
});

/* ============================
   Modelos do Banco de Dados
============================= */

// Modelo para a tabela 'projetos'
// Campos:
//   id                   -> integer, não auto-increment, chave primária
//   tema                 -> character varying(255), NOT NULL
//   descricao            -> text, pode ser nulo
//   professor_orientador -> character varying(255), NOT NULL
//   trilha               -> character varying(255), pode ser nulo
const Projeto = sequelize.define('Projeto', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false
  },
  tema: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  professor_orientador: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  trilha: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'projetos',
  timestamps: false
});

// Modelo para a tabela 'alunos'
// Campos:
//   id         -> integer, auto-increment, chave primária
//   nome       -> character varying(255), NOT NULL
//   email      -> character varying(255), NOT NULL
//   projeto_id -> integer, pode ser nulo, chave estrangeira para projetos.id
const Aluno = sequelize.define('Aluno', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nome: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  projeto_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Projeto,
      key: 'id'
    }
  }
}, {
  tableName: 'alunos',
  timestamps: false
});

// Define as relações: Um Projeto possui muitos Alunos e cada Aluno pertence a um Projeto
Projeto.hasMany(Aluno, { foreignKey: 'projeto_id', as: 'alunos' });
Aluno.belongsTo(Projeto, { foreignKey: 'projeto_id', as: 'projeto' });

// Testa a conexão com o banco
sequelize.authenticate()
  .then(() => console.log('Conexão com o banco estabelecida com sucesso!'))
  .catch(err => console.error('Erro ao conectar no banco:', err));

/* ============================
   ROTAS PARA PROJETOS
============================= */

// Rota principal: exibe todos os projetos (com seus alunos) e permite filtrar
app.get('/', async (req, res) => {
  try {
    const filtro = req.query.filtro ? req.query.filtro.trim() : '';
    let projetos = await Projeto.findAll({
      include: [{ model: Aluno, as: 'alunos' }]
    });

    // Aplica o filtro (por ID, professor ou nome do aluno)
    if (filtro) {
      projetos = projetos.filter(proj => {
        // Filtra pelo ID (convertido para string)
        if (proj.id.toString().includes(filtro)) return true;
        // Filtra pelo professor orientador (case insensitive)
        if (proj.professor_orientador && proj.professor_orientador.toLowerCase().includes(filtro.toLowerCase())) return true;
        // Filtra pelo nome de algum aluno associado
        if (proj.alunos && proj.alunos.some(aluno => aluno.nome.toLowerCase().includes(filtro.toLowerCase()))) return true;
        return false;
      });
    }
    res.render('index', { projetos, filtro });
  } catch (error) {
    res.status(500).send("Erro ao buscar projetos: " + error);
  }
});

// Formulário para criar um novo projeto
app.get('/projetos/new', (req, res) => {
  res.render('newProject');
});

// Rota para salvar um novo projeto
app.post('/projetos', async (req, res) => {
  const { id, tema, descricao, professor_orientador, trilha } = req.body;
  try {
    await Projeto.create({
      id: parseInt(id),
      tema,
      descricao,
      professor_orientador,
      trilha
    });
    res.redirect('/');
  } catch (error) {
    res.status(500).send("Erro ao criar projeto: " + error);
  }
});

// Formulário para editar um projeto
app.get('/projetos/:id/edit', async (req, res) => {
  try {
    const projeto = await Projeto.findByPk(req.params.id);
    if (!projeto) return res.status(404).send("Projeto não encontrado");

    // Seleciona os professores distintos para preencher o dropdown
    const professores = await Projeto.findAll({
      attributes: [
        [sequelize.fn('DISTINCT', sequelize.col('professor_orientador')), 'professor_orientador']
      ],
      raw: true
    });
    res.render('editProject', { projeto, professores });
  } catch (error) {
    res.status(500).send("Erro ao buscar projeto: " + error);
  }
});

// Rota para atualizar os dados de um projeto (incluindo alteração de ID)
app.post('/projetos/:id', async (req, res) => {
  const { new_id, tema, descricao, professor_orientador, trilha } = req.body;
  try {
    const projeto = await Projeto.findByPk(req.params.id);
    if (!projeto) return res.status(404).send("Projeto não encontrado");

    projeto.id = parseInt(new_id);
    projeto.tema = tema;
    projeto.descricao = descricao;
    projeto.professor_orientador = professor_orientador;
    projeto.trilha = trilha;

    await projeto.save();
    res.redirect('/');
  } catch (error) {
    res.status(500).send("Erro ao atualizar projeto: " + error);
  }
});

// Rota para excluir um projeto
app.post('/projetos/:id/delete', async (req, res) => {
  try {
    const projeto = await Projeto.findByPk(req.params.id);
    if (!projeto) return res.status(404).send("Projeto não encontrado");

    await projeto.destroy();
    res.redirect('/');
  } catch (error) {
    res.status(500).send("Erro ao excluir projeto: " + error);
  }
});

/* ============================
   ROTAS PARA ALUNOS
============================= */

// Exibe a lista de alunos (com informações do projeto, se houver)
app.get('/alunos', async (req, res) => {
  try {
    const alunos = await Aluno.findAll({
      include: [{ model: Projeto, as: 'projeto' }]
    });
    res.render('alunos', { alunos });
  } catch (error) {
    res.status(500).send("Erro ao buscar alunos: " + error);
  }
});

// Formulário para cadastrar um novo aluno
app.get('/alunos/new', async (req, res) => {
  try {
    const projetos = await Projeto.findAll();
    res.render('newAluno', { projetos });
  } catch (error) {
    res.status(500).send("Erro ao buscar projetos: " + error);
  }
});

// Rota para salvar o novo aluno
app.post('/alunos', async (req, res) => {
  const { nome, email, projeto_id } = req.body;
  try {
    await Aluno.create({
      nome,
      email,
      projeto_id: projeto_id ? parseInt(projeto_id) : null
    });
    res.redirect('/alunos');
  } catch (error) {
    res.status(500).send("Erro ao criar aluno: " + error);
  }
});

// Formulário para editar um aluno
app.get('/alunos/:id/edit', async (req, res) => {
  try {
    const aluno = await Aluno.findByPk(req.params.id);
    if (!aluno) return res.status(404).send("Aluno não encontrado");
    const projetos = await Projeto.findAll();
    res.render('editAluno', { aluno, projetos });
  } catch (error) {
    res.status(500).send("Erro ao buscar aluno: " + error);
  }
});

// Rota para atualizar os dados de um aluno
app.post('/alunos/:id', async (req, res) => {
  const { nome, email, projeto_id } = req.body;
  try {
    const aluno = await Aluno.findByPk(req.params.id);
    if (!aluno) return res.status(404).send("Aluno não encontrado");

    aluno.nome = nome;
    aluno.email = email;
    aluno.projeto_id = projeto_id ? parseInt(projeto_id) : null;

    await aluno.save();
    res.redirect('/alunos');
  } catch (error) {
    res.status(500).send("Erro ao atualizar aluno: " + error);
  }
});

// Rota para excluir um aluno
app.post('/alunos/:id/delete', async (req, res) => {
  try {
    const aluno = await Aluno.findByPk(req.params.id);
    if (!aluno) return res.status(404).send("Aluno não encontrado");

    await aluno.destroy();
    res.redirect('/alunos');
  } catch (error) {
    res.status(500).send("Erro ao excluir aluno: " + error);
  }
});

// Inicia o servidor
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
