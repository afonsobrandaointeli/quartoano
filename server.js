// server.js

require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const app = express();
const port = process.env.PORT || 3000;

// Configuração do view engine (EJS) e pasta de views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Pasta para arquivos estáticos (CSS, JS, imagens, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Para tratar dados enviados via formulários
app.use(express.urlencoded({ extended: false }));

// Conexão com o PostgreSQL
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://getcommits_user:X4oeIBBTdnpQiyI5x0XcmdVHcze5ooY1@dpg-cpg3p8mct0pc73d6f8m0-a.oregon-postgres.render.com/getcommits';

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

/* ============================
   MODELOS DO BANCO DE DADOS
============================= */

// Modelo para a tabela 'projetos'
const Projeto = sequelize.define('Projeto', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false
  },
  trilha: {
    type: DataTypes.STRING(255),
    allowNull: true
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
  }
}, {
  tableName: 'projetos',
  timestamps: false
});

// Modelo para a tabela 'alunos'
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

// Definindo as relações
Projeto.hasMany(Aluno, { foreignKey: 'projeto_id', as: 'alunos' });
Aluno.belongsTo(Projeto, { foreignKey: 'projeto_id', as: 'projeto' });

// Teste de conexão
sequelize.authenticate()
  .then(() => console.log('Conexão com o banco estabelecida com sucesso!'))
  .catch(err => console.error('Erro ao conectar no banco:', err));

/* ============================
   ROTAS PARA A PÁGINA INICIAL (HOME)
============================= */

app.get('/', async (req, res) => {
  try {
    // Obtemos o filtro da query string, se houver
    const filtro = req.query.filtro ? req.query.filtro.trim() : '';
    // Busca todos os projetos, incluindo os alunos associados
    let projetos = await Projeto.findAll({
      include: [{ model: Aluno, as: 'alunos' }]
    });
    // Se houver filtro, filtra os projetos em memória
    if (filtro) {
      projetos = projetos.filter(proj => {
        if (proj.id.toString().includes(filtro)) return true;
        if (proj.professor_orientador && proj.professor_orientador.toLowerCase().includes(filtro.toLowerCase())) return true;
        if (proj.trilha && proj.trilha.toLowerCase().includes(filtro.toLowerCase())) return true;
        if (proj.alunos && proj.alunos.some(aluno => aluno.nome.toLowerCase().includes(filtro.toLowerCase()))) return true;
        return false;
      });
    }
    // Renderiza a página index.ejs, passando o filtro e os projetos
    res.render('index', { filtro, projetos });
  } catch (error) {
    res.status(500).send("Erro ao carregar a página inicial: " + error);
  }
});

/* ============================
   ROTAS PARA PROJETOS
============================= */

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
    // Consulta os professores distintos para o dropdown
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

// Lista de alunos (com informações do projeto associado)
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

/* ============================
   ROTAS PARA RELATÓRIO
============================= */

// Função para obter projetos agregados (similar ao script Python)
async function obterProjetosAgrupados() {
  const sql = `
    SELECT p.id, p.trilha, p.tema, p.professor_orientador, p.descricao,
           COALESCE(STRING_AGG(a.nome, ', ' ORDER BY a.nome), 'Sem alunos') AS alunos
    FROM projetos p
    LEFT JOIN alunos a ON p.id = a.projeto_id
    GROUP BY p.id, p.trilha, p.tema, p.professor_orientador, p.descricao
  `;
  const projetos = await sequelize.query(sql, { type: Sequelize.QueryTypes.SELECT });
  return projetos;
}

app.get('/relatorio', async (req, res) => {
  try {
    let projetos = await obterProjetosAgrupados();
    
    // Exclui projetos com trilha "Intercâmbio"
    projetos = projetos.filter(p => p.trilha !== 'Intercâmbio');
    
    const professorFilter = req.query.professor ? req.query.professor.trim() : 'Todos';
    const trilhaFilter = req.query.trilha ? req.query.trilha.trim() : 'Todas';
    const alunoFilter = req.query.aluno ? req.query.aluno.trim() : '';
    
    if (professorFilter !== 'Todos') {
      projetos = projetos.filter(p => p.professor_orientador === professorFilter);
    }
    
    if (trilhaFilter !== 'Todas') {
      projetos = projetos.filter(p => p.trilha === trilhaFilter);
    }
    
    if (alunoFilter) {
      projetos = projetos.filter(p => p.alunos.toLowerCase().includes(alunoFilter.toLowerCase()));
    }
    
    const todosProjetos = await obterProjetosAgrupados();
    const professores = [...new Set(todosProjetos.map(p => p.professor_orientador).filter(Boolean))];
    const trilhas = [...new Set(todosProjetos.map(p => p.trilha).filter(Boolean))];
    
    // Cálculo para o gráfico de donut (categorias: Acadêmica, Corporativa, Empreendedora)
    const trilhaCategorias = ["Acadêmica", "Corporativa", "Empreendedora"];
    const trilhaCounts = { "Acadêmica": 0, "Corporativa": 0, "Empreendedora": 0 };
    projetos.forEach(p => {
      if (trilhaCategorias.includes(p.trilha)) {
        trilhaCounts[p.trilha]++;
      }
    });

    // Contagem de projetos por professor
    const professorCounts = {};
    projetos.forEach(proj => {
      const professor = proj.professor_orientador;
      if (professor) {
        professorCounts[professor] = (professorCounts[professor] || 0) + 1;
      }
    });

    res.render('relatorio', { 
      projetos, 
      professorFilter, 
      trilhaFilter, 
      alunoFilter, 
      professores, 
      trilhas, 
      trilhaCounts,
      professorCounts // Adiciona professorCounts ao contexto do template
    });
  } catch (error) {
    res.status(500).send("Erro ao gerar relatório: " + error);
  }
});

// Rota para baixar relatório em Excel
app.get('/relatorio/excel', async (req, res) => {
  try {
    let projetos = await obterProjetosAgrupados();
    projetos = projetos.filter(p => p.trilha !== 'Intercâmbio');

    const professorFilter = req.query.professor ? req.query.professor.trim() : 'Todos';
    const trilhaFilter = req.query.trilha ? req.query.trilha.trim() : 'Todas';
    const alunoFilter = req.query.aluno ? req.query.aluno.trim() : '';

    if (professorFilter !== 'Todos') {
      projetos = projetos.filter(p => p.professor_orientador === professorFilter);
    }
    if (trilhaFilter !== 'Todas') {
      projetos = projetos.filter(p => p.trilha === trilhaFilter);
    }
    if (alunoFilter) {
      projetos = projetos.filter(p => p.alunos.toLowerCase().includes(alunoFilter.toLowerCase()));
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Projetos');
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Trilha', key: 'trilha', width: 20 },
      { header: 'Tema', key: 'tema', width: 30 },
      { header: 'Professor', key: 'professor_orientador', width: 25 },
      { header: 'Descrição', key: 'descricao', width: 40 },
      { header: 'Alunos', key: 'alunos', width: 50 }
    ];
    projetos.forEach(proj => {
      worksheet.addRow(proj);
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_projetos.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).send("Erro ao gerar Excel: " + error);
  }
});

// Rota para baixar relatório em PDF
app.get('/relatorio/pdf', async (req, res) => {
  try {
    let projetos = await obterProjetosAgrupados();
    projetos = projetos.filter(p => p.trilha !== 'Intercâmbio');

    const professorFilter = req.query.professor ? req.query.professor.trim() : 'Todos';
    const trilhaFilter = req.query.trilha ? req.query.trilha.trim() : 'Todas';
    const alunoFilter = req.query.aluno ? req.query.aluno.trim() : '';

    if (professorFilter !== 'Todos') {
      projetos = projetos.filter(p => p.professor_orientador === professorFilter);
    }
    if (trilhaFilter !== 'Todas') {
      projetos = projetos.filter(p => p.trilha === trilhaFilter);
    }
    if (alunoFilter) {
      projetos = projetos.filter(p => p.alunos.toLowerCase().includes(alunoFilter.toLowerCase()));
    }

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      let pdfData = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio_projetos.pdf');
      res.end(pdfData);
    });

    doc.fontSize(16).text('Relatório de Projetos', { align: 'center' });
    doc.moveDown();
    projetos.forEach(proj => {
      doc.fontSize(10)
         .text(`ID: ${proj.id} | Trilha: ${proj.trilha} | Tema: ${proj.tema} | Professor: ${proj.professor_orientador}`);
      doc.text(`Alunos: ${proj.alunos}`);
      doc.moveDown(0.5);
    });
    doc.end();
  } catch (error) {
    res.status(500).send("Erro ao gerar PDF: " + error);
  }
});

/* ============================
   INICIA O SERVIDOR
============================= */
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
