# RequestHub — Gestão MMT (v10)

Sistema de **Requisição Avulsa (R.A)** de materiais da fábrica: um único arquivo HTML
(`Gestao_MMT_v10.html`) que roda no **Chrome ou Edge**, sem servidor, gravando os dados
numa **pasta da rede**.

## Quem usa e o fluxo

| Setor | Papel |
|---|---|
| Produção, PE / Repair Center, Qualidade | Abrem a R.A (até 15 itens por lote) e acompanham em *Meus Pedidos* |
| MMT | Triagem: atende do estoque próprio (fora do SAP), envia ao WH (saldo no SAP) ou ao PCM (liberação de kit); coleta no WH e entrega ao solicitante |
| PCM | Analisa no SAP a liberação do kit: **libera para o WH** ou declara **indisponível** (nota obrigatória) |
| Warehouse (WH) | Separa e lança o **Doc SAP 313**; se o material não estiver no lugar, marca **Não localizado** |

```
Solicitante ──► MMT triagem ─┬─► Estoque MMT ─────────────────────────────┐
                             ├─► WH (saldo SAP) ──► Separa + Doc 313 ──┐   │
                             └─► PCM (kit) ─┬─► Libera ─► WH ──────────┤   │
                                            └─► Indisponível (nota)    │   │
                                                                       ▼   ▼
                                          MMT coleta no WH + Doc 315 ─► Balcão MMT ─► Entrega (matrícula)
```

- Fora do expediente do PCM (configurável na Administração) o MMT usa o **bypass** para o WH; o WH
  informa de onde tirou a peça e o PCM dá "ciente" depois.
- WH **Não localizado** devolve o item ao PCM (se passou por ele) ou ao MMT, com nota obrigatória.
- O solicitante pode **cancelar** o próprio item enquanto ele ainda está na triagem do MMT.
- Cada etapa tem SLA (MMT triagem, PCM, WH, MMT coleta); o item fica vermelho quando vence.

## Banco de dados em pasta (vários JSON pequenos)

O sistema é entregue como uma pasta: `SPARE_PARTS.html` + a pasta `dados/` ao lado. Na primeira vez,
clique em **Selecionar Pasta do Banco** e escolha a pasta `dados` — a estrutura é criada sozinha.
Dentro de `dados/` nada fica solto, tudo fica em subpastas:

```
dados/
  sistema/       banco.json, config.json, contador.json, sinal.json, arquivamento.json
  materiais/     materiais.json (Master Data do autocomplete)
  usuarios/      <matricula>.json (senha só em hash SHA-256 com salt)
  estado/        <matricula>.json (ex.: chat lido até)
  requisicoes/   <id>.json (1 arquivo por requisição em andamento)
  arquivo/       AAAA-MM/AAAA-MM-DD.json (encerradas, pelo dia em que encerraram)
  chat/          AAAA-MM-DD/<matricula>.json
  backup/        AAAA-MM-DD/ (requisições, usuários, config, materiais) — 1x por dia, pelo 1º PC que acessar
  importacao/    cópia do JSON antigo importado
```

**Login do administrador (fixo):** `admin` / `admin123`. Esse acesso é recriado a cada conexão, não pode
ser apagado nem resetado. A importação do banco antigo é feita **só pelo admin**, na aba *Backup e Manutenção*.

Por que assim:
- **Cada ação grava só o arquivo da requisição afetada.** Dois setores mexendo em lotes diferentes nunca se atrapalham.
- **Mesmo lote em dois PCs:** o sistema relê antes de gravar, mescla **item a item** (carimbo
  `updatedAt`/`versaoBase`) e confere depois de gravar. Se dois PCs mudarem o *mesmo* item ao mesmo
  tempo, vale um e quem perdeu é avisado na tela.
- **Nada é apagado:** encerradas vão para o arquivo do dia (após 24h, configurável) com
  "verificar-depois-apagar". O histórico fica disponível para a Visão Geral e o Excel por período.
- **Falha de rede** não perde a ação: a gravação é refeita automaticamente; o rodapé do menu mostra o estado.

## Implantação (migrando da v9.9)

1. Extraia o zip `SPARE_PARTS_v10.zip` na rede (ex.: `S:\MMT\50 - MMT SISTEMAS\SPARE_PARTS`).
2. Abra `SPARE_PARTS.html` no Chrome/Edge → **Selecionar Pasta do Banco** → escolha `dados`.
3. Entre com `admin` / `admin123` → *Backup e Manutenção* → **Importar .json antigo** e selecione o JSON da v9.9.
   Senhas viram hash (quem usava a senha padrão cria uma senha pessoal no próximo login), aceites 313/315
   vão para os itens, `REPAIR CENTER` vira `PE / REPAIR CENTER`. O arquivo antigo não é alterado.
4. Troque **todos os PCs para a v10 de uma vez** (ex.: na troca de turno).

## Testes automáticos

Os testes E2E usam Playwright + Chromium e uma pasta de rede simulada em memória (`tests/fake-fs.js`),
compartilhada entre várias abas, cada uma fazendo o papel de um PC.

```bash
node tests/e2e.js
```

Cobrem: importação do banco antigo, troca de senha, limite de 15 itens, triagem do MMT, desfazer,
card do PCM com nota obrigatória, separação com Doc 313 e coleta com Doc 315, gravação simultânea em
2 PCs, conflito no mesmo item, arquivamento, indisponível / não localizado / cancelamento, bypass do
PCM e contador de Req sem duplicar. Os screenshots ficam em `tests/screenshots/`.

Sem acesso às CDNs (Tailwind, Lucide, Chart.js, XLSX, QR Code), aponte `VENDOR_DIR` para uma pasta com
cópias locais: `node_modules/` com `lucide@1.55.0`, `qrcode-generator@1.4.4`, `chart.js@4.4.1` e
`xlsx@0.18.5`, mais um `tailwind.css` gerado pelo Tailwind 3 a partir do HTML.
