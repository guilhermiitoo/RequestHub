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

Na primeira vez, selecione uma **pasta** (recomendado: uma pasta nova e exclusiva, ex.:
`S:\MMT\50 - MMT SISTEMAS\Banco de dados v10`). O sistema cria:

```
_banco.json                       identifica a pasta (versão do schema)
_sinal.json                       "toque" a cada gravação (os outros PCs só varrem a pasta quando muda)
config.json                       SLA, motivos, centros de custo, expediente do PCM, política de arquivo
contador.json                     número sequencial da Req (001–999)
materiais.json                    Master Data (autocomplete)
usuarios/<matricula>.json         1 arquivo por usuário (senha só em hash SHA-256 com salt)
estado/<matricula>.json           estado por usuário (ex.: chat lido até)
requisicoes/ativas/<id>.json      1 arquivo por requisição em andamento
arquivo/AAAA-MM/AAAA-MM-DD.json   requisições encerradas, agrupadas pelo dia em que encerraram
chat/AAAA-MM-DD/<matricula>.json  mensagens do dia, 1 arquivo por autor
```

Por que assim:
- **Cada ação grava só o arquivo da requisição afetada.** Dois setores mexendo em lotes diferentes nunca se atrapalham.
- **Mesmo lote em dois PCs:** o sistema relê antes de gravar, mescla **item a item** (carimbo
  `updatedAt`/`versaoBase`) e confere depois de gravar. Se dois PCs mudarem o *mesmo* item ao mesmo
  tempo, vale um e quem perdeu é avisado na tela.
- **Nada é apagado:** encerradas vão para o arquivo do dia (após 24h, configurável) com
  "verificar-depois-apagar". O histórico fica disponível para a Visão Geral e o Excel por período.
- **Falha de rede** não perde a ação: a gravação é refeita automaticamente; o rodapé do menu mostra o estado.

## Implantação (migrando da v9.9)

1. Crie a pasta nova na rede (ex.: `Banco de dados v10`).
2. Abra `Gestao_MMT_v10.html` no Chrome/Edge → **Selecionar Pasta do Banco** → escolha a pasta nova →
   **Importar banco antigo (.json)** e selecione o JSON da v9.9.
   - Usuários, materiais, motivos, centros de custo, SLA, contador, requisições e chat são importados.
   - Senhas viram hash; quem usava a senha padrão terá que criar uma senha pessoal no próximo login.
   - Aceites 313/315 antigos (por lote) vão para os itens; o setor `REPAIR CENTER` vira `PE / REPAIR CENTER`.
   - **O arquivo antigo não é alterado** (serve de backup/rollback).
3. Troque **todos os PCs para a v10 de uma vez** (ex.: na troca de turno). A v9.9 grava no formato antigo e
   não enxerga a pasta nova.

Banco novo (sem importar): o administrador inicial é `admin` / `adm123`, com troca obrigatória no 1º login.

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
