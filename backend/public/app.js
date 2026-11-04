// Estado Global da Aplicação
const API_BASE = '/api';
let monitoriasData = [];
let monitoriasFiltradas = [];
let usuarioLogado = null;
let contextoGerencial = null;
let analistaVisualizado = null;
let modoAtual = 'analista';
let matriculaGerencialDetalhe = '';
let paginaAtual = 1;
let quantidadePorPagina = 10;
let dataInicioAplicada = '';
let dataFimAplicada = '';
let graficoEvolucao = null;
let graficoOfensores = null;
let graficoGerencialEvolucao = null;
let graficoGerencialAnalistas = null;
let paginaGerencial = 1;
let tamanhoPaginaGerencial = 10;
let comparativoGerencialData = [];
let destaquesComparativoGerencial = 'menores';
let usuariosAcessoData = [];
let niveisAcessoData = [];

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  aplicarModoEscuro(localStorage.getItem('sqm_dark_mode') === 'true');

  const formLogin = document.getElementById('form-login');
  if (formLogin) formLogin.addEventListener('submit', realizarLogin);
  document.getElementById('gerencial-modo').addEventListener('change', alternarFiltrosPeriodoGerencial);
  document.getElementById('gerencial-grupo').addEventListener('change', () => carregarPainelGerencial(true));
  document.getElementById('gerencial-ordenacao').addEventListener('change', () => carregarPainelGerencial(true));
  document.getElementById('gerencial-direcao').addEventListener('change', () => carregarPainelGerencial(true));
  document.getElementById('gerencial-destaques').addEventListener('change', evento => {
    destaquesComparativoGerencial = evento.target.value;
    desenharComparativoGerencial(comparativoGerencialData);
  });
  document.getElementById('gerencial-tamanho-pagina').addEventListener('change', () => {
    tamanhoPaginaGerencial = Number(document.getElementById('gerencial-tamanho-pagina').value);
    paginaGerencial = 1;
    carregarPainelGerencial();
  });
  document.getElementById('gerencial-busca').addEventListener('keydown', evento => {
    if (evento.key === 'Enter') carregarPainelGerencial(true);
  });
  document.getElementById('gerenciar-acessos-busca').addEventListener('input', renderizarUsuariosAcesso);
  ['gerenciar-acessos-grupo', 'gerenciar-acessos-tipo', 'gerenciar-acessos-perfil', 'gerenciar-acessos-nivel']
    .forEach(id => document.getElementById(id).addEventListener('change', renderizarUsuariosAcesso));

  window.addEventListener('popstate', () => {
    if (usuarioLogado) {
      exibirApp();
    }
  });

  const token = localStorage.getItem('sqm_token');
  const user = localStorage.getItem('sqm_user');

  if (token && user) {
    try {
      usuarioLogado = JSON.parse(user);
      const sessaoValida = await carregarPerfilGerencial();
      if (!sessaoValida) return;
      exibirApp();
    } catch (e) {
      fazerLogout();
    }
  } else {
    exibirLogin();
  }

});

async function carregarPerfilGerencial() {
  contextoGerencial = null;
  try {
    const res = await fetch(`${API_BASE}/gerencial/perfil`, { headers: getAuthHeaders() });
    if (res.status === 401) {
      fazerLogout();
      return false;
    }
    if (res.ok) {
      contextoGerencial = await res.json();
      const seletor = document.getElementById('gerencial-grupo');
      contextoGerencial.grupos.forEach(grupo => {
        seletor.add(new Option(grupo.nome, grupo.id));
      });
      seletor.parentElement.classList.toggle('hidden', contextoGerencial.grupos.length <= 1);
    }
  } catch (error) {
    console.warn('Não foi possível carregar o acesso gerencial:', error);
  }
  return true;
}

function aplicarModoEscuro(ativado) {
  document.body.classList.toggle('dark-mode', ativado);
  document.documentElement.classList.toggle('dark-mode', ativado);

  const botao = document.getElementById('btn-modo-escuro');
  if (!botao) return;

  const rotulo = ativado ? 'Desativar modo escuro' : 'Ativar modo escuro';
  botao.setAttribute('aria-label', rotulo);
  botao.setAttribute('aria-pressed', String(ativado));
  botao.title = rotulo;
  document.getElementById('texto-modo-escuro').textContent = ativado ? 'Modo Claro' : 'Modo Escuro';
  document.getElementById('icone-modo-escuro').classList.toggle('hidden', ativado);
  document.getElementById('icone-modo-claro').classList.toggle('hidden', !ativado);

  if (typeof Chart !== 'undefined' && monitoriasData.length > 0) {
    atualizarGraficos(obterMonitoriasPeriodo());
  }
}

function alternarModoEscuro() {
  const ativado = !document.body.classList.contains('dark-mode');
  localStorage.setItem('sqm_dark_mode', String(ativado));
  aplicarModoEscuro(ativado);
}

function limparFormularioLogin() {
  const campoUsuario = document.getElementById('input-usuario');
  const campoSenha = document.getElementById('input-senha');

  if (campoUsuario) campoUsuario.value = '';
  if (campoSenha) campoSenha.value = '';
}

// Alternância de Telas
function exibirLogin() {
  limparFormularioLogin();
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

function exibirApp() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');

  if (usuarioLogado) {
    document.getElementById('user-display-name').textContent = usuarioLogado.nome || 'Analista';
    document.getElementById('user-display-matr').textContent = usuarioLogado.matricula || '';
  }

  const params = new URLSearchParams(window.location.search);
  matriculaGerencialDetalhe = contextoGerencial
    ? String(params.get('gerencialAnalista') || '').trim()
    : '';
  if (params.has('gerencialAnalista') && !matriculaGerencialDetalhe) {
    window.history.replaceState({}, '', '/SQD');
  }

  if (matriculaGerencialDetalhe) {
    modoAtual = 'detalhe';
    analistaVisualizado = null;
    mostrarPainelAnalista();
    carregarDados();
  } else if (contextoGerencial?.podeGerenciarAcessos && params.get('visao') === 'acessos') {
    abrirGerenciamentoAcessos(false);
  } else if (contextoGerencial && (
    !contextoGerencial.podeAlternar || params.get('visao') !== 'analista'
  )) {
    abrirVisaoGerencial(false);
  } else {
    abrirMinhasNotas(false);
  }
  atualizarMenuNavegacao();
}

function atualizarMenuNavegacao() {
  const visaoGerencial = document.getElementById('btn-visao-gerencial');
  const gerenciarAcessos = document.getElementById('btn-gerenciar-acessos');
  const minhasNotas = document.getElementById('btn-minhas-notas');
  const historico = document.getElementById('btn-historico-notas');
  const podeAlternar = Boolean(contextoGerencial?.podeAlternar);

  visaoGerencial.classList.toggle('hidden', !contextoGerencial);
  gerenciarAcessos.classList.toggle('hidden', !contextoGerencial?.podeGerenciarAcessos);
  minhasNotas.classList.toggle('hidden', !podeAlternar);
  historico.classList.toggle('hidden', Boolean(contextoGerencial));

  [
    [visaoGerencial, modoAtual === 'gerencial' || modoAtual === 'detalhe'],
    [gerenciarAcessos, modoAtual === 'acessos'],
    [minhasNotas, modoAtual === 'analista'],
    [historico, !contextoGerencial && modoAtual === 'analista']
  ].forEach(([item, ativo]) => {
    item.classList.toggle('bg-blue-600', ativo);
    item.classList.toggle('text-white', ativo);
    item.classList.toggle('shadow-sm', ativo);
    item.classList.toggle('text-slate-300', !ativo);
    if (ativo) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

function mostrarPainelAnalista() {
  document.getElementById('visao-gerencial').classList.add('hidden');
  document.getElementById('gerenciar-acessos').classList.add('hidden');
  document.getElementById('painel-analista').classList.remove('hidden');
  document.getElementById('titulo-pagina').textContent = analistaVisualizado
    ? `Histórico de ${analistaVisualizado.nome}`
    : modoAtual === 'detalhe'
      ? 'Histórico de desempenho do analista'
      : 'Acompanhamento de Monitorias';
  document.getElementById('subtitulo-pagina').textContent = analistaVisualizado
    ? `${analistaVisualizado.grupo || ''} · ${analistaVisualizado.matricula} · últimos 180 dias`
    : 'Período regulamentar: últimos 180 dias';
  document.getElementById('btn-atualizar').classList.toggle('hidden', modoAtual === 'detalhe');
  const btnVoltar = document.getElementById('btn-voltar-gerencial');
  if (btnVoltar) {
    btnVoltar.classList.toggle('hidden', modoAtual !== 'detalhe');
    btnVoltar.classList.toggle('inline-flex', modoAtual === 'detalhe');
  }
  atualizarVisibilidadeColunaTma();
}

function abrirMinhasNotas(atualizarUrl = true) {
  if (contextoGerencial && !contextoGerencial.podeAlternar) return;
  modoAtual = 'analista';
  matriculaGerencialDetalhe = '';
  analistaVisualizado = null;
  if (atualizarUrl) window.history.replaceState({}, '', '/SQD');
  mostrarPainelAnalista();
  atualizarMenuNavegacao();
  carregarDados();
}

function abrirHistoricoNotas(evento) {
  if (evento) evento.preventDefault();
  if (modoAtual !== 'analista') abrirMinhasNotas();
  document.getElementById('historico-avaliacoes').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function abrirVisaoGerencial(atualizarUrl = true) {
  if (!contextoGerencial) return;
  modoAtual = 'gerencial';
  matriculaGerencialDetalhe = '';
  analistaVisualizado = null;
  if (atualizarUrl) window.history.replaceState({}, '', '/SQD?visao=gerencial');
  document.getElementById('painel-analista').classList.add('hidden');
  document.getElementById('gerenciar-acessos').classList.add('hidden');
  document.getElementById('visao-gerencial').classList.remove('hidden');
  const btnVoltar = document.getElementById('btn-voltar-gerencial');
  if (btnVoltar) {
    btnVoltar.classList.add('hidden');
    btnVoltar.classList.remove('inline-flex');
  }
  document.getElementById('titulo-pagina').textContent = 'Visão Gerencial de Notas';
  document.getElementById('subtitulo-pagina').textContent =
    `Perfil efetivo: ${contextoGerencial.perfilEfetivo}`;
  document.getElementById('btn-atualizar').classList.remove('hidden');
  atualizarMenuNavegacao();
  inicializarFiltrosGerenciais();
  alternarFiltrosPeriodoGerencial();
  carregarPainelGerencial();
}

function abrirGerenciamentoAcessos(atualizarUrl = true) {
  if (!contextoGerencial?.podeGerenciarAcessos) return;
  modoAtual = 'acessos';
  matriculaGerencialDetalhe = '';
  analistaVisualizado = null;
  if (atualizarUrl) window.history.replaceState({}, '', '/SQD?visao=acessos');
  document.getElementById('painel-analista').classList.add('hidden');
  document.getElementById('visao-gerencial').classList.add('hidden');
  document.getElementById('gerenciar-acessos').classList.remove('hidden');
  document.getElementById('titulo-pagina').textContent = 'Gerenciar níveis de acesso';
  document.getElementById('subtitulo-pagina').textContent = 'Usuários ativos e permissões';
  document.getElementById('btn-atualizar').classList.remove('hidden');
  atualizarMenuNavegacao();
  carregarUsuariosAcesso();
}

function abrirDetalheGerencial(matricula) {
  if (!contextoGerencial) return;
  matriculaGerencialDetalhe = String(matricula || '').trim();
  if (!matriculaGerencialDetalhe) return;
  modoAtual = 'detalhe';
  analistaVisualizado = null;
  window.history.replaceState(
    {},
    '',
    `/SQD?gerencialAnalista=${encodeURIComponent(matriculaGerencialDetalhe)}`
  );
  mostrarPainelAnalista();
  atualizarMenuNavegacao();
  carregarDados();
}

function carregarPainelAtual() {
  if (modoAtual === 'gerencial') return carregarPainelGerencial();
  if (modoAtual === 'acessos') return carregarUsuariosAcesso();
  if (modoAtual === 'detalhe') return carregarDados();
  return carregarDados();
}

async function carregarUsuariosAcesso() {
  if (!contextoGerencial?.podeGerenciarAcessos || modoAtual !== 'acessos') return;

  const status = document.getElementById('gerenciar-acessos-status');
  const erro = document.getElementById('gerenciar-acessos-erro');
  const tabela = document.getElementById('usuarios-acessos-lista');
  status.textContent = 'Carregando usuários ativos...';
  erro.classList.add('hidden');
  erro.textContent = '';
  tabela.innerHTML = '<tr><td colspan="6" class="px-5 py-8 text-center text-slate-500">Carregando...</td></tr>';

  try {
    const resposta = await fetch(`${API_BASE}/gerencial/acessos/usuarios`, {
      headers: getAuthHeaders(),
      cache: 'no-store'
    });
    const dados = await resposta.json();
    if (resposta.status === 401) return fazerLogout();
    if (!resposta.ok) throw new Error(dados.error || 'Não foi possível carregar os usuários ativos.');

    usuariosAcessoData = dados.usuarios || [];
    niveisAcessoData = dados.niveis || [];
    popularFiltrosUsuariosAcesso();
    renderizarUsuariosAcesso();
  } catch (error) {
    tabela.innerHTML = '';
    erro.textContent = error.message || 'Não foi possível carregar os usuários ativos.';
    erro.classList.remove('hidden');
    status.textContent = 'Falha ao consultar os usuários.';
  }
}

function preencherFiltroUsuariosAcesso(id, entradas, textoPadrao) {
  const seletor = document.getElementById(id);
  const valorAtual = seletor.value;
  seletor.innerHTML = `<option value="">${escaparHtml(textoPadrao)}</option>${entradas.map(entrada =>
    `<option value="${escaparHtml(entrada.value)}">${escaparHtml(entrada.label)}</option>`
  ).join('')}`;
  if (entradas.some(entrada => String(entrada.value) === valorAtual)) seletor.value = valorAtual;
}

function popularFiltrosUsuariosAcesso() {
  const grupamentos = [...new Set(usuariosAcessoData.map(usuario => usuario.grupo).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map(grupo => ({ value: grupo, label: grupo }));
  preencherFiltroUsuariosAcesso('gerenciar-acessos-grupo', grupamentos, 'Todos os grupamentos');

  const niveis = new Map();
  usuariosAcessoData.forEach(usuario => {
    const valor = !usuario.loginAtivo
      ? 'SEM_LOGIN'
      : usuario.nivel == null
        ? 'SEM_NIVEL'
        : String(usuario.nivel);
    const rotulo = !usuario.loginAtivo
      ? 'Sem login cadastrado'
      : `${usuario.nivelNome} (${usuario.nivel == null ? '--' : usuario.nivel})`;
    if (!niveis.has(valor)) niveis.set(valor, { value: valor, label: rotulo });
  });
  const niveisOrdenados = [...niveis.values()].sort((a, b) => {
    if (a.value === 'SEM_LOGIN') return 1;
    if (b.value === 'SEM_LOGIN') return -1;
    return Number(a.value) - Number(b.value);
  });
  preencherFiltroUsuariosAcesso('gerenciar-acessos-nivel', niveisOrdenados, 'Todos os níveis');
}

function limparFiltrosUsuariosAcesso() {
  [
    'gerenciar-acessos-busca',
    'gerenciar-acessos-grupo',
    'gerenciar-acessos-tipo',
    'gerenciar-acessos-perfil',
    'gerenciar-acessos-nivel'
  ].forEach(id => {
    document.getElementById(id).value = '';
  });
  renderizarUsuariosAcesso();
}

function classificarTipoAtendimentoAcesso(usuario) {
  const tipo = String(usuario.tipoAtendimento || '').trim().toUpperCase();
  if (/^N2(?:_|$)/.test(tipo)) return 'N2';
  if (/^N1(?:_|$)/.test(tipo) || ['TEL', 'TELEFONE', 'WEB'].includes(tipo)) return 'N1';
  return 'OUTROS';
}

function obterUsuariosAcessoFiltrados() {
  const termo = document.getElementById('gerenciar-acessos-busca').value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const grupamento = document.getElementById('gerenciar-acessos-grupo').value;
  const tipo = document.getElementById('gerenciar-acessos-tipo').value;
  const perfil = document.getElementById('gerenciar-acessos-perfil').value;
  const nivel = document.getElementById('gerenciar-acessos-nivel').value;
  return usuariosAcessoData.filter(usuario =>
    (!termo || `${usuario.matricula} ${usuario.nome}`
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .includes(termo)) &&
    (!grupamento || usuario.grupo === grupamento) &&
    (!tipo || classificarTipoAtendimentoAcesso(usuario) === tipo) &&
    (!perfil || (perfil === 'ADMINISTRADOR'
      ? Number(usuario.nivel) === 1
      : usuario.perfil === perfil)) &&
    (!nivel || (!usuario.loginAtivo ? nivel === 'SEM_LOGIN' :
      usuario.nivel == null ? nivel === 'SEM_NIVEL' : String(usuario.nivel) === nivel))
  );
}

function renderizarUsuariosAcesso() {
  const tabela = document.getElementById('usuarios-acessos-lista');
  if (!tabela) return;

  const usuarios = obterUsuariosAcessoFiltrados();
  const status = document.getElementById('gerenciar-acessos-status');
  status.textContent = `${usuarios.length} de ${usuariosAcessoData.length} funcionário(s) ativo(s)`;

  if (!usuarios.length) {
    tabela.innerHTML = '<tr><td colspan="6" class="px-5 py-8 text-center text-slate-500">Nenhum usuário corresponde aos filtros.</td></tr>';
    return;
  }

  const nomesPerfis = {
    ADMINISTRADOR: 'Administrador',
    GERENTE: 'Gerente',
    COORDENADOR: 'Coordenador',
    SUPERVISOR: 'Supervisor',
    LIDER: 'Líder',
    ANALISTA_N1: 'Analista N1',
    ANALISTA_N2: 'Analista N2',
    OUTROS: 'Outros'
  };
  tabela.innerHTML = usuarios.map(usuario => {
    const nivelAtual = usuario.nivel == null ? '' : String(usuario.nivel);
    const nivelAtualDisponivel = niveisAcessoData.some(nivel => String(nivel.nivel) === nivelAtual);
    const opcaoAtual = nivelAtual && !nivelAtualDisponivel
      ? `<option value="${escaparHtml(nivelAtual)}" selected disabled>${escaparHtml(usuario.nivelNome)} (${escaparHtml(nivelAtual)})</option>`
      : '';
    const opcoes = niveisAcessoData.map(nivel =>
      `<option value="${escaparHtml(nivel.nivel)}" ${String(nivel.nivel) === nivelAtual ? 'selected' : ''}>${escaparHtml(nivel.tipo)} (${escaparHtml(nivel.nivel)})</option>`
    ).join('');
    const controle = !usuario.loginAtivo
      ? '<span class="text-slate-500">Sem login</span>'
      : !usuario.podeAlterar
        ? '<span class="text-slate-500" title="Somente um administrador pode alterar esta conta">Protegido</span>'
        : `<div class="flex flex-wrap items-center gap-2">
            <select class="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs" aria-label="Novo nível para ${escaparHtml(usuario.nome)}">
              ${opcaoAtual}${opcoes}
            </select>
            <button type="button" data-salvar-nivel data-matricula="${escaparHtml(usuario.matricula)}" class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40" aria-label="Salvar nível de ${escaparHtml(usuario.nome)}">Salvar</button>
          </div>`;

    return `<tr>
      <td class="px-5 py-3 font-mono text-slate-600">${escaparHtml(usuario.matricula)}</td>
      <td class="px-5 py-3 font-medium text-slate-800">${escaparHtml(usuario.nome)}</td>
      <td class="px-5 py-3 text-slate-600">${escaparHtml(nomesPerfis[usuario.perfil] || nomesPerfis.OUTROS)}</td>
      <td class="px-5 py-3 text-slate-600">${escaparHtml(usuario.grupo || '--')}</td>
      <td class="px-5 py-3 text-slate-700">${usuario.loginAtivo
        ? `${escaparHtml(usuario.nivelNome)} (${escaparHtml(usuario.nivel)})`
        : 'Sem login cadastrado'}</td>
      <td class="px-5 py-3">${controle}</td>
    </tr>`;
  }).join('');

  tabela.querySelectorAll('[data-salvar-nivel]').forEach(botao => {
    botao.addEventListener('click', () => salvarNivelAcesso(botao));
  });
}

function textoFiltroAcesso(id, padrao) {
  const seletor = document.getElementById(id);
  return seletor.value ? seletor.options[seletor.selectedIndex].text : padrao;
}

function exportarUsuariosAcessoExcel() {
  const erro = document.getElementById('gerenciar-acessos-erro');
  erro.classList.add('hidden');
  erro.textContent = '';

  if (typeof XLSX === 'undefined') {
    erro.textContent = 'A biblioteca para exportação Excel não foi carregada. Atualize a página e tente novamente.';
    erro.classList.remove('hidden');
    return;
  }

  const usuarios = obterUsuariosAcessoFiltrados();
  if (!usuarios.length) {
    erro.textContent = 'Não há usuários correspondentes aos filtros para exportar.';
    erro.classList.remove('hidden');
    return;
  }

  const nomesPerfis = {
    ADMINISTRADOR: 'Administrador',
    GERENTE: 'Gerente',
    COORDENADOR: 'Coordenador',
    SUPERVISOR: 'Supervisor',
    LIDER: 'Líder',
    ANALISTA_N1: 'Analista N1',
    ANALISTA_N2: 'Analista N2',
    OUTROS: 'Outros'
  };
  const cabecalhos = [
    'Matrícula',
    'Nome',
    'Perfil',
    'Grupamento',
    'Tipo de atendimento',
    'Código do nível',
    'Nível de acesso',
    'Situação do login'
  ];
  const linhas = usuarios.map(usuario => [
    usuario.matricula,
    usuario.nome,
    nomesPerfis[usuario.perfil] || 'Outros',
    usuario.grupo || '',
    usuario.tipoAtendimento || '',
    usuario.loginAtivo ? usuario.nivel : '',
    usuario.loginAtivo ? `${usuario.nivelNome} (${usuario.nivel == null ? '--' : usuario.nivel})` : 'Sem login cadastrado',
    usuario.loginAtivo ? 'Ativo' : 'Sem login'
  ]);
  const linhasPlanilha = [
    ['Relatório', 'Usuários e níveis de acesso'],
    ['Grupamento', textoFiltroAcesso('gerenciar-acessos-grupo', 'Todos')],
    ['Tipo de atendimento', textoFiltroAcesso('gerenciar-acessos-tipo', 'Todos')],
    ['Perfil', textoFiltroAcesso('gerenciar-acessos-perfil', 'Todos')],
    ['Nível de acesso', textoFiltroAcesso('gerenciar-acessos-nivel', 'Todos')],
    ['Busca', document.getElementById('gerenciar-acessos-busca').value.trim() || 'Todos'],
    [],
    cabecalhos,
    ...linhas
  ];
  const planilha = XLSX.utils.aoa_to_sheet(linhasPlanilha);
  planilha['!cols'] = [
    { wch: 16 },
    { wch: 32 },
    { wch: 18 },
    { wch: 32 },
    { wch: 22 },
    { wch: 16 },
    { wch: 34 },
    { wch: 20 }
  ];
  const linhaCabecalho = 8;
  const ultimaColuna = XLSX.utils.encode_col(cabecalhos.length - 1);
  planilha['!autofilter'] = { ref: `A${linhaCabecalho}:${ultimaColuna}${linhaCabecalho + linhas.length}` };

  const pastaTrabalho = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pastaTrabalho, planilha, 'Usuários e acessos');
  const data = new Date();
  const timestamp = [data.getFullYear(), String(data.getMonth() + 1).padStart(2, '0'), String(data.getDate()).padStart(2, '0')].join('');
  try {
    XLSX.writeFile(pastaTrabalho, `usuarios_acessos_${timestamp}.xlsx`, {
      bookType: 'xlsx',
      compression: true
    });
  } catch (error) {
    console.error('Erro ao exportar níveis de acesso:', error);
    erro.textContent = 'Não foi possível gerar a planilha Excel. Verifique as permissões de download do navegador.';
    erro.classList.remove('hidden');
  }
}

async function salvarNivelAcesso(botao) {
  const linha = botao.closest('tr');
  const seletor = linha?.querySelector('select');
  const matricula = botao.dataset.matricula;
  if (!seletor || !matricula) return;

  const erro = document.getElementById('gerenciar-acessos-erro');
  const status = document.getElementById('gerenciar-acessos-status');
  erro.classList.add('hidden');
  erro.textContent = '';
  botao.disabled = true;
  botao.textContent = 'Salvando...';

  try {
    const resposta = await fetch(`${API_BASE}/gerencial/acessos/usuarios/${encodeURIComponent(matricula)}/nivel`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ nivel: Number(seletor.value) })
    });
    const dados = await resposta.json();
    if (resposta.status === 401) return fazerLogout();
    if (!resposta.ok) throw new Error(dados.error || 'Não foi possível alterar o nível de acesso.');

    await carregarUsuariosAcesso();
    status.textContent = `Nível de acesso atualizado para ${matricula}.`;
  } catch (error) {
    erro.textContent = error.message || 'Não foi possível alterar o nível de acesso.';
    erro.classList.remove('hidden');
    botao.disabled = false;
    botao.textContent = 'Salvar';
  }
}

function obterPeriodoPadraoGerencial(dataReferencia = new Date()) {
  const referencia = new Date(dataReferencia.getTime());
  const mesAnterior = new Date(Date.UTC(
    referencia.getUTCFullYear(),
    referencia.getUTCMonth() - 1,
    1
  ));
  const ano = mesAnterior.getUTCFullYear();
  const mes = String(mesAnterior.getUTCMonth() + 1).padStart(2, '0');
  return {
    ano,
    mes,
    trimestre: `${ano}-Q${Math.floor(mesAnterior.getUTCMonth() / 3) + 1}`,
    periodo: `${ano}-${mes}`
  };
}

function inicializarFiltrosGerenciais() {
  const periodoPadrao = obterPeriodoPadraoGerencial();
  document.getElementById('gerencial-periodo').value = periodoPadrao.periodo;
  document.getElementById('gerencial-trimestre').value = periodoPadrao.trimestre;
}

function alternarFiltrosPeriodoGerencial() {
  const modo = document.getElementById('gerencial-modo').value;
  document.getElementById('gerencial-periodo-wrap').classList.toggle('hidden', modo !== 'mes');
  document.getElementById('gerencial-trimestre-wrap').classList.toggle('hidden', modo !== 'trimestre');
  document.getElementById('gerencial-inicio-wrap').classList.toggle('hidden', modo !== 'intervalo');
  document.getElementById('gerencial-fim-wrap').classList.toggle('hidden', modo !== 'intervalo');
}

function limparFiltrosGerencial() {
  const modoSelect = document.getElementById('gerencial-modo');
  if (modoSelect) modoSelect.value = 'mes';

  inicializarFiltrosGerenciais();

  const inicioInput = document.getElementById('gerencial-inicio');
  if (inicioInput) inicioInput.value = '';

  const fimInput = document.getElementById('gerencial-fim');
  if (fimInput) fimInput.value = '';

  const grupoSelect = document.getElementById('gerencial-grupo');
  if (grupoSelect) grupoSelect.value = '';

  const buscaInput = document.getElementById('gerencial-busca');
  if (buscaInput) buscaInput.value = '';

  const ordenacaoSelect = document.getElementById('gerencial-ordenacao');
  if (ordenacaoSelect) ordenacaoSelect.value = 'nota';

  const direcaoSelect = document.getElementById('gerencial-direcao');
  if (direcaoSelect) direcaoSelect.value = 'desc';

  const tamanhoSelect = document.getElementById('gerencial-tamanho-pagina');
  if (tamanhoSelect) {
    tamanhoSelect.value = '10';
    tamanhoPaginaGerencial = 10;
  }

  const destaquesSelect = document.getElementById('gerencial-destaques');
  if (destaquesSelect) {
    destaquesSelect.value = 'menores';
    destaquesComparativoGerencial = 'menores';
  }

  alternarFiltrosPeriodoGerencial();
  carregarPainelGerencial(true);
}

function montarParametrosGerenciais() {
  const parametros = new URLSearchParams();
  const modo = document.getElementById('gerencial-modo').value;
  parametros.set('modo', modo);
  if (modo === 'mes') parametros.set('periodo', document.getElementById('gerencial-periodo').value);
  if (modo === 'trimestre') parametros.set('periodo', document.getElementById('gerencial-trimestre').value);
  if (modo === 'intervalo') {
    parametros.set('inicio', document.getElementById('gerencial-inicio').value);
    parametros.set('fim', document.getElementById('gerencial-fim').value);
  }
  const grupoId = document.getElementById('gerencial-grupo').value;
  if (grupoId) parametros.set('grupo_id', grupoId);
  const busca = document.getElementById('gerencial-busca').value.trim();
  if (busca) parametros.set('busca', busca);
  parametros.set('ordenacao', document.getElementById('gerencial-ordenacao').value);
  parametros.set('direcao', document.getElementById('gerencial-direcao').value);
  parametros.set('pagina', String(paginaGerencial));
  parametros.set('tamanho', String(tamanhoPaginaGerencial));
  return parametros;
}

function escaparHtml(valor) {
  const entidades = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(valor == null ? '' : valor).replace(/[&<>"']/g, caractere => entidades[caractere]);
}

async function carregarPainelGerencial(reiniciarPagina = false) {
  if (!contextoGerencial || modoAtual !== 'gerencial') return;
  if (reiniciarPagina) paginaGerencial = 1;
  const status = document.getElementById('gerencial-status');
  const erro = document.getElementById('gerencial-erro');
  const tabela = document.getElementById('gerencial-lista');
  erro.classList.add('hidden');
  erro.textContent = '';
  status.textContent = 'Carregando indicadores e analistas...';
  tabela.innerHTML = '<tr><td colspan="6" class="px-5 py-8 text-center text-slate-500">Carregando...</td></tr>';

  try {
    const parametros = montarParametrosGerenciais();
    const res = await fetch(`${API_BASE}/gerencial/dashboard?${parametros.toString()}`, {
      headers: getAuthHeaders(),
      cache: 'no-store'
    });
    const dados = await res.json();
    if (res.status === 401) return fazerLogout();
    if (!res.ok) throw new Error(dados.error || 'Não foi possível carregar a visão gerencial.');
    renderizarDashboardGerencial(dados);
    status.textContent = `${dados.resumo.total_analistas} analista(s) no escopo · ${dados.filtros.inicio} a ${dados.filtros.fim}`;
  } catch (error) {
    console.error('Erro ao carregar visão gerencial:', error);
    tabela.innerHTML = '';
    erro.textContent = error.message || 'Não foi possível carregar a visão gerencial.';
    erro.classList.remove('hidden');
    status.textContent = 'Falha ao consultar os dados.';
  }
}

async function exportarDashboardGerencialExcel() {
  if (!contextoGerencial || modoAtual !== 'gerencial') return;
  if (typeof XLSX === 'undefined') {
    alert('Não foi possível carregar a biblioteca necessária para gerar a planilha Excel. Atualize a página e tente novamente.');
    return;
  }

  const botao = document.getElementById('btn-exportar-gerencial');
  const textoBotao = document.getElementById('texto-exportar-gerencial');
  const erro = document.getElementById('gerencial-erro');
  botao.disabled = true;
  textoBotao.textContent = 'Preparando...';
  erro.classList.add('hidden');
  erro.textContent = '';

  try {
    const parametros = montarParametrosGerenciais();
    parametros.set('tamanho', '100');
    let pagina = 1;
    let dadosIniciais = null;
    const analistas = [];

    while (true) {
      parametros.set('pagina', String(pagina));
      const resposta = await fetch(`${API_BASE}/gerencial/dashboard?${parametros.toString()}`, {
        headers: getAuthHeaders(),
        cache: 'no-store'
      });
      const dados = await resposta.json();
      if (resposta.status === 401) return fazerLogout();
      if (!resposta.ok) throw new Error(dados.error || 'Não foi possível consultar os analistas para exportação.');

      if (!dadosIniciais) dadosIniciais = dados;
      analistas.push(...(dados.analistas || []));
      if (pagina >= Number(dados.paginacao?.paginas || 1)) break;
      pagina += 1;
    }

    if (!analistas.length) {
      alert('Não há analistas para exportar com os filtros selecionados.');
      return;
    }

    const grupo = document.getElementById('gerencial-grupo');
    const busca = document.getElementById('gerencial-busca').value.trim();
    const ordenacao = document.getElementById('gerencial-ordenacao');
    const filtros = dadosIniciais.filtros;
    const cabecalhos = [
      'Matrícula',
      'Analista',
      'Grupamento',
      'Nota média atual (%)',
      'Avaliações no período',
      'Nota média anterior (%)',
      'Variação (p.p.)',
      'Direção da variação'
    ];
    const linhas = analistas.map(analista => {
      const notaAtual = analista.nota_media == null ? null : Number(analista.nota_media);
      const notaAnterior = analista.nota_media_anterior == null
        ? null
        : Number(analista.nota_media_anterior);
      const variacao = notaAtual == null || notaAnterior == null
        ? null
        : Number((notaAtual - notaAnterior).toFixed(2));
      const direcao = analista.tendencia === '↑'
        ? 'Aumento'
        : analista.tendencia === '↓'
          ? 'Queda'
          : 'Sem variação ou dados insuficientes';

      return [
        analista.matricula,
        analista.nome,
        analista.grupo,
        notaAtual,
        Number(analista.total_avaliacoes || 0),
        notaAnterior,
        variacao,
        direcao
      ];
    });
    const dadosPlanilha = [
      ['Relatório', 'Visão Gerencial de Notas'],
      ['Período', `${filtros.inicio} a ${filtros.fim}`],
      ['Grupamento', grupo.options[grupo.selectedIndex].textContent.trim()],
      ['Busca', busca || 'Todos'],
      ['Ordenação', `${ordenacao.options[ordenacao.selectedIndex].textContent.trim()} (${filtros.direcao})`],
      [],
      cabecalhos,
      ...linhas
    ];
    const planilha = XLSX.utils.aoa_to_sheet(dadosPlanilha);
    planilha['!cols'] = [
      { wch: 16 },
      { wch: 32 },
      { wch: 32 },
      { wch: 20 },
      { wch: 22 },
      { wch: 24 },
      { wch: 16 },
      { wch: 34 }
    ];
    const linhaCabecalho = 7;
    const ultimaColuna = XLSX.utils.encode_col(cabecalhos.length - 1);
    planilha['!autofilter'] = { ref: `A${linhaCabecalho}:${ultimaColuna}${linhaCabecalho + linhas.length}` };

    const pastaTrabalho = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(pastaTrabalho, planilha, 'Notas por analista');
    XLSX.writeFile(pastaTrabalho, `notas_gerenciais_${filtros.inicio}_a_${filtros.fim}.xlsx`, {
      bookType: 'xlsx',
      compression: true
    });
  } catch (error) {
    console.error('Erro ao exportar a visão gerencial:', error);
    erro.textContent = error.message || 'Não foi possível gerar a planilha Excel.';
    erro.classList.remove('hidden');
  } finally {
    botao.disabled = false;
    textoBotao.textContent = 'Exportar Excel';
  }
}

function renderizarDashboardGerencial(dados) {
  const resumo = dados.resumo;
  const formatarNota = valor => valor == null ? 'Sem dados' : `${Number(valor).toFixed(2)}%`;
  document.getElementById('gerencial-media').textContent = formatarNota(resumo.nota_media);
  document.getElementById('gerencial-maior').textContent = formatarNota(resumo.maior_nota);
  document.getElementById('gerencial-menor').textContent = formatarNota(resumo.menor_nota);
  document.getElementById('gerencial-total-analistas').textContent = resumo.total_analistas;
  document.getElementById('gerencial-total-avaliacoes').textContent = resumo.total_avaliacoes;
  const variacao = document.getElementById('gerencial-variacao');
  if (resumo.variacao_periodo_anterior == null) {
    variacao.textContent = 'Sem dados';
  } else {
    const valor = Number(resumo.variacao_periodo_anterior);
    variacao.textContent = `${valor > 0 ? '↑ ' : valor < 0 ? '↓ ' : '= '}${Math.abs(valor).toFixed(2)} p.p.`;
  }

  const analistas = dados.analistas || [];
  const tabela = document.getElementById('gerencial-lista');
  if (!analistas.length) {
    tabela.innerHTML = '<tr><td colspan="6" class="px-5 py-8 text-center text-slate-500">Nenhum analista encontrado com os filtros selecionados.</td></tr>';
  } else {
    tabela.innerHTML = analistas.map(analista => {
      const tendencia = analista.tendencia === '↑'
        ? '<span class="text-emerald-600" aria-label="Média maior que no período anterior">↑</span>'
        : analista.tendencia === '↓'
          ? '<span class="text-red-600" aria-label="Média menor que no período anterior">↓</span>'
          : '<span class="text-slate-500" aria-label="Sem variação ou dados insuficientes">=</span>';
      return `<tr>
        <td class="px-5 py-3 font-medium text-slate-800">${escaparHtml(analista.nome)}<span class="block text-xs text-slate-500">${escaparHtml(analista.matricula)}</span></td>
        <td class="px-5 py-3 text-slate-600">${escaparHtml(analista.grupo)}</td>
        <td class="px-5 py-3 text-slate-700">${analista.nota_media == null ? '--' : `${Number(analista.nota_media).toFixed(2)}%`}</td>
        <td class="px-5 py-3 text-slate-700">${Number(analista.total_avaliacoes)}</td>
        <td class="px-5 py-3 text-xl">${tendencia}</td>
        <td class="px-5 py-3"><a class="font-semibold text-blue-700 hover:text-blue-900 underline" href="/SQD?gerencialAnalista=${encodeURIComponent(analista.matricula)}" onclick="abrirDetalheGerencial('${escaparHtml(analista.matricula)}'); return false;">Ver histórico</a></td>
      </tr>`;
    }).join('');
  }

  const paginacao = dados.paginacao;
  document.getElementById('gerencial-paginacao-info').textContent =
    `Exibindo ${analistas.length ? ((paginacao.pagina - 1) * paginacao.tamanho + 1) : 0}–${Math.min(paginacao.pagina * paginacao.tamanho, paginacao.total)} de ${paginacao.total} analistas`;
  document.getElementById('gerencial-pagina').textContent =
    `Página ${paginacao.pagina} de ${Math.max(1, paginacao.paginas)}`;
  document.getElementById('gerencial-anterior').disabled = paginacao.pagina <= 1;
  document.getElementById('gerencial-proxima').disabled =
    paginacao.pagina >= Math.max(1, paginacao.paginas);
  desenharGraficosGerenciais(dados.evolucao || [], dados.comparativo || []);
}

function desenharGraficosGerenciais(evolucao, comparativo) {
  const canvasEvolucao = document.getElementById('gerencial-grafico-evolucao');
  const vazioEvolucao = document.getElementById('gerencial-evolucao-vazio');
  if (typeof Chart === 'undefined') {
    vazioEvolucao.textContent = 'A biblioteca de gráficos não está disponível.';
    vazioEvolucao.classList.remove('hidden');
    document.getElementById('gerencial-analistas-vazio').textContent =
      'A biblioteca de gráficos não está disponível.';
    document.getElementById('gerencial-analistas-vazio').classList.remove('hidden');
    return;
  }

  if (graficoGerencialEvolucao) graficoGerencialEvolucao.destroy();
  comparativoGerencialData = comparativo;
  const meses = evolucao.filter(item => item.nota_media != null);
  canvasEvolucao.classList.toggle('hidden', !meses.length);
  vazioEvolucao.textContent = meses.length ? 'Sem dados para o período selecionado.' : 'Sem dados para o período selecionado.';
  vazioEvolucao.classList.toggle('hidden', Boolean(meses.length));
  if (meses.length) {
    const notasEvolucao = meses.map(item => Number(item.nota_media));
    const tema = obterTemaGrafico();
    graficoGerencialEvolucao = new Chart(canvasEvolucao, {
      type: 'line',
      data: {
        labels: meses.map(item => item.periodo),
        datasets: [{
          label: 'Nota média (%)',
          data: notasEvolucao,
          borderColor: '#2563EB',
          backgroundColor: 'rgba(37, 99, 235, 0.15)',
          fill: true,
          tension: 0.25,
          pointBackgroundColor: notasEvolucao.map(nota => obterConceitoNota(nota).cor),
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tema.fundoTooltip,
            padding: 12,
            callbacks: {
              label(context) {
                const nota = Number(context.raw);
                const conceito = obterConceitoNota(nota);
                return `${conceito.emoji} Nota média: ${nota.toFixed(2)}% — ${conceito.nome}`;
              },
              labelTextColor(context) {
                return obterConceitoNota(Number(context.raw)).cor;
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: tema.texto }, grid: { display: false } },
          y: { min: 0, max: 100, ticks: { color: tema.texto, callback: valor => `${valor}%` }, grid: { color: tema.grade } }
        }
      }
    });
  }

  desenharComparativoGerencial(comparativoGerencialData);
}

function desenharComparativoGerencial(comparativo) {
  const canvas = document.getElementById('gerencial-grafico-analistas');
  const mensagemVazia = document.getElementById('gerencial-analistas-vazio');
  const resumo = document.getElementById('gerencial-comparativo-resumo');
  const notasValidas = comparativo
    .filter(item => item.nota_media != null && Number.isFinite(Number(item.nota_media)))
    .slice()
    .sort((a, b) => {
      const diferenca = Number(a.nota_media) - Number(b.nota_media);
      if (diferenca !== 0) return destaquesComparativoGerencial === 'menores' ? diferenca : -diferenca;
      return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
    });
  const destaques = destaquesComparativoGerencial === 'menores'
    ? notasValidas.slice(0, 10)
    : notasValidas.slice(0, 10);

  if (!notasValidas.length) {
    mensagemVazia.textContent = 'Sem dados para comparar no período selecionado.';
    mensagemVazia.classList.remove('hidden');
    canvas.classList.add('hidden');
    resumo.textContent = 'Sem dados';
    if (graficoGerencialAnalistas) {
      graficoGerencialAnalistas.destroy();
      graficoGerencialAnalistas = null;
    }
    return;
  }

  mensagemVazia.classList.add('hidden');
  canvas.classList.remove('hidden');
  if (graficoGerencialAnalistas) graficoGerencialAnalistas.destroy();
  graficoGerencialAnalistas = null;
  canvas.classList.toggle('hidden', !destaques.length);
  mensagemVazia.classList.toggle('hidden', Boolean(destaques.length));
  resumo.textContent = destaques.length
    ? `Exibindo ${destaques.length} ${destaquesComparativoGerencial === 'menores' ? 'menores' : 'maiores'} médias entre ${notasValidas.length} analistas com avaliação no período.`
    : 'Sem dados para comparar.';
  if (!destaques.length) return;

  const tema = obterTemaGrafico();
  const conceitos = destaques.map(item => obterConceitoNota(Number(item.nota_media)));
  graficoGerencialAnalistas = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: destaques.map((item, index) => {
        const emoji = conceitos[index].emoji;
        const nomeCortado = item.nome.length > 22 ? `${item.nome.slice(0, 19)}…` : item.nome;
        return `${emoji} ${nomeCortado}`;
      }),
      datasets: [{
        label: 'Nota média',
        data: destaques.map(item => Number(item.nota_media)),
        backgroundColor: conceitos.map(c => c.cor),
        borderColor: conceitos.map(c => c.cor),
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 22
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tema.fundoTooltip,
          padding: 12,
          callbacks: {
            title(itens) {
              return itens.length ? destaques[itens[0].dataIndex].nome : '';
            },
            label(context) {
              const nota = Number(context.raw);
              const conceito = obterConceitoNota(nota);
              return `${conceito.emoji} Nota média: ${nota.toFixed(2)}% — ${conceito.nome}`;
            },
            labelTextColor(context) {
              return obterConceitoNota(Number(context.raw)).cor;
            },
            afterLabel(context) {
              return `Avaliações: ${Number(destaques[context.dataIndex].total_avaliacoes)}`;
            }
          }
        }
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 20,
            color: tema.texto,
            callback: valor => `${valor}%`
          },
          grid: { color: tema.grade }
        },
        y: {
          ticks: {
            autoSkip: false,
            color: tema.texto,
            crossAlign: 'far'
          },
          grid: { display: false }
        }
      }
    }
  });
}

function mudarPaginaGerencial(delta) {
  paginaGerencial = Math.max(1, paginaGerencial + delta);
  carregarPainelGerencial();
}

function atualizarVisibilidadeColunaTma() {
  const mostrarTma = obterNivelAnalista() === 'N1';
  const cabecalho = document.getElementById('cabecalho-tma');
  if (cabecalho) cabecalho.classList.toggle('hidden', !mostrarTma);

  const colunaVazia = document.querySelector('#tabela-monitorias-corpo td[colspan]');
  if (colunaVazia) colunaVazia.colSpan = mostrarTma ? 7 : 6;
}

function limparFiltrosHistorico() {
  dataInicioAplicada = '';
  dataFimAplicada = '';
  paginaAtual = 1;
  quantidadePorPagina = 10;

  document.getElementById('filtro-data-inicio').value = '';
  document.getElementById('filtro-data-fim').value = '';
  document.getElementById('filtro-busca').value = '';
  document.getElementById('filtro-data-erro').classList.add('hidden');
  document.getElementById('quantidade-por-pagina').value = '10';
}

// 1. Autenticação (RF01)
async function realizarLogin(e) {
  e.preventDefault();
  const inputMatricula = document.getElementById('input-usuario').value.trim();
  const inputSenha = document.getElementById('input-senha').value;
  const erroDiv = document.getElementById('login-error');
  const btnSubmit = document.getElementById('btn-login-submit');

  erroDiv.classList.add('hidden');
  erroDiv.textContent = '';
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = '<span>Verificando...</span>';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: inputMatricula, senha: inputSenha })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Falha ao autenticar.');
    }

    // Salva token e usuário na sessão do navegador
    localStorage.setItem('sqm_token', data.token);
    localStorage.setItem('sqm_user', JSON.stringify(data.user));
    usuarioLogado = data.user;

    limparFormularioLogin();
    limparFiltrosHistorico();
    const sessaoValida = await carregarPerfilGerencial();
    if (sessaoValida) exibirApp();
  } catch (err) {
    erroDiv.textContent = err.message;
    erroDiv.classList.remove('hidden');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '<span>Acessar Meu Painel</span>';
  }
}

// Logout
function fazerLogout() {
  localStorage.removeItem('sqm_token');
  localStorage.removeItem('sqm_user');
  usuarioLogado = null;
  limparFormularioLogin();
  limparFiltrosHistorico();
  if (window.location.search) {
    window.history.replaceState({}, '', '/SQD');
  }
  exibirLogin();
}

// Cabeçalho de autorização para fetch
function getAuthHeaders() {
  const token = localStorage.getItem('sqm_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// Carregar Dados do Dashboard
async function carregarDados() {
  const botaoAtualizar = document.getElementById('btn-atualizar');
  const textoBotao = document.getElementById('texto-btn-atualizar');
  const inicioAtualizacao = performance.now();
  const duracaoAnimacaoMinima = 650;

  if (botaoAtualizar) {
    botaoAtualizar.disabled = true;
    botaoAtualizar.setAttribute('aria-busy', 'true');
    botaoAtualizar.classList.add('is-atualizando');
    textoBotao.textContent = 'Atualizando...';
  }

  try {
    await carregarHistorico();
  } finally {
    const tempoRestante = duracaoAnimacaoMinima - (performance.now() - inicioAtualizacao);
    if (tempoRestante > 0) {
      await new Promise(resolve => setTimeout(resolve, tempoRestante));
    }

    if (botaoAtualizar) {
      botaoAtualizar.disabled = false;
      botaoAtualizar.removeAttribute('aria-busy');
      botaoAtualizar.classList.remove('is-atualizando');
      textoBotao.textContent = 'Atualizar';
    }
  }
}

// 2. Histórico dos 6 Meses (RF06 & RF08)
async function carregarHistorico() {
  const corpoTabela = document.getElementById('tabela-monitorias-corpo');
  const msgVazia = document.getElementById('tabela-vazia');

  try {
    const endpoint = modoAtual === 'detalhe'
      ? `${API_BASE}/gerencial/analistas/${encodeURIComponent(matriculaGerencialDetalhe)}/historico`
      : `${API_BASE}/monitorias/historico`;
    const res = await fetch(endpoint, {
      headers: getAuthHeaders()
    });

    if (res.status === 401) return fazerLogout();
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Não foi possível carregar o histórico.');

    analistaVisualizado = data.analista || null;
    if (analistaVisualizado) {
      document.getElementById('titulo-pagina').textContent =
        `Histórico de ${analistaVisualizado.nome}`;
      document.getElementById('subtitulo-pagina').textContent =
        `${analistaVisualizado.grupo} · ${analistaVisualizado.matricula} · últimos 180 dias`;
      atualizarVisibilidadeColunaTma();
    }
    monitoriasData = data.monitorias || [];
    atualizarPainelComFiltro();
  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
    corpoTabela.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-8 text-red-500">
          ${escaparHtml(err.message || "Não foi possível carregar as monitorias. Verifique a conexão com o banco 'quem'.")}
        </td>
      </tr>
    `;
  }
}

function obterConceitoNota(nota) {
  if (nota >= 98) return { nome: 'Excelente', emoji: '🤩', cor: '#EAB308' };
  if (nota >= 95) return { nome: 'Ótimo', emoji: '😀', cor: '#22C55E' };
  if (nota >= 90) return { nome: 'Bom', emoji: '🙂', cor: '#3B82F6' };
  return { nome: 'Regular', emoji: '🙁', cor: '#F97316' };
}

function obterTemaGrafico() {
  const modoEscuro = document.body.classList.contains('dark-mode');
  return {
    texto: modoEscuro ? '#CBD5E1' : '#64748B',
    textoEixo: modoEscuro ? '#CBD5E1' : '#475569',
    grade: modoEscuro ? 'rgba(203, 213, 225, 0.12)' : 'rgba(148, 163, 184, 0.15)',
    fundoTooltip: modoEscuro ? '#020617' : '#0F172A',
    contornoPonto: modoEscuro ? '#FFFFFF' : '#334155'
  };
}

function ajustarZoomGrafico(tipo, acao) {
  const grafico = tipo === 'evolucao' ? graficoEvolucao : graficoOfensores;
  if (!grafico || !grafico.$sqmZoom) return;

  const zoom = grafico.$sqmZoom;
  const escala = grafico.options.scales[zoom.eixo];
  if (acao === 'redefinir') {
    zoom.min = zoom.baseMin;
    zoom.max = zoom.baseMax;
  } else {
    const intervaloAtual = zoom.max - zoom.min;
    const intervaloBase = zoom.baseMax - zoom.baseMin;
    const intervaloNovo = acao === 'aproximar'
      ? Math.max(0.25, Math.min(intervaloBase, intervaloAtual / 1.5))
      : Math.min(intervaloBase, intervaloAtual * 1.5);
    const centro = (zoom.min + zoom.max) / 2;
    zoom.min = Math.max(zoom.baseMin, centro - intervaloNovo / 2);
    zoom.max = Math.min(zoom.baseMax, centro + intervaloNovo / 2);
  }

  escala.min = zoom.min;
  escala.max = zoom.max;
  if (grafico.$sqmDragHandlers) {
    grafico.canvas.style.cursor = zoom.max - zoom.min < zoom.baseMax - zoom.baseMin
      ? 'grab'
      : 'default';
  }
  grafico.update();
}

function habilitarArrasteGrafico(grafico) {
  const canvas = grafico.canvas;
  const zoom = grafico.$sqmZoom;
  const eixoHorizontal = zoom.eixo === 'x';
  let arraste = null;
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'default';

  const aoIniciar = evento => {
    const area = grafico.chartArea;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const posicao = eixoHorizontal
      ? (evento.clientX - rect.left) * grafico.width / rect.width
      : (evento.clientY - rect.top) * grafico.height / rect.height;
    const dentroDaArea = eixoHorizontal
      ? posicao >= area.left && posicao <= area.right
      : posicao >= area.top && posicao <= area.bottom;
    const intervaloVisivel = zoom.max - zoom.min;

    if (!dentroDaArea || intervaloVisivel >= zoom.baseMax - zoom.baseMin) return;

    evento.preventDefault();
    arraste = {
      id: evento.pointerId,
      posicao,
      min: zoom.min,
      max: zoom.max
    };
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(evento.pointerId);
  };

  const aoMover = evento => {
    if (!arraste || evento.pointerId !== arraste.id) return;

    const area = grafico.chartArea;
    const rect = canvas.getBoundingClientRect();
    const posicao = eixoHorizontal
      ? (evento.clientX - rect.left) * grafico.width / rect.width
      : (evento.clientY - rect.top) * grafico.height / rect.height;
    const tamanhoArea = eixoHorizontal ? area.right - area.left : area.bottom - area.top;
    if (rect.width === 0 || rect.height === 0 || tamanhoArea === 0) return;
    const delta = (posicao - arraste.posicao) * (arraste.max - arraste.min) / tamanhoArea;
    const deslocamento = eixoHorizontal ? -delta : delta;
    const intervalo = arraste.max - arraste.min;
    const novoMinimo = Math.min(
      zoom.baseMax - intervalo,
      Math.max(zoom.baseMin, arraste.min + deslocamento)
    );

    zoom.min = novoMinimo;
    zoom.max = novoMinimo + intervalo;
    grafico.options.scales[zoom.eixo].min = zoom.min;
    grafico.options.scales[zoom.eixo].max = zoom.max;
    grafico.update('none');
  };

  const aoFinalizar = evento => {
    if (!arraste || (evento && evento.pointerId !== arraste.id)) return;
    if (canvas.hasPointerCapture(arraste.id)) canvas.releasePointerCapture(arraste.id);
    arraste = null;
    canvas.style.cursor = zoom.max - zoom.min < zoom.baseMax - zoom.baseMin
      ? 'grab'
      : 'default';
  };

  canvas.addEventListener('pointerdown', aoIniciar);
  canvas.addEventListener('pointermove', aoMover);
  canvas.addEventListener('pointerup', aoFinalizar);
  canvas.addEventListener('pointercancel', aoFinalizar);
  canvas.addEventListener('lostpointercapture', aoFinalizar);
  grafico.$sqmDragHandlers = { aoIniciar, aoMover, aoFinalizar };
  canvas.style.cursor = zoom.max - zoom.min < zoom.baseMax - zoom.baseMin ? 'grab' : 'default';
}

function destruirGrafico(grafico) {
  if (!grafico || !grafico.canvas) return;

  const handlers = grafico.$sqmDragHandlers;
  if (handlers) {
    grafico.canvas.removeEventListener('pointerdown', handlers.aoIniciar);
    grafico.canvas.removeEventListener('pointermove', handlers.aoMover);
    grafico.canvas.removeEventListener('pointerup', handlers.aoFinalizar);
    grafico.canvas.removeEventListener('pointercancel', handlers.aoFinalizar);
    grafico.canvas.removeEventListener('lostpointercapture', handlers.aoFinalizar);
  }
  grafico.destroy();
}

function atualizarGraficos(monitorias) {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js não foi carregado; os gráficos não podem ser exibidos.');
    ['grafico-evolucao-vazio', 'grafico-ofensores-vazio'].forEach(id => {
      const mensagem = document.getElementById(id);
      mensagem.textContent = 'Não foi possível carregar a biblioteca de gráficos.';
      mensagem.classList.remove('hidden');
    });
    document.getElementById('grafico-evolucao').classList.add('hidden');
    document.getElementById('grafico-ofensores').classList.add('hidden');
    return;
  }

  atualizarGraficoEvolucao(monitorias);
  atualizarGraficoOfensores(monitorias);
}

function atualizarGraficoEvolucao(monitorias) {
  const tema = obterTemaGrafico();
  const porMes = new Map();

  monitorias.forEach(monitoria => {
    const data = obterDataISO(monitoria.data);
    const mes = data.slice(0, 7);
    if (monitoria.nota == null || String(monitoria.nota).trim() === '') return;
    const nota = Number(monitoria.nota);
    if (!/^\d{4}-\d{2}$/.test(mes) || !Number.isFinite(nota)) return;

    if (!porMes.has(mes)) porMes.set(mes, { somaNotas: 0, volume: 0 });
    const dados = porMes.get(mes);
    dados.somaNotas += nota;
    dados.volume += 1;
  });

  const meses = [...porMes.keys()].sort();
  const canvas = document.getElementById('grafico-evolucao');
  const mensagemVazia = document.getElementById('grafico-evolucao-vazio');
  mensagemVazia.classList.toggle('hidden', meses.length > 0);
  canvas.classList.toggle('hidden', meses.length === 0);

  destruirGrafico(graficoEvolucao);
  graficoEvolucao = null;
  if (meses.length === 0) return;

  const notasMedias = meses.map(mes => {
    const dados = porMes.get(mes);
    return dados.somaNotas / dados.volume;
  });
  const coresBarras = notasMedias.map(nota => obterConceitoNota(nota).cor);

  graficoEvolucao = new Chart(canvas, {
    data: {
      labels: meses.map(mes => {
        const [ano, numeroMes] = mes.split('-').map(Number);
        return new Date(ano, numeroMes - 1, 1).toLocaleDateString('pt-BR', {
          month: 'short',
          year: '2-digit'
        });
      }),
      datasets: [
        {
          type: 'bar',
          label: 'Volume de monitorias',
          data: meses.map(mes => porMes.get(mes).volume),
          yAxisID: 'y',
          backgroundColor: coresBarras.map(cor => `${cor}CC`),
          borderColor: coresBarras,
          borderWidth: 1,
          borderRadius: 5,
          maxBarThickness: 64
        },
        {
          type: 'line',
          label: 'Nota média',
          data: notasMedias,
          order: -1,
          yAxisID: 'y1',
          borderColor: '#F8C74E',
          borderWidth: 3,
          backgroundColor: '#F8C74E',
          pointBackgroundColor: notasMedias.map(nota => obterConceitoNota(nota).cor),
          pointBorderColor: notasMedias.map(() => tema.contornoPonto),
          pointBorderWidth: 4,
          pointRadius: 7,
          pointHoverBorderColor: tema.contornoPonto,
          pointHoverBorderWidth: 4,
          pointHoverRadius: 9,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            color: tema.textoEixo,
            generateLabels(chart) {
              const labels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
              return labels.map(item => {
                const dataset = chart.data.datasets[item.datasetIndex];
                if (dataset && dataset.yAxisID === 'y1') {
                  const media = Number(dataset.data[dataset.data.length - 1] ?? 0);
                  const conceito = obterConceitoNota(media);
                  item.text = `Nota média: ${conceito.nome}`;
                }
                return item;
              });
            }
          }
        },
        tooltip: {
          backgroundColor: tema.fundoTooltip,
          padding: 12,
          callbacks: {
            label(context) {
              if (context.dataset.yAxisID === 'y1') {
                const nota = Number(context.raw);
                const conceito = obterConceitoNota(nota);
                return `${conceito.emoji} Nota média: ${nota.toFixed(2)}% — ${conceito.nome}`;
              }
              return `Monitorias: ${context.raw}`;
            },
            labelTextColor(context) {
              return context.dataset.yAxisID === 'y1'
                ? obterConceitoNota(Number(context.raw)).cor
                : '#FFFFFF';
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: tema.texto } },
        y: {
          beginAtZero: true,
          grace: '15%',
          title: { display: true, text: 'Quantidade de monitorias', color: tema.texto },
          ticks: { precision: 0, color: tema.texto },
          grid: { color: tema.grade }
        },
        y1: {
          position: 'right',
          min: 0,
          max: 100,
          title: { display: true, text: 'Nota média (%)', color: tema.texto },
          ticks: { color: tema.texto, callback: valor => `${valor}%` },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
  graficoEvolucao.$sqmZoom = {
    eixo: 'x',
    baseMin: 0,
    baseMax: meses.length - 1,
    min: 0,
    max: meses.length - 1
  };
  graficoEvolucao.options.scales.x.min = 0;
  graficoEvolucao.options.scales.x.max = meses.length - 1;
  habilitarArrasteGrafico(graficoEvolucao);
}

function atualizarGraficoOfensores(monitorias) {
  const tema = obterTemaGrafico();
  const criterios = new Map();
  const registrarOcorrencias = (itens, tipo, nomeCampo) => {
    itens.forEach(item => {
      const nomeOriginal = String(item[nomeCampo] || '').trim();
      if (!nomeOriginal) return;
      const nome = `${tipo}: ${nomeOriginal}`;

      if (!criterios.has(nome)) {
        criterios.set(nome, { nome: nomeOriginal, ocorrencias: 0, pontos: 0, tipo });
      }
      const dados = criterios.get(nome);
      dados.ocorrencias += 1;
      const pontos = Number(item.pontos);
      if (tipo === 'Pontuação' && Number.isFinite(pontos)) dados.pontos += pontos;
    });
  };

  monitorias.forEach(monitoria => {
    registrarOcorrencias([
      ...(monitoria.pontuacoes_n1 || []),
      ...(monitoria.pontuacoes_n2 || [])
    ], 'Pontuação', 'criterio');
    registrarOcorrencias([
      ...(monitoria.desclassificacoes_n1 || []),
      ...(monitoria.desclassificacoes_n2 || [])
    ], 'Desclassificação', 'motivo');
  });

  const ranking = [...criterios.entries()]
    .sort((a, b) => b[1].ocorrencias - a[1].ocorrencias || b[1].pontos - a[1].pontos)
    .slice(0, 8);
  const totalOcorrencias = [...criterios.values()]
    .reduce((total, criterio) => total + criterio.ocorrencias, 0);
  const canvas = document.getElementById('grafico-ofensores');
  const mensagemVazia = document.getElementById('grafico-ofensores-vazio');
  mensagemVazia.classList.toggle('hidden', ranking.length > 0);
  canvas.classList.toggle('hidden', ranking.length === 0);

  destruirGrafico(graficoOfensores);
  graficoOfensores = null;
  if (ranking.length === 0) return;

  graficoOfensores = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ranking.map(([, dados]) => dados.nome),
      datasets: [{
        label: 'Ocorrências',
        data: ranking.map(([, dados]) => dados.ocorrencias),
        backgroundColor: ranking.map(([, dados]) => dados.tipo === 'Desclassificação'
          ? 'rgba(127, 29, 29, 0.82)'
          : 'rgba(249, 115, 22, 0.72)'),
        borderColor: ranking.map(([, dados]) => dados.tipo === 'Desclassificação'
          ? '#7F1D1D'
          : '#F97316'),
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 24
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tema.fundoTooltip,
          padding: 12,
          callbacks: {
            title(items) {
              return items[0]?.label || '';
            },
            label(context) {
              return `Frequência: ${context.raw}`;
            },
            afterLabel(context) {
              const dados = ranking[context.dataIndex][1];
              const participacao = totalOcorrencias
                ? (dados.ocorrencias / totalOcorrencias * 100).toFixed(1)
                : '0.0';
              const detalhes = [
                `Tipo: ${dados.tipo}`,
                `Participação: ${participacao}% das ocorrências`
              ];
              if (dados.pontos > 0) detalhes.push(`Pontos associados: ${dados.pontos.toFixed(2)}`);
              return detalhes;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0, color: tema.texto },
          title: { display: true, text: 'Frequência', color: tema.texto },
          grid: { color: tema.grade }
        },
        y: {
          min: 0,
          max: ranking.length - 1,
          ticks: {
            color: tema.textoEixo,
            callback(value) {
              const texto = this.getLabelForValue(value);
              return texto.length > 32 ? `${texto.slice(0, 29)}...` : texto;
            }
          },
          grid: { display: false }
        }
      }
    }
  });
  graficoOfensores.$sqmZoom = {
    eixo: 'y',
    baseMin: 0,
    baseMax: ranking.length - 1,
    min: 0,
    max: ranking.length - 1
  };
  habilitarArrasteGrafico(graficoOfensores);
}

// Renderização da Tabela de Monitorias
function renderizarTabela(lista) {
  const corpoTabela = document.getElementById('tabela-monitorias-corpo');
  const msgVazia = document.getElementById('tabela-vazia');
  monitoriasFiltradas = lista || [];

  const total = monitoriasFiltradas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / quantidadePorPagina));
  paginaAtual = Math.min(paginaAtual, totalPaginas);

  const inicio = (paginaAtual - 1) * quantidadePorPagina;
  const pagina = monitoriasFiltradas.slice(inicio, inicio + quantidadePorPagina);

  document.getElementById('historico-intervalo').textContent = total === 0
    ? 'Exibindo 0 avaliações'
    : `Exibindo ${inicio + 1}-${Math.min(inicio + pagina.length, total)} de ${total} avaliações`;
  document.getElementById('pagina-atual').textContent = `Página ${paginaAtual} de ${totalPaginas}`;
  document.getElementById('pagina-anterior').disabled = paginaAtual === 1;
  document.getElementById('pagina-proxima').disabled = paginaAtual === totalPaginas;

  if (pagina.length === 0) {
    corpoTabela.innerHTML = '';
    msgVazia.classList.remove('hidden');
    return;
  }

  msgVazia.classList.add('hidden');

  corpoTabela.innerHTML = pagina.map(m => {
    const mostrarTma = obterNivelAnalista() === 'N1';
    const dataFormatada = m.data ? new Date(m.data).toLocaleDateString('pt-BR') : '--';
    const notaValor = m.nota == null || String(m.nota).trim() === ''
      ? Number.NaN
      : Number(m.nota);
    const notaNum = Number.isFinite(notaValor) ? notaValor : null;

    let notaBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (notaNum !== null && notaNum < 75) {
      notaBadgeClass = 'bg-red-50 text-red-700 border-red-200';
    } else if (notaNum !== null && notaNum < 90) {
      notaBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
    }

    const hasDesclassificacao = (m.desclassificacoes_n1 && m.desclassificacoes_n1.length > 0) ||
      (m.desclassificacoes_n2 && m.desclassificacoes_n2.length > 0);

    return `
      <tr class="hover:bg-slate-50/80 transition group">
        <td class="py-3 px-5 font-semibold text-slate-800 flex items-center gap-2">
          <span>${escaparHtml(m.ticket)}</span>
          ${hasDesclassificacao ? '<span title="Possui desclassificação" class="text-red-500">⚠️</span>' : ''}
        </td>
        <td class="py-3 px-5 text-slate-600">${escaparHtml(dataFormatada)}</td>
        <td class="py-3 px-5 text-slate-700">${escaparHtml(m.tipo_demanda || '--')}</td>
        <td class="py-3 px-5 text-slate-500">${escaparHtml(m.tipo_monitoria || '--')}</td>
        ${mostrarTma ? `<td class="py-3 px-5 text-slate-600 font-mono">${escaparHtml(m.TMA || '--')}</td>` : ''}
        <td class="py-3 px-5 text-center">${notaNum === null ? '' : `
          <span class="inline-block px-2.5 py-0.5 rounded-full font-bold border ${notaBadgeClass}">
            ${notaNum.toFixed(2)}%
          </span>`}
        </td>
        <td class="py-3 px-5 text-right">
          <button 
            type="button" 
            onclick="abrirDetalhes(${Number(m.id)})" 
            class="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition"
          >
            Ver Detalhes
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function irParaPagina(pagina) {
  const totalPaginas = Math.max(1, Math.ceil(monitoriasFiltradas.length / quantidadePorPagina));
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > totalPaginas) return;

  paginaAtual = pagina;
  renderizarTabela(monitoriasFiltradas);
}

function alterarQuantidadePorPagina() {
  quantidadePorPagina = Number(document.getElementById('quantidade-por-pagina').value);
  paginaAtual = 1;
  renderizarTabela(monitoriasFiltradas);
}

function obterMonitoriasPeriodo() {
  return monitoriasData.filter(monitoria => {
    const dataMonitoria = obterDataISO(monitoria.data);
    return (!dataInicioAplicada || dataMonitoria >= dataInicioAplicada) &&
      (!dataFimAplicada || dataMonitoria <= dataFimAplicada);
  });
}

function atualizarCardsResumo(monitorias) {
  document.getElementById('card-total-monitorias').textContent = monitorias.length;
  document.getElementById('card-total-periodo').textContent =
    dataInicioAplicada || dataFimAplicada
      ? 'No período selecionado'
      : 'Realizadas nos últimos 6 meses';

  const notas = monitorias
    .map(monitoria => monitoria.nota == null || String(monitoria.nota).trim() === ''
      ? NaN
      : Number(monitoria.nota))
    .filter(Number.isFinite);
  const notaMedia = notas.length
    ? notas.reduce((soma, nota) => soma + nota, 0) / notas.length
    : 0;
  const notaEl = document.getElementById('card-nota-media');
  notaEl.textContent = `${notaMedia.toFixed(2)}%`;
  notaEl.className = notaMedia >= 90
    ? 'text-3xl font-bold text-emerald-600 mt-2'
    : notaMedia >= 75
      ? 'text-3xl font-bold text-amber-500 mt-2'
      : 'text-3xl font-bold text-red-600 mt-2';

  const nivelAnalista = obterNivelAnalista();
  const tituloTerceiroCard = document.getElementById('card-terceiro-titulo');
  const valorTerceiroCard = document.getElementById('card-terceiro-valor');
  const descricaoTerceiroCard = document.getElementById('card-terceiro-descricao');
  const iconeTma = document.getElementById('icone-card-tma');
  const iconePontos = document.getElementById('icone-card-pontos');
  const descricaoPeriodo = dataInicioAplicada || dataFimAplicada
    ? 'No período selecionado'
    : 'Nos últimos 6 meses';

  if (nivelAnalista === 'N2') {
    const percentualPontosPerdidos = notas.length
      ? Math.max(0, 100 - notaMedia)
      : null;

    tituloTerceiroCard.textContent = 'Pontos perdidos';
    valorTerceiroCard.textContent = percentualPontosPerdidos === null
      ? '--'
      : `${percentualPontosPerdidos.toFixed(2)}%`;
    descricaoTerceiroCard.textContent = descricaoPeriodo;
    iconeTma.classList.add('hidden');
    iconePontos.classList.remove('hidden');
    return;
  }

  if (nivelAnalista === 'N1') {
    const temposEmSegundos = monitorias
      .map(monitoria => {
        const correspondencia = String(monitoria.TMA || '').match(/^(\d+):([0-5]\d):([0-5]\d)$/);
        return correspondencia
          ? Number(correspondencia[1]) * 3600 + Number(correspondencia[2]) * 60 + Number(correspondencia[3])
          : null;
      })
      .filter(tempo => tempo !== null);
    const tmaMedio = temposEmSegundos.length
      ? Math.round(temposEmSegundos.reduce((soma, tempo) => soma + tempo, 0) / temposEmSegundos.length)
      : 0;
    const horas = Math.floor(tmaMedio / 3600);
    const minutos = Math.floor((tmaMedio % 3600) / 60);
    const segundos = tmaMedio % 60;

    tituloTerceiroCard.textContent = 'TMA Médio';
    valorTerceiroCard.textContent = [horas, minutos, segundos]
      .map(valor => String(valor).padStart(2, '0'))
      .join(':');
    descricaoTerceiroCard.textContent = 'Tempo Médio de Atendimento';
    iconeTma.classList.remove('hidden');
    iconePontos.classList.add('hidden');
    return;
  }

  tituloTerceiroCard.textContent = 'Indicador indisponível';
  valorTerceiroCard.textContent = '--';
  descricaoTerceiroCard.textContent = 'Tipo de atendimento não identificado';
  iconeTma.classList.add('hidden');
  iconePontos.classList.add('hidden');
}

function atualizarPainelComFiltro() {
  const monitoriasPeriodo = obterMonitoriasPeriodo();
  atualizarCardsResumo(monitoriasPeriodo);
  atualizarGraficos(monitoriasPeriodo);
  filtrarTabela();
}

// Filtros Locais Instantâneos
function filtrarTabela() {
  const monitoriasPeriodo = obterMonitoriasPeriodo();
  const busca = document.getElementById('filtro-busca').value.toLowerCase();

  const filtrados = monitoriasPeriodo.filter(m => {
    const matchBusca = !busca ||
      (m.ticket && m.ticket.toLowerCase().includes(busca)) ||
      (m.tipo_demanda && m.tipo_demanda.toLowerCase().includes(busca));

    return matchBusca;
  });

  paginaAtual = 1;
  renderizarTabela(filtrados);
}

function aplicarFiltroData() {
  const dataInicio = document.getElementById('filtro-data-inicio').value;
  const dataFim = document.getElementById('filtro-data-fim').value;
  const erroData = document.getElementById('filtro-data-erro');

  if (dataInicio && dataFim && dataInicio > dataFim) {
    erroData.classList.remove('hidden');
    return;
  }

  erroData.classList.add('hidden');
  dataInicioAplicada = dataInicio;
  dataFimAplicada = dataFim;
  atualizarPainelComFiltro();
}

function obterDataISO(data) {
  if (!data) return '';

  const valor = String(data);
  if (/^\d{4}-\d{2}-\d{2}/.test(valor)) return valor.slice(0, 10);

  const dataConvertida = new Date(valor);
  return Number.isNaN(dataConvertida.getTime()) ? '' : dataConvertida.toISOString().slice(0, 10);
}

function obterNivelAnalista() {
  const pessoaAvaliada = analistaVisualizado || usuarioLogado;
  const tipoAnalista = String(pessoaAvaliada?.tipo_atend || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/^N1(?:_|$)/.test(tipoAnalista) || ['TEL', 'TELEFONE', 'WEB'].includes(tipoAnalista)) {
    return 'N1';
  }
  if (/^N2(?:_|$)/.test(tipoAnalista)) return 'N2';
  return '';
}

function obterDetalhesExportacao(monitoria, nivelAnalista) {
  if (nivelAnalista === 'N1') {
    return {
      pontuacoes: monitoria.pontuacoes_n1 || [],
      desclassificacoes: monitoria.desclassificacoes_n1 || []
    };
  }

  if (nivelAnalista === 'N2') {
    return {
      pontuacoes: monitoria.pontuacoes_n2 || [],
      desclassificacoes: monitoria.desclassificacoes_n2 || []
    };
  }

  return { pontuacoes: [], desclassificacoes: [] };
}

function formatarPontuacoesExportacao(pontuacoes) {
  return pontuacoes.map(pontuacao => {
    const criterio = String(pontuacao.criterio || '').trim();
    const pontos = pontuacao.pontos == null || pontuacao.pontos === ''
      ? ''
      : Number(pontuacao.pontos);
    const detalhePontos = Number.isFinite(pontos) ? ` (+${pontos.toFixed(2)} pts)` : '';
    return `${criterio}${detalhePontos}`;
  }).filter(Boolean).join(' | ');
}

function exportarHistoricoExcel() {
  const nivelAnalista = obterNivelAnalista();
  if (!nivelAnalista) {
    alert('Não foi possível identificar se o analista é N1 ou N2. Verifique o tipo_atend do cadastro do funcionário.');
    return;
  }

  const historicoExportado = monitoriasData.filter(monitoria => {
    const dataMonitoria = obterDataISO(monitoria.data);
    const matchDataInicio = !dataInicioAplicada || dataMonitoria >= dataInicioAplicada;
    const matchDataFim = !dataFimAplicada || dataMonitoria <= dataFimAplicada;
    return matchDataInicio && matchDataFim;
  });

  if (historicoExportado.length === 0) {
    alert('Não há avaliações para exportar no período selecionado.');
    return;
  }

  if (typeof XLSX === 'undefined') {
    alert('Não foi possível carregar a biblioteca necessária para gerar a planilha Excel. Atualize a página e tente novamente.');
    return;
  }

  const cabecalhos = [
    'Ticket',
    'Data',
    'Tipo de Demanda',
    'Tipo'
  ];
  if (nivelAnalista === 'N1') cabecalhos.push('TMA');
  cabecalhos.push(
    'Nota (%)',
    `Pontuações ${nivelAnalista === 'N1' ? 'N1 Unificada' : 'N2'}`,
    `Desclassificações ${nivelAnalista === 'N1' ? 'N1 Unificada' : 'N2'}`
  );
  const linhas = historicoExportado.map(monitoria => {
    const detalhes = obterDetalhesExportacao(monitoria, nivelAnalista);
    const linha = [
      monitoria.ticket,
      obterDataISO(monitoria.data).split('-').reverse().join('/'),
      monitoria.tipo_demanda,
      monitoria.tipo_monitoria
    ];
    if (nivelAnalista === 'N1') linha.push(monitoria.TMA);
    linha.push(
      monitoria.nota,
      formatarPontuacoesExportacao(detalhes.pontuacoes),
      detalhes.desclassificacoes.map(item => String(item.motivo || '').trim()).filter(Boolean).join(' | ')
    );
    return linha;
  });
  const planilha = XLSX.utils.aoa_to_sheet([cabecalhos, ...linhas]);
  const largurasColunas = [
    { wch: 18 },
    { wch: 13 },
    { wch: 24 },
    { wch: 14 }
  ];
  if (nivelAnalista === 'N1') largurasColunas.push({ wch: 13 });
  largurasColunas.push(
    { wch: 12 },
    { wch: 70 },
    { wch: 70 }
  );
  planilha['!cols'] = largurasColunas;
  const ultimaColuna = XLSX.utils.encode_col(cabecalhos.length - 1);
  planilha['!autofilter'] = { ref: `A1:${ultimaColuna}${linhas.length + 1}` };

  const pastaTrabalho = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pastaTrabalho, planilha, 'Histórico');
  const periodo = dataInicioAplicada || dataFimAplicada
    ? `${dataInicioAplicada || 'inicio'}_a_${dataFimAplicada || 'hoje'}`
    : 'ultimos_6_meses';
  try {
    XLSX.writeFile(pastaTrabalho, `historico_avaliacoes_${periodo}.xlsx`, {
      bookType: 'xlsx',
      compression: true
    });
  } catch (error) {
    console.error('Erro ao gerar o arquivo Excel:', error);
    alert('Não foi possível gerar o arquivo Excel. Tente novamente ou verifique as permissões de download do navegador.');
  }
}

// 3. Modal de Detalhes N1 e N2 (RF08)
function abrirDetalhes(monitoriaId) {
  const m = monitoriasData.find(monitoria => Number(monitoria.id) === monitoriaId);
  if (!m) return;

  const nivelAnalista = obterNivelAnalista();
  document.getElementById('modal-detalhes-n1').classList.toggle('hidden', nivelAnalista !== 'N1');
  document.getElementById('modal-detalhes-n2').classList.toggle('hidden', nivelAnalista !== 'N2');
  document.getElementById('modal-detalhes-tipo-invalido').classList.toggle('hidden', Boolean(nivelAnalista));

  document.getElementById('modal-ticket-title').textContent = `Ticket: ${m.ticket}`;
  const dataFormatada = m.data ? new Date(m.data).toLocaleDateString('pt-BR') : '--';
  document.getElementById('modal-meta-info').textContent =
    `Data: ${dataFormatada} • Canal: ${m.canal || '--'} • TMA: ${m.TMA || '--'} • Tipo: ${m.tipo_monitoria || '--'}`;

  const notaNum = parseFloat(m.nota || 0);
  const badgeNota = document.getElementById('modal-nota-badge');
  badgeNota.textContent = `${notaNum.toFixed(2)}%`;

  if (notaNum >= 90) {
    badgeNota.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800';
  } else if (notaNum >= 75) {
    badgeNota.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800';
  } else {
    badgeNota.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800';
  }

  // Pontuações N1
  const n1PontContainer = document.getElementById('modal-n1-pontuacoes');
  if (m.pontuacoes_n1 && m.pontuacoes_n1.length > 0) {
    n1PontContainer.innerHTML = m.pontuacoes_n1.map(p => `
      <div class="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
        <span class="text-slate-700">${escaparHtml(p.criterio)}</span>
        ${p.pontos == null ? '' : `<span class="font-bold text-slate-900 font-mono">+${Number(p.pontos).toFixed(2)} pts</span>`}
      </div>
    `).join('');
  } else {
    n1PontContainer.innerHTML = `<p class="text-slate-400 italic">Nenhuma pontuação detalhada registrada em N1.</p>`;
  }

  // Desclassificações N1
  const n1DescContainer = document.getElementById('modal-n1-desclassificacoes');
  const n1DescLista = document.getElementById('modal-n1-desclassificacoes-lista');
  if (m.desclassificacoes_n1 && m.desclassificacoes_n1.length > 0) {
    n1DescContainer.classList.remove('hidden');
    n1DescLista.innerHTML = m.desclassificacoes_n1.map(d => `
      <div class="p-2 rounded-lg bg-red-50 border border-red-200 text-red-700">
        • ${escaparHtml(d.motivo)}
      </div>
    `).join('');
  } else {
    n1DescContainer.classList.add('hidden');
  }

  // Pontuações N2
  const n2PontContainer = document.getElementById('modal-n2-pontuacoes');
  if (m.pontuacoes_n2 && m.pontuacoes_n2.length > 0) {
    n2PontContainer.innerHTML = m.pontuacoes_n2.map(p => `
      <div class="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
        <span class="text-slate-700">${escaparHtml(p.criterio)}</span>
        <span class="font-bold text-slate-900 font-mono">+${Number(p.pontos).toFixed(2)} pts</span>
      </div>
    `).join('');
  } else {
    n2PontContainer.innerHTML = `<p class="text-slate-400 italic">Nenhum registro específico de pontuação N2.</p>`;
  }

  // Desclassificações N2
  const n2DescContainer = document.getElementById('modal-n2-desclassificacoes');
  const n2DescLista = document.getElementById('modal-n2-desclassificacoes-lista');
  if (m.desclassificacoes_n2 && m.desclassificacoes_n2.length > 0) {
    n2DescContainer.classList.remove('hidden');
    n2DescLista.innerHTML = m.desclassificacoes_n2.map(d => `
      <div class="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 font-medium">
        ⚠️ ${escaparHtml(d.motivo)}
      </div>
    `).join('');
  } else {
    n2DescContainer.classList.add('hidden');
  }

  document.getElementById('modal-detalhes').classList.remove('hidden');
}

function fecharModalDetalhes() {
  document.getElementById('modal-detalhes').classList.add('hidden');
}

// 5. Modal de Alteração de Senha (RF04)
function abrirModalSenha() {
  document.getElementById('form-alterar-senha').reset();
  const alertBox = document.getElementById('modal-senha-alert');
  alertBox.className = 'hidden';
  alertBox.textContent = '';
  document.getElementById('modal-senha').classList.remove('hidden');
}

function fecharModalSenha() {
  document.getElementById('modal-senha').classList.add('hidden');
}

async function salvarNovaSenha(e) {
  e.preventDefault();
  const senhaAtual = document.getElementById('input-senha-atual').value;
  const novaSenha = document.getElementById('input-nova-senha').value;
  const confirmaSenha = document.getElementById('input-confirma-senha').value;
  const alertBox = document.getElementById('modal-senha-alert');
  const btnSalvar = document.getElementById('btn-salvar-senha');

  if (novaSenha !== confirmaSenha) {
    alertBox.className = 'm-5 p-3 rounded-lg text-xs bg-red-50 border border-red-200 text-red-700 block';
    alertBox.textContent = 'A nova senha e a confirmação não coincidem.';
    return;
  }

  btnSalvar.disabled = true;
  btnSalvar.textContent = 'Salvando...';

  try {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ senhaAtual, novaSenha })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Erro ao alterar a senha.');
    }

    alertBox.className = 'm-5 p-3 rounded-lg text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 block';
    alertBox.textContent = 'Senha atualizada com sucesso!';

    setTimeout(() => {
      fecharModalSenha();
    }, 1500);
  } catch (err) {
    alertBox.className = 'm-5 p-3 rounded-lg text-xs bg-red-50 border border-red-200 text-red-700 block';
    alertBox.textContent = err.message;
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = 'Salvar Nova Senha';
  }
}
