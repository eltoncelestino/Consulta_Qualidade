# 🚀 Guia de Migração para Servidor Local

Este documento contém o passo a passo completo para implantar o sistema **SQM Qualidade** em um servidor local da empresa (Windows Server ou Linux) e disponibilizá-lo para todos os analistas na rede interna.

---

## 📦 1. O que você precisa copiar

Copie a pasta inteira **`D:\Consulta_Qualidade`** para um pendrive ou compartilhe via rede.

> **Dica sobre `node_modules`:**
> - **Se o servidor de destino NÃO tiver internet:** Copie a pasta inteira **com** a pasta `backend/node_modules` (já contém todas as dependências instaladas e prontas).
> - **Se o servidor de destino TIVER internet:** Você pode compactar tudo (ZIP) e, se preferir excluir `node_modules` para o arquivo ficar com apenas ~2 MB, basta rodar `npm install` no destino.

---

## 💻 2. Requisitos no Servidor Local

1. **Node.js instalado** (versão 18 ou superior)  
   👉 [Download Node.js LTS](https://nodejs.org/)
2. **MySQL ou MariaDB em execução** com o banco `quem`.
3. **Porta 3002 liberada no Firewall** para acesso dos analistas.

---

## ⚙️ 3. Passo a Passo no Servidor Local

### Passo 3.1: Colar os arquivos
Cole a pasta no local definitivo do servidor (exemplo: `C:\Consulta_Qualidade` ou `D:\Consulta_Qualidade`).

### Passo 3.2: Configurar o `.env`
Abra o arquivo `backend\.env` no Bloco de Notas e ajuste os dados de conexão com o MySQL do servidor:

```env
PORT=3002
JWT_SECRET=gere-uma-chave-aleatoria-longa-e-unica

# Conexão com o MySQL local do servidor
DB_HOST=localhost
DB_PORT=3306
DB_USER=usuario_do_banco
DB_PASSWORD=sua_senha_do_servidor
DB_NAME=quem

# Robô de Sincronização (a cada 10 minutos)
SYNC_CRON_SCHEDULE="*/10 * * * *"
DEFAULT_USER_PASSWORD=defina-uma-senha-inicial-segura
```

Gere um valor aleatório exclusivo para `JWT_SECRET` e nunca versione o arquivo `.env`.

### Passo 3.3: Criar/Importar as Tabelas (se o banco for novo)
Se o banco `quem` ainda não existir no servidor, execute:
```cmd
mysql -u root -p quem < database\schema.sql
```

---

## 🌐 4. Liberar o Acesso na Rede Local (Firewall)

Para que os analistas consigam acessar de suas próprias máquinas:

1. No servidor, abra o **Prompt de Comando como Administrador**.
2. Execute `liberar_firewall.bat` como Administrador para liberar a porta `3002` apenas para a sub-rede local.

3. Descubra o IP do servidor na rede:
```cmd
ipconfig
```
*(Procure pelo "Endereço IPv4", por exemplo: `192.168.1.150`)*

4. Execute `compartilhar_link.bat` no servidor para iniciar o sistema e exibir os links para compartilhar. Mantenha a janela aberta enquanto o sistema estiver em uso.

---

## 🏃 5. Como os Analistas vão Acessar

De qualquer computador conectado na rede interna (ou VPN), os analistas abrirão no navegador:

👉 **`http://IP_DO_SERVIDOR:3002`**  
*(Exemplo: `http://192.168.1.150:3002`)*

Também é possível usar `http://NOME_DO_SERVIDOR:3002` se o DNS da intranet resolver o nome.

---

## 🔄 6. Como Manter o Sistema Rodando Sempre (Como Serviço Windows)

Para não precisar deixar uma janela preta do Prompt aberta o tempo todo:

### Opção A: Usando PM2 (Recomendado - Mais Fácil)
1. No servidor, abra o CMD e instale o gerenciador de processos PM2:
   ```cmd
   npm install -g pm2
   npm install -g pm2-windows-startup
   pm2-startup install
   ```

2. Inicie a aplicação:
   ```cmd
   cd C:\Consulta_Qualidade\backend
   pm2 start src/server.js --name "sqm-qualidade"
   pm2 save
   ```
*Pronto! O sistema iniciará sozinho sempre que o servidor ligar ou reiniciar.*

### Opção B: Manual / Inicialização Rápida
Basta criar um atalho do arquivo `iniciar_sistema.bat` na pasta:  
`shell:startup` (Pressione Windows + R e digite `shell:startup`).
