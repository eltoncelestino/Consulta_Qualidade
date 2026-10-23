// Estado Global da Aplicação
const API_BASE = '/api';
let monitoriasData = [];
let monitoriasFiltradas = [];
let usuarioLogado = null;
let paginaAtual = 1;
let quantidadePorPagina = 10;
let dataInicioAplicada = '';
let dataFimAplicada = '';
let graficoEvolucao = null;
let graficoOfensores = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  aplicarModoEscuro(localStorage.getItem('sqm_dark_mode') === 'true');

  const token = localStorage.getItem('sqm_token');
  const user = localStorage.getItem('sqm_user');

  if (token && user) {
    try {
      usuarioLogado = JSON.parse(user);
      exibirApp();
    } catch (e) {
      fazerLogout();
    }
  } else {
    exibirLogin();
  }

  // Event listener para login
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', realizarLogin);
  }
});

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

// Alternância de Telas
function exibirLogin() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

function exibirApp() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');
  atualizarVisibilidadeColunaTma();

  if (usuarioLogado) {
    document.getElementById('user-display-name').textContent = usuarioLogado.nome || 'Analista';
    document.getElementById('user-display-matr').textContent = usuarioLogado.matricula || '';
  }

  carregarDados();
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

    limparFiltrosHistorico();
    exibirApp();
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
  limparFiltrosHistorico();
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
    const res = await fetch(`${API_BASE}/monitorias/historico`, {
      headers: getAuthHeaders()
    });

    if (res.status === 401) return fazerLogout();
    const data = await res.json();

    monitoriasData = data.monitorias || [];
    atualizarPainelComFiltro();
  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
    corpoTabela.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-8 text-red-500">
          Não foi possível carregar as monitorias. Verifique a conexão com o banco 'quem'.
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
    fundoTooltip: modoEscuro ? '#020617' : '#0F172A'
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
  if (!grafico) return;

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
  if (meses.length === 0) return;

  const notasMedias = meses.map(mes => {
    const dados = porMes.get(mes);
    return dados.somaNotas / dados.volume;
  });

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
          backgroundColor: 'rgba(37, 99, 235, 0.18)',
          borderColor: '#2563EB',
          borderWidth: 1,
          borderRadius: 5
        },
        {
          type: 'line',
          label: 'Nota média',
          data: notasMedias,
          yAxisID: 'y1',
          borderColor: '#334155',
          backgroundColor: '#334155',
          pointBackgroundColor: notasMedias.map(nota => obterConceitoNota(nota).cor),
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, color: tema.textoEixo } },
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
    const notaNum = parseFloat(m.nota || 0);

    let notaBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (notaNum < 75) {
      notaBadgeClass = 'bg-red-50 text-red-700 border-red-200';
    } else if (notaNum < 90) {
      notaBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
    }

    const hasDesclassificacao = (m.desclassificacoes_n1 && m.desclassificacoes_n1.length > 0) ||
                               (m.desclassificacoes_n2 && m.desclassificacoes_n2.length > 0);

    return `
      <tr class="hover:bg-slate-50/80 transition group">
        <td class="py-3 px-5 font-semibold text-slate-800 flex items-center gap-2">
          <span>${m.ticket}</span>
          ${hasDesclassificacao ? '<span title="Possui desclassificação" class="text-red-500">⚠️</span>' : ''}
        </td>
        <td class="py-3 px-5 text-slate-600">${dataFormatada}</td>
        <td class="py-3 px-5 text-slate-700">${m.tipo_demanda || '--'}</td>
        <td class="py-3 px-5 text-slate-500">${m.tipo_monitoria || '--'}</td>
        ${mostrarTma ? `<td class="py-3 px-5 text-slate-600 font-mono">${m.TMA || '--'}</td>` : ''}
        <td class="py-3 px-5 text-center">
          <span class="inline-block px-2.5 py-0.5 rounded-full font-bold border ${notaBadgeClass}">
            ${notaNum.toFixed(2)}%
          </span>
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
  const tipoAnalista = String(usuarioLogado?.tipo_atend || '')
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
  const conteudoArquivo = XLSX.write(pastaTrabalho, {
    bookType: 'xlsx',
    type: 'array',
    cellStyles: true
  });

  const arquivo = new Blob([conteudoArquivo], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const link = document.createElement('a');
  const periodo = dataInicioAplicada || dataFimAplicada
    ? `${dataInicioAplicada || 'inicio'}_a_${dataFimAplicada || 'hoje'}`
    : 'ultimos_6_meses';
  const urlArquivo = URL.createObjectURL(arquivo);
  link.href = urlArquivo;
  link.download = `historico_avaliacoes_${periodo}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(urlArquivo), 1000);
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
        <span class="text-slate-700">${p.criterio}</span>
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
        • ${d.motivo}
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
        <span class="text-slate-700">${p.criterio}</span>
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
        ⚠️ ${d.motivo}
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
