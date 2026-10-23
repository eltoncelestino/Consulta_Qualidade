-- ==============================================================
-- SQM QUALIDADE - DDL DE BANCO DE DADOS E ÍNDICES (BANCO: quem)
-- ESTRUTURA 100% ALINHADA COM O SISTEMA OFICIAL newSQM
-- ==============================================================

CREATE DATABASE IF NOT EXISTS quem DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;
USE quem;

-- 1. Tabela de Funcionários
CREATE TABLE IF NOT EXISTS funcionario (
  matricula VARCHAR(15) NOT NULL,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(255) DEFAULT NULL,
  data_nascimento DATE DEFAULT NULL,
  id_analista INT(3) DEFAULT NULL,
  id_grupo INT(11) NOT NULL,
  tipo_atend VARCHAR(10) NOT NULL,
  sex CHAR(1) NOT NULL,
  senioridade VARCHAR(15) DEFAULT NULL,
  status VARCHAR(3) NOT NULL DEFAULT 'YES',
  date_create DATETIME DEFAULT CURRENT_TIMESTAMP,
  data_edit DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  meu_grupo VARCHAR(100) DEFAULT '',
  cadastrado_por VARCHAR(10) DEFAULT NULL,
  atualizado_por VARCHAR(10) DEFAULT NULL,
  PRIMARY KEY (matricula)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 2. Tabela de Login (Autenticação)
CREATE TABLE IF NOT EXISTS login (
  id INT(11) NOT NULL AUTO_INCREMENT,
  id_func VARCHAR(10) NOT NULL,
  senha VARCHAR(50) NOT NULL,
  nivel INT(11) NOT NULL DEFAULT 1,
  usuario VARCHAR(50) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_login_usuario (usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 3. Tabela Cópia de Login (Monitorada por robô RF05)
CREATE TABLE IF NOT EXISTS login_copia (
  id INT(11) NOT NULL AUTO_INCREMENT,
  id_func VARCHAR(10) NOT NULL,
  senha VARCHAR(50) NOT NULL,
  nivel INT(11) NOT NULL DEFAULT 1,
  usuario VARCHAR(50) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_copia_usuario (usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 4. Tabela de Monitorias (Principal do newSQM)
CREATE TABLE IF NOT EXISTS monitorias (
  id INT(11) NOT NULL AUTO_INCREMENT,
  tipo_monitoria VARCHAR(20) NOT NULL,
  matricula_analista VARCHAR(15) NOT NULL,
  id_grupo INT(11) DEFAULT NULL,
  matricula_monitor VARCHAR(15) NOT NULL,
  data_monitoria DATE NOT NULL,
  hora TIME DEFAULT NULL,
  ticket VARCHAR(50) DEFAULT NULL,
  tipo_ticket VARCHAR(50) DEFAULT NULL,
  tipo_telefone VARCHAR(50) DEFAULT NULL,
  tempo_ligacao TIME DEFAULT NULL,
  tma_dia TIME NOT NULL DEFAULT '00:05:00',
  canal_atendimento VARCHAR(20) DEFAULT NULL,
  nota_final DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  observacao TEXT DEFAULT NULL,
  feedback TEXT DEFAULT NULL,
  revisado TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_analista_data (matricula_analista, data_monitoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 5. Pontuações N1 Unificada (31 critérios)
CREATE TABLE IF NOT EXISTS monitoria_pontuacoes_n1 (
  id INT(11) NOT NULL AUTO_INCREMENT,
  monitoria_id INT(11) NOT NULL,
  p01_atende_prontamente TINYINT(1) DEFAULT 0,
  p02_script_inicial TINYINT(1) DEFAULT 0,
  p03_atualizacao_cadastro TINYINT(1) DEFAULT 0,
  p04_termos_tecnicos TINYINT(1) DEFAULT 0,
  p05_termos_condicionais TINYINT(1) DEFAULT 0,
  p06_repetitividade TINYINT(1) DEFAULT 0,
  p07_portugues_correto TINYINT(1) DEFAULT 0,
  p08_diminutivo TINYINT(1) DEFAULT 0,
  p09_palavras_negativas TINYINT(1) DEFAULT 0,
  p10_agilidade TINYINT(1) DEFAULT 0,
  p11_fraseologia_mute TINYINT(1) DEFAULT 0,
  p12_objetividade_didatica TINYINT(1) DEFAULT 0,
  p13_tma_5min TINYINT(1) DEFAULT 0,
  p14_tma_20min TINYINT(1) DEFAULT 0,
  p15_ima1_tel TINYINT(1) DEFAULT 0,
  p16_registros_coerentes TINYINT(1) DEFAULT 0,
  p17_repassa_iap TINYINT(1) DEFAULT 0,
  p18_solicita_dados TINYINT(1) DEFAULT 0,
  p19_encaminhamento TINYINT(1) DEFAULT 0,
  p20_ownership TINYINT(1) DEFAULT 0,
  p21_categorizacao TINYINT(1) DEFAULT 0,
  p22_clareza_descricao TINYINT(1) DEFAULT 0,
  p23_clareza_solucao TINYINT(1) DEFAULT 0,
  p24_condicao_demanda TINYINT(1) DEFAULT 0,
  p25_erros_ortograficos TINYINT(1) DEFAULT 0,
  p26_resumo TINYINT(1) DEFAULT 0,
  p27_script_final TINYINT(1) DEFAULT 0,
  p28_transferencia TINYINT(1) DEFAULT 0,
  p29_educacao_cordialidade TINYINT(1) DEFAULT 0,
  p30_mensagens_padrao TINYINT(1) DEFAULT 0,
  p31_base_conhecimento TINYINT(1) DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_pont_n1_monit (monitoria_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 6. Desclassificações N1 Unificada (22 itens)
CREATE TABLE IF NOT EXISTS monitoria_desclassificacoes_n1 (
  id INT(11) NOT NULL AUTO_INCREMENT,
  monitoria_id INT(11) NOT NULL,
  d01_altera_descricao TINYINT(1) DEFAULT 0,
  d02_desliga_ligacao TINYINT(1) DEFAULT 0,
  d03_sem_anexo_sip TINYINT(1) DEFAULT 0,
  d04_falta_respeito TINYINT(1) DEFAULT 0,
  d05_sem_autorizacao TINYINT(1) DEFAULT 0,
  d06_usuario_desliga_demora TINYINT(1) DEFAULT 0,
  d07_nao_registra_ligacao TINYINT(1) DEFAULT 0,
  d08_nao_acata_usuario TINYINT(1) DEFAULT 0,
  d09_nao_atende_iap TINYINT(1) DEFAULT 0,
  d10_duplicidade_n2 TINYINT(1) DEFAULT 0,
  d11_nao_encaminha_n2 TINYINT(1) DEFAULT 0,
  d12_nao_reporta_lentidao TINYINT(1) DEFAULT 0,
  d13_nao_segue_procedimento TINYINT(1) DEFAULT 0,
  d14_autorizacao_incorreta TINYINT(1) DEFAULT 0,
  d15_nao_realiza_consultas TINYINT(1) DEFAULT 0,
  d16_comentario_inadequado TINYINT(1) DEFAULT 0,
  d17_nao_segue_vip TINYINT(1) DEFAULT 0,
  d18_quebra_sigilo TINYINT(1) DEFAULT 0,
  d19_comentario_fechada TINYINT(1) DEFAULT 0,
  d20_registro_usuario_errado TINYINT(1) DEFAULT 0,
  d21_informacao_incorreta TINYINT(1) DEFAULT 0,
  d22_incidente_pai_errado TINYINT(1) DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_desc_n1_monit (monitoria_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 7. Pontuações N2 (18 critérios)
CREATE TABLE IF NOT EXISTS monitoria_pontuacoes_n2 (
  id INT(11) NOT NULL AUTO_INCREMENT,
  monitoria_id INT(11) NOT NULL,
  p01_numero_demanda_parceiro TINYINT(1) DEFAULT 0,
  p02_status_aguardando_usuario TINYINT(1) DEFAULT 0,
  p03_demanda_sinalizada_iap TINYINT(1) DEFAULT 0,
  p04_categoria_transferencia TINYINT(1) DEFAULT 0,
  p05_categoria_descricao TINYINT(1) DEFAULT 0,
  p06_informacoes_relevantes TINYINT(1) DEFAULT 0,
  p07_mensagens_padrao TINYINT(1) DEFAULT 0,
  p08_erros_ortograficos TINYINT(1) DEFAULT 0,
  p09_tela_sip TINYINT(1) DEFAULT 0,
  p10_retorno_correspondente TINYINT(1) DEFAULT 0,
  p11_retornos_repetidos TINYINT(1) DEFAULT 0,
  p12_termos_tecnicos TINYINT(1) DEFAULT 0,
  p13_objetividade_didatica TINYINT(1) DEFAULT 0,
  p14_codigo_resolucao TINYINT(1) DEFAULT 0,
  p15_status_aguardando_parceiro TINYINT(1) DEFAULT 0,
  p16_padrao_rtc TINYINT(1) DEFAULT 0,
  p17_acompanhamento_parceiro TINYINT(1) DEFAULT 0,
  p18_resposta_usuario TINYINT(1) DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_pont_n2_monit (monitoria_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 8. Desclassificações N2 (14 itens)
CREATE TABLE IF NOT EXISTS monitoria_desclassificacoes_n2 (
  id INT(11) NOT NULL AUTO_INCREMENT,
  monitoria_id INT(11) NOT NULL,
  d01_demanda_sem_atendimento TINYINT(1) DEFAULT 0,
  d02_nao_segue_procedimento TINYINT(1) DEFAULT 0,
  d03_falta_respeito TINYINT(1) DEFAULT 0,
  d04_fechamento_sem_autorizacao TINYINT(1) DEFAULT 0,
  d05_nao_atendeu_iap TINYINT(1) DEFAULT 0,
  d06_perdeu_ima2 TINYINT(1) DEFAULT 0,
  d07_comentario_empresa TINYINT(1) DEFAULT 0,
  d08_quebra_sigilo TINYINT(1) DEFAULT 0,
  d09_informacao_incorreta TINYINT(1) DEFAULT 0,
  d10_incidente_pai_errado TINYINT(1) DEFAULT 0,
  d11_solucao_rejeitada TINYINT(1) DEFAULT 0,
  d12_nao_acatou_usuario TINYINT(1) DEFAULT 0,
  d13_nao_pendenciou TINYINT(1) DEFAULT 0,
  d14_comentario_fechada TINYINT(1) DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_desc_n2_monit (monitoria_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ==============================================================
-- DADOS DE TESTE INICIAIS
-- ==============================================================
INSERT IGNORE INTO funcionario (matricula, nome, status, tipo_atend, id_analista, id_grupo, sex)
VALUES 
('ANA001', 'TESTE ANALISTA N1', 'YES', 'TEL', 10, 7004, 'M'),
('ANA002', 'TESTE ANALISTA WEB', 'YES', 'WEB', 11, 7004, 'F'),
('ANA003', 'TESTE ANALISTA INATIVO', 'NO', 'TEL', 12, 7004, 'M');

INSERT IGNORE INTO login (id_func, usuario, senha, nivel)
VALUES 
('ANA001', 'ANA001', '123456', 1);

-- Inserção de monitoria N1
INSERT IGNORE INTO monitorias 
(id, tipo_monitoria, matricula_analista, id_grupo, matricula_monitor, data_monitoria, hora, ticket, tipo_ticket, tipo_telefone, tempo_ligacao, tma_dia, canal_atendimento, nota_final, observacao)
VALUES 
(1, 'N1', 'ANA001', 7004, 'MON01', DATE_SUB(CURDATE(), INTERVAL 5 DAY), '14:30:00', 'TCK-98214', 'REQUISICAO', 'Atendimento', '00:04:30', '00:04:30', 'TELEFONE', 95.00, 'Bom atendimento geral.'),
(2, 'N1', 'ANA001', 7004, 'MON01', DATE_SUB(CURDATE(), INTERVAL 20 DAY), '10:15:00', 'TCK-97531', 'INCIDENTE', 'Atendimento', '00:08:10', '00:06:00', 'WEB', 88.00, 'Faltou confirmar cadastro.'),
(3, 'N2', 'ANA001', 7004, 'MON02', DATE_SUB(CURDATE(), INTERVAL 45 DAY), '16:00:00', 'TCK-96002', 'INCIDENTE', 'Atendimento', '00:12:00', '00:10:00', 'WEB', 100.00, 'Excelente condução N2.'),
(4, 'N1', 'ANA001', 7004, 'MON01', DATE_SUB(CURDATE(), INTERVAL 90 DAY), '09:00:00', 'TCK-94119', 'REQUISICAO', 'Atendimento', '00:18:00', '00:08:00', 'TELEFONE', 70.00, 'Desclassificado por fechamento.');

-- Apontamentos N1 para o TCK-97531 (p03_atualizacao_cadastro)
INSERT IGNORE INTO monitoria_pontuacoes_n1 (monitoria_id, p03_atualizacao_cadastro, p10_agilidade)
VALUES (2, 1, 1);

-- Desclassificação N1 para o TCK-94119 (d05_sem_autorizacao)
INSERT IGNORE INTO monitoria_desclassificacoes_n1 (monitoria_id, d05_sem_autorizacao)
VALUES (4, 1);
