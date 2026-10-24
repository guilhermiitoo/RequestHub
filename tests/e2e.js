// Testes ponta a ponta da Gestão MMT v10 (Playwright + Chromium).
//   node tests/e2e.js
// A pasta de rede é simulada em memória (tests/fake-fs.js) e compartilhada entre várias abas,
// cada aba fazendo o papel de um PC. Variáveis opcionais:
//   VENDOR_DIR  pasta com cópias locais das bibliotecas da CDN (ver README.md)
//   SHOTS_DIR   onde salvar os screenshots (padrão: tests/screenshots)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = 'file://' + path.join(ROOT, 'Gestao_MMT_v10.html');
const VENDOR = process.env.VENDOR_DIR || path.join(__dirname, '.vendor');
const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

// ---------------------------------------------------------------- pasta simulada (lado Node)
const store = new Map();
let relogio = Date.now();
const pai = p => p.slice(0, p.lastIndexOf('/'));
store.set('pasta', { kind: 'directory' });
store.set('legado', { kind: 'directory' });
const fsOps = {
    stat: p => (store.has(p) ? store.get(p).kind : null),
    mkdir: p => { store.set(p, { kind: 'directory' }); return true; },
    write: (p, content) => { relogio = Math.max(relogio + 1, Date.now()); store.set(p, { kind: 'file', content, lastModified: relogio }); return true; },
    read: p => { const e = store.get(p); return e && e.kind === 'file' ? { content: e.content, lastModified: e.lastModified } : null; },
    list: p => [...store.keys()].filter(k => pai(k) === p).map(k => ({ name: k.slice(p.length + 1), kind: store.get(k).kind })),
    remove: (p, recursivo) => {
        if (!store.has(p)) return 'NotFoundError';
        const filhos = [...store.keys()].filter(k => k.startsWith(p + '/'));
        if (filhos.length && !recursivo) return 'InvalidModificationError';
        filhos.forEach(k => store.delete(k));
        store.delete(p);
        return null;
    }
};
const lerJ = p => JSON.parse(store.get(p).content);
const arquivos = dir => fsOps.list(dir).filter(e => e.kind === 'file').map(e => dir + '/' + e.name);
const ativas = () => arquivos('pasta/requisicoes').map(lerJ);
const reqDisco = num => ativas().find(r => r.reqNum === num);
const itemDisco = (num, cod) => { const r = reqDisco(num); return r && r.itens.find(i => i.itemCod === cod); };
const diaISO = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const arquivoDoDia = t => { const dia = diaISO(t); const p = `pasta/arquivo/${dia.slice(0, 7)}/${dia}.json`; return store.has(p) ? lerJ(p) : null; };
const esperar = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- banco antigo (v9.9) de exemplo
const AGORA = Date.now(), H = 3600e3, D = 86400e3;
const iso = t => new Date(t).toISOString();
const legado = {
    usuarios: [
        { matricula: 'admin', nome: 'Administrador do Sistema', senha: 'adm123', permissoes: ['PRODUCAO', 'MEUS_PEDIDOS', 'MMT', 'PCM', 'WAREHOUSE', 'HISTORICO', 'ADMIN'], setor: 'DIRETORIA/TI' },
        { matricula: '1001', nome: 'Paula Engenharia', senha: 'pe1234', permissoes: ['HISTORICO', 'PRODUCAO', 'MEUS_PEDIDOS'], setor: 'REPAIR CENTER' },
        { matricula: '2001', nome: 'Marcos MMT', senha: 'mmt1234', permissoes: ['HISTORICO', 'MMT', 'ACEITES'], setor: 'MMT' },
        { matricula: '3001', nome: 'Patricia PCM', senha: 'pcm1234', permissoes: ['HISTORICO', 'PCM'], setor: 'PCM' },
        { matricula: '4001', nome: 'Wagner WH', senha: 'Mmt2026@', permissoes: ['HISTORICO', 'WAREHOUSE', 'ACEITES'], setor: 'WAREHOUSE' }
    ],
    requisicoes: [
        { id: '2610-1234', reqNum: '041', matriculaAutor: '1001', setorAutor: 'REPAIR CENTER', lider: 'Paula Engenharia', linha: 'RC1', op: 'OP777', motivo: 'FALTA DE KIT', turno: '1º Turno', timestamp: iso(AGORA - 10 * D),
          itens: [{ idItem: '2610-1234-1', itemCod: '004.001', itemDesc: 'RESISTOR 10K', qty: 5, plant: '1001', posMecanica: 'R1', status: 'CONCLUIDO',
                    timestamps: { PENDENTE_MMT: iso(AGORA - 10 * D), AGUARDANDO_WH: iso(AGORA - 10 * D + 600e3), SEPARADO_WH: iso(AGORA - 10 * D + 1800e3), RECEBIDO_MMT: iso(AGORA - 10 * D + 2400e3), CONCLUIDO: iso(AGORA - 10 * D + 3000e3) },
                    atores: {}, historicoStatus: [] }] },
        // mesmo ID (colisão do formato antigo AAMM-####)
        { id: '2610-1234', reqNum: '042', matriculaAutor: '1001', setorAutor: 'REPAIR CENTER', lider: 'Paula Engenharia', linha: 'RC1', op: 'OP888', motivo: 'PARA REPARO', turno: '1º Turno', timestamp: iso(AGORA - 2 * H),
          itens: [{ idItem: '2610-1234', itemCod: '004.002', itemDesc: 'CAPACITOR 100uF', qty: 2, plant: '1001', posMecanica: 'C7', status: 'PENDENTE_MMT', timestamps: { PENDENTE_MMT: iso(AGORA - 2 * H) }, atores: {}, historicoStatus: [] }] }
    ],
    aceites: [{ idReq: '2610-1234', doc313: '4900000001', data313: iso(AGORA - 10 * D + 1800e3), matricula313: '4001', doc315: '4900000002', data315: iso(AGORA - 10 * D + 2400e3), matricula315: '2001' }],
    motivos: ['PERDA DA MÁQUINA', 'PERDA NO PROCESSO', 'FALTA DE KIT', 'PARA REPARO'],
    centrosCusto: ['PRODUÇÃO - 1001', 'REPAIR - 2002'],
    materiais: [{ cod: '004.100', desc: 'CI REGULADOR 3V3', plant: '1001' }, { cod: '004.101', desc: 'CONECTOR FPC 40P', plant: '1001' }, { cod: '004.102', desc: 'FUSIVEL 2A', plant: '1001' }],
    slaRules: { MMT: 20, PCM: 30, WAREHOUSE: 60 },
    reqCounter: 42,
    chatMsgs: [{ id: 'm1', autor: '2001', autorNome: 'Marcos MMT', autorSetor: 'MMT', texto: 'Bom dia @PCM', mentionSetor: 'PCM', timestamp: iso(AGORA - 60e3), editado: false, readBy: ['2001'] }]
};
const LEGADO_TXT = JSON.stringify(legado);
fsOps.write('legado/banco_antigo.json', LEGADO_TXT);

// ---------------------------------------------------------------- bibliotecas da CDN (cópias locais, se houver)
const vendor = rel => { const p = path.join(VENDOR, rel); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
const js = rel => { const c = vendor(rel); return c && { contentType: 'application/javascript', body: c }; };
const ROTAS = [
    [/cdn\.tailwindcss\.com/, () => { const css = vendor('tailwind.css'); return css && { contentType: 'application/javascript', body: `window.tailwind={};(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s)})();` }; }],
    [/unpkg\.com\/lucide@/, () => js('node_modules/lucide/dist/umd/lucide.min.js')],
    [/qrcode-generator\//, () => js('node_modules/qrcode-generator/qrcode.js')],
    [/xlsx\.full\.min\.js/, () => js('node_modules/xlsx/dist/xlsx.full.min.js')],
    [/chart\.js@/, () => js('node_modules/chart.js/dist/chart.umd.js')]
];
async function rota(route) {
    const url = route.request().url();
    for (const [re, fn] of ROTAS) if (re.test(url)) { const r = fn(); return r ? route.fulfill(r) : route.continue(); }
    return route.continue();
}

// ---------------------------------------------------------------- utilitários de teste
const falhas = [], errosJs = [], PAGINAS = [];
let passoAtual = '';
function ok(cond, msg) {
    if (cond) console.log('   ✓ ' + msg);
    else { console.log('   ✗ ' + msg); falhas.push(`[${passoAtual}] ${msg}`); }
}
async function passo(nome, fn) {
    passoAtual = nome;
    console.log('\n▶ ' + nome);
    try { await fn(); }
    catch (e) {
        console.log('   ✗ EXCEÇÃO: ' + e.message.split('\n')[0]);
        const alvo = (e.message.match(/waiting for (.*)/) || [])[1];
        if (alvo) console.log('     alvo: ' + alvo);
        falhas.push(`[${nome}] exceção: ${e.message.split('\n')[0]}`);
        // Diagnóstico: foto de todas as abas e avisos abertos
        for (const p of PAGINAS) {
            if (p.isClosed()) continue;
            const modal = await p.locator('#tpv-modal:visible').innerText().catch(() => '');
            if (modal) console.log(`     [${p.nome}] aviso aberto: ${modal.replace(/\s+/g, ' ').slice(0, 160)}`);
            await p.screenshot({ path: path.join(SHOTS, `erro-${nome.split('.')[0]}-${p.nome}.png`) }).catch(() => {});
        }
    }
}
async function aguardar(cond, msg, timeout = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { try { if (await cond()) return true; } catch (e) {} await esperar(100); }
    ok(false, 'tempo esgotado esperando: ' + msg);
    return false;
}

async function novoPC(browser, nome) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
    await ctx.exposeFunction('__fs', async (op, ...args) => { await esperar(2 + Math.random() * 12); return fsOps[op](...args); });
    await ctx.addInitScript({ path: path.join(__dirname, 'fake-fs.js') });
    await ctx.route(/^https?:/, rota);
    const page = await ctx.newPage();
    page.nome = nome; page.dialogos = []; page.prompts = []; page.confirmes = [];
    PAGINAS.push(page);
    page.on('pageerror', e => errosJs.push(`[${nome}] ${e.message}`));
    page.on('dialog', d => {
        page.dialogos.push({ tipo: d.type(), msg: d.message() });
        if (d.type() === 'prompt') { const v = page.prompts.shift(); return v === undefined ? d.dismiss() : d.accept(v); }
        if (d.type() === 'confirm') { const r = page.confirmes.length ? page.confirmes.shift() : true; return r ? d.accept() : d.dismiss(); }
        return d.accept();
    });
    page.on('popup', p => { if (!page.manterPopup) setTimeout(() => p.close().catch(() => {}), 800); }); // recibos e etiquetas
    await page.goto(HTML);
    return page;
}
const ultimoAlerta = page => { const a = page.dialogos.filter(d => d.tipo === 'alert'); return a.length ? a[a.length - 1].msg : ''; };
async function conectar(page, opcao) {
    await page.click('#btn-selecionar-pasta');
    if (opcao) {
        await page.waitForSelector(`.tpv-modal-overlay [data-op]:has-text("${opcao}")`);
        await page.click(`.tpv-modal-overlay [data-op]:has-text("${opcao}")`);
    }
    await page.waitForSelector('#import-success-msg:not(.hidden)', { timeout: 15000 });
}
async function login(page, mat, senha) {
    await page.fill('#login-matricula', mat);
    await page.fill('#login-senha', senha);
    await page.click('#form-login button[type=submit]');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 10000 });
}
const logout = page => page.evaluate(() => window.doLogout());
const tela = (page, role) => page.evaluate(r => window.changeRole(r), role);
const sync = page => page.evaluate(async () => { window._ult.cfg = 0; await window.cicloSync(); window.agendarRender(); });
async function abrirReq(page, num) {
    await sync(page);
    await page.click(`.master-list-item:has-text("Req.${num}")`);
    await page.waitForSelector(`text=Req. ${num}`);
}
const botaoItem = (page, num, cod, texto) => page.locator(`tr[data-item="${itemDisco(num, cod).idItem}"] button:has-text("${texto}")`);
async function criarRA(page, itens, extras) {
    await tela(page, 'PRODUCAO');
    await page.fill('#f-linha', (extras && extras.linha) || 'RC1');
    await page.fill('#f-op', (extras && extras.op) || 'OP900');
    await page.fill('#f-modelo', 'TV55');
    await page.selectOption('#f-cc', { index: 1 });
    await page.selectOption('#f-motivo', 'PARA REPARO');
    for (let i = 0; i < itens.length; i++) {
        if (i > 0) await page.click('#btn-add-item');
        const row = page.locator('#itens-container .item-row').nth(i);
        await row.locator('.i-cod').fill(itens[i].cod);
        await row.locator('.i-qty').fill(String(itens[i].qty));
        await row.locator('.i-pos').fill(itens[i].pos);
    }
    const antes = ativas().length;
    await page.click('#form-req button[type=submit]');
    await aguardar(() => ativas().length > antes, 'nova requisição gravada na pasta');
    return ativas().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
}
const foto = (page, nome) => page.screenshot({ path: path.join(SHOTS, nome + '.png'), fullPage: false });

// ---------------------------------------------------------------- roteiro
(async () => {
    const browser = await chromium.launch();
    const pc1 = await novoPC(browser, 'PC1');
    let r043, r044, r045, r046;

    await passo('1. Pasta "dados" criada sozinha; admin fixo; importação só pelo admin', async () => {
        await foto(pc1, '01-login');
        ok(await pc1.locator('text=Importar banco antigo').count() === 0, 'tela de login não oferece importação');
        await conectar(pc1);
        const raiz = fsOps.list('pasta');
        ok(raiz.length > 0 && raiz.every(e => e.kind === 'directory'), 'nada solto em dados/: só subpastas (' + raiz.map(e => e.name).join(', ') + ')');
        ok(['sistema', 'materiais', 'usuarios', 'requisicoes', 'arquivo', 'chat', 'backup', 'importacao'].every(n => store.has('pasta/' + n)), 'estrutura de pastas criada');
        await aguardar(() => store.has(`pasta/backup/${diaISO(Date.now())}/ok.json`), 'backup do dia criado no primeiro acesso');
        await login(pc1, 'admin', 'admin123');
        ok(!pc1.dialogos.some(d => d.tipo === 'prompt'), 'admin/admin123 entra sem pedir troca de senha');
        await tela(pc1, 'BACKUP');
        await pc1.click('button:has-text("Importar .json antigo")');
        await pc1.waitForSelector('#tpv-modal-header:has-text("Importação concluída")');
        await foto(pc1, '02-importacao');
        await pc1.click('.tpv-modal-btn-close');
        ok(arquivos('pasta/importacao').length === 1, 'cópia do JSON importado em dados/importacao/');
        ok(store.has('pasta/sistema/banco.json'), 'sistema/banco.json criado');
        ok(fsOps.list('pasta').every(e => e.kind === 'directory'), 'continua sem nada solto após importar');
        const pe = lerJ('pasta/usuarios/1001.json');
        ok(pe.setor === 'PE / REPAIR CENTER', 'setor REPAIR CENTER virou "PE / REPAIR CENTER"');
        ok(pe.senhaHash && !('senha' in pe), 'senha gravada só como hash (sem texto puro)');
        ok(lerJ('pasta/usuarios/4001.json').trocarSenha === true, 'quem usava a senha padrão terá que trocar');
        ok(lerJ('pasta/sistema/config.json').slaRules.MMT_COLETA === 30, 'config.json com SLA de coleta padrão');
        ok(lerJ('pasta/sistema/contador.json').valor === 42, 'contador de Req preservado (42)');
        const at = ativas();
        ok(at.length === 1 && at[0].reqNum === '042', 'só a requisição em andamento ficou em ativas/');
        ok(at[0].id === '2610-1234-2' && at[0].itens[0].idItem === '2610-1234-2', 'ID repetido do formato antigo foi renomeado');
        const arq = arquivoDoDia(AGORA - 10 * D + 3000e3);
        const r041 = arq && arq.reqs.find(r => r.reqNum === '041');
        ok(!!r041, 'requisição encerrada foi para arquivo/AAAA-MM/AAAA-MM-DD.json');
        ok(r041 && r041.itens[0].doc313 === '4900000001' && r041.itens[0].doc315 === '4900000002', 'aceites por lote viraram doc313/doc315 no item');
        ok(arquivos('pasta/chat/' + diaISO(AGORA - 60e3)).length === 1, 'chat migrado para arquivo do dia/autor');
        ok(store.get('legado/banco_antigo.json').content === LEGADO_TXT, 'arquivo antigo NÃO foi alterado');
    });

    await passo('2. Admin fixo continua admin123 após importar + SLA e expediente do PCM', async () => {
        const adm = lerJ('pasta/usuarios/admin.json');
        ok(adm.trocarSenha === false && adm.fixo === true, 'admin do arquivo antigo ignorado: admin fixo mantido');
        await tela(pc1, 'ADMIN_USERS');
        await pc1.fill('#pcm-inicio', '00:00');
        await pc1.fill('#pcm-fim', '23:59');
        await pc1.check('#pcm-sabado');
        await pc1.check('#pcm-domingo');
        await pc1.fill('#sla-coleta', '25');
        await pc1.click('#btn-save-sla');
        await aguardar(() => lerJ('pasta/sistema/config.json').pcmHorario.fim === '23:59', 'config.json atualizado');
        ok(lerJ('pasta/sistema/config.json').slaRules.MMT_COLETA === 25, 'SLA de coleta do MMT gravado');
        await foto(pc1, '03-admin');
        await logout(pc1);
    });

    await passo('3. Login com senha legada em texto puro é convertido para hash', async () => {
        fsOps.write('pasta/usuarios/6001.json', JSON.stringify({ matricula: '6001', nome: 'Quezia Qualidade', senha: 'qual1234', setor: 'QUALIDADE', permissoes: ['HISTORICO', 'PRODUCAO', 'MEUS_PEDIDOS'] }));
        await login(pc1, '6001', 'qual1234');
        const u = lerJ('pasta/usuarios/6001.json');
        ok(u.senhaHash && !('senha' in u), 'senha convertida para hash no login');
        await logout(pc1);
        await pc1.fill('#login-matricula', '6001'); await pc1.fill('#login-senha', 'errada'); await pc1.click('#form-login button[type=submit]');
        await pc1.waitForSelector('#login-error:not(.hidden)');
        ok(true, 'senha errada é recusada');
    });

    await passo('4. PE / Repair Center abre R.A (limite de 15 itens)', async () => {
        await login(pc1, '1001', 'pe1234');
        await tela(pc1, 'PRODUCAO');
        for (let i = 0; i < 18; i++) await pc1.click('#btn-add-item');
        ok(await pc1.locator('#itens-container .item-row').count() === 15, 'formulário para em 15 itens');
        ok(/Limite de 15 itens/.test(ultimoAlerta(pc1)), 'aviso de limite exibido');
        await foto(pc1, '04-ra-formulario');
        r043 = await criarRA(pc1, [{ cod: '004.100', qty: 2, pos: 'U1' }, { cod: '004.101', qty: 1, pos: 'J2' }, { cod: '004.102', qty: 3, pos: 'F1' }]);
        ok(r043.reqNum === '043', 'número sequencial continua do banco antigo (043)');
        ok(r043.setorAutor === 'PE / REPAIR CENTER', 'setor solicitante gravado');
        ok(r043.itens.length === 3 && r043.itens.every(i => i.status === 'PENDENTE_MMT'), '3 itens em Triagem MMT');
        ok(r043.itens[0].itemDesc === 'CI REGULADOR 3V3' && r043.itens[0].plant === '1001', 'autocomplete do Master Data preencheu descrição e planta');
        ok(new Set(r043.itens.map(i => i.idItem)).size === 3, 'IDs dos itens únicos');
    });

    const pc2 = await novoPC(browser, 'PC2');
    await passo('5. MMT (outro PC) faz a triagem: estoque MMT / WH / PCM + desfazer', async () => {
        const okAntes = store.get(`pasta/backup/${diaISO(Date.now())}/ok.json`).content;
        await conectar(pc2);
        await esperar(1500);
        ok(store.get(`pasta/backup/${diaISO(Date.now())}/ok.json`).content === okAntes, 'segundo PC não refaz o backup do dia');
        await login(pc2, '2001', 'mmt1234');
        await tela(pc2, 'MMT');
        await abrirReq(pc2, '043');
        await foto(pc2, '05-mmt-triagem');
        await botaoItem(pc2, '043', '004.100', 'Atender do estoque MMT').click();
        await aguardar(() => itemDisco('043', '004.100').status === 'RECEBIDO_MMT', 'item 1 no balcão');
        ok(itemDisco('043', '004.100').origem === 'ESTOQUE_MMT', 'origem registrada: estoque MMT');
        await botaoItem(pc2, '043', '004.101', 'Enviar WH').click();
        await aguardar(() => itemDisco('043', '004.101').status === 'AGUARDANDO_WH', 'item 2 com o WH');
        await botaoItem(pc2, '043', '004.102', 'Enviar PCM').click();
        await aguardar(() => itemDisco('043', '004.102').status === 'AGUARDANDO_PCM', 'item 3 com o PCM');
        await botaoItem(pc2, '043', '004.102', 'desfazer').click();
        await aguardar(() => itemDisco('043', '004.102').status === 'PENDENTE_MMT', 'desfazer voltou o item 3 para a triagem');
        ok(reqDisco('043').logAlteracoes.some(l => l.desfeito), 'desfazer registrado no log');
        await botaoItem(pc2, '043', '004.102', 'Enviar PCM').click();
        await aguardar(() => itemDisco('043', '004.102').status === 'AGUARDANDO_PCM', 'item 3 de volta ao PCM');
    });

    await passo('6. PCM decide com nota obrigatória (card de análise)', async () => {
        await logout(pc1);
        await login(pc1, '3001', 'pcm1234');
        await tela(pc1, 'PCM');
        await abrirReq(pc1, '043');
        ok(await botaoItem(pc1, '043', '004.102', 'desfazer').count() === 0, 'PCM não pode desfazer ação do MMT');
        await foto(pc1, '06-pcm-card');
        await pc1.click('.pcm-card button:has-text("Liberar p/ WH")');
        ok(/nota do PCM é obrigatória/i.test(ultimoAlerta(pc1)), 'liberar sem nota é bloqueado');
        await pc1.fill(`#nota-pcm-${itemDisco('043', '004.102').idItem}`, 'Liberar do kit da OP 123456 (empréstimo, repor até 25/10)');
        await pc1.click('.pcm-card button:has-text("Liberar p/ WH")');
        await aguardar(() => itemDisco('043', '004.102').status === 'DISPONIVEL_PCM', 'item liberado para o WH');
        ok(/kit da OP 123456/.test(itemDisco('043', '004.102').obsPCM), 'nota do PCM gravada');
    });

    await passo('7. WH separa com Doc 313 enquanto o MMT entrega outro item (2 PCs ao mesmo tempo)', async () => {
        await logout(pc1);
        pc1.prompts.push('Wh@12345');
        await login(pc1, '4001', 'Mmt2026@');
        await tela(pc1, 'WAREHOUSE');
        await abrirReq(pc1, '043');
        ok(await pc1.locator('text=Liberar do kit da OP 123456').count() > 0, 'WH vê a nota do PCM em destaque');
        const rid = reqDisco('043').id;
        await pc1.fill(`#doc313-${rid}`, '123456789');
        await pc1.click('button:has-text("Separar marcados")');
        ok(/exatamente 10 caracteres/.test(ultimoAlerta(pc1)), 'Doc 313 com 9 caracteres é recusado');
        await pc1.fill(`#doc313-${rid}`, '4900012345');
        await foto(pc1, '07-wh-separacao');
        await sync(pc2);
        await pc2.fill(`#assinatura-${itemDisco('043', '004.100').idItem}`, '1001');
        await Promise.all([
            pc1.click('button:has-text("Separar marcados")'),
            botaoItem(pc2, '043', '004.100', 'Confirmar entrega').click()
        ]);
        await aguardar(() => itemDisco('043', '004.100').status === 'CONCLUIDO'
            && itemDisco('043', '004.101').status === 'SEPARADO_WH' && itemDisco('043', '004.102').status === 'SEPARADO_WH',
            'as duas alterações simultâneas ficaram gravadas', 10000);
        ok(itemDisco('043', '004.100').retiradoPor && itemDisco('043', '004.100').retiradoPor.nome === 'Paula Engenharia', 'retirada registrada pela matrícula (nome do cadastro)');
        ok(itemDisco('043', '004.101').doc313 === '4900012345' && itemDisco('043', '004.102').doc313 === '4900012345', 'mesmo Doc 313 para os 2 itens separados juntos');
    });

    await passo('8. MMT coleta no WH com Doc 315 e entrega', async () => {
        await abrirReq(pc2, '043');
        await pc2.fill(`#doc315-${reqDisco('043').id}`, '4900054321');
        await pc2.click('button:has-text("Recolher marcados do WH")');
        await aguardar(() => itemDisco('043', '004.101').status === 'RECEBIDO_MMT' && itemDisco('043', '004.102').status === 'RECEBIDO_MMT', 'itens coletados');
        ok(itemDisco('043', '004.101').doc315 === '4900054321', 'Doc 315 gravado no item');
        await foto(pc2, '08-mmt-balcao');
        for (const cod of ['004.101', '004.102']) {
            await pc2.fill(`#assinatura-${itemDisco('043', cod).idItem}`, 'Fulano Operador');
            await botaoItem(pc2, '043', cod, 'Confirmar entrega').click();
            await aguardar(() => itemDisco('043', cod).status === 'CONCLUIDO', 'entregue ' + cod);
        }
        await tela(pc2, 'ACEITES');
        await pc2.click('button:has-text("Concluídos")');
        ok(await pc2.locator('td:has-text("4900054321")').count() >= 2, 'Conferência SAP mostra os docs 313/315 por item');
        await foto(pc2, '09-conferencia-sap');
    });

    await passo('9. Arquivamento: encerrada vai para o arquivo do dia (verificar-depois-apagar)', async () => {
        const p = 'pasta/requisicoes/' + reqDisco('043').id + '.json';
        const r = lerJ(p);
        const recuar = v => iso(new Date(v).getTime() - 2 * D);
        r.itens.forEach(i => Object.keys(i.timestamps).forEach(k => { i.timestamps[k] = recuar(i.timestamps[k]); }));
        fsOps.write(p, JSON.stringify(r));
        fsOps.write('pasta/sistema/sinal.json', JSON.stringify({ ts: Date.now(), sessao: 'teste' })); // como o app faz após gravar
        await logout(pc1);
        await login(pc1, 'admin', 'admin123');
        await tela(pc1, 'BACKUP');
        await foto(pc1, '10-backup');
        await sync(pc1);
        await pc1.click('button:has-text("Arquivar agora")');
        await pc1.waitForSelector('#tpv-modal-header:has-text("Arquivamento concluído")');
        await pc1.click('.tpv-modal-btn-close');
        ok(!store.has(p), 'arquivo removido de requisicoes/ativas');
        const ultimo = Math.max(...r.itens.flatMap(i => Object.values(i.timestamps).map(t => new Date(t).getTime())));
        const arq = arquivoDoDia(ultimo);
        ok(arq && arq.reqs.some(x => x.reqNum === '043'), 'requisição está no arquivo do dia em que encerrou');
        await sync(pc2);
        await tela(pc2, 'MMT');
        await pc2.click('button:has-text("Histórico")');
        ok(await pc2.locator('.master-list-item:has-text("Req.043")').count() === 1, 'outro PC vê a arquivada no Histórico');
        await tela(pc1, 'HISTORICO');
        await pc1.waitForSelector('#dash-tabela table');
        ok(await pc1.locator('#dash-tabela td:has-text("004.102")').count() >= 1, 'Visão Geral inclui o arquivo do período');
        await esperar(800);
        await foto(pc1, '11-visao-geral');
    });

    const pc3 = await novoPC(browser, 'PC3');
    const pc4 = await novoPC(browser, 'PC4');
    await passo('10. Indisponível (PCM), não localizado (WH) e cancelamento pelo solicitante', async () => {
        await logout(pc1);
        await login(pc1, '1001', 'pe1234');
        r044 = await criarRA(pc1, [{ cod: '004.100', qty: 1, pos: 'U9' }, { cod: '004.101', qty: 4, pos: 'J9' }], { op: 'OP944' });
        r045 = await criarRA(pc1, [{ cod: '004.102', qty: 1, pos: 'F9' }], { op: 'OP945' });
        await tela(pc1, 'MEUS_PEDIDOS');
        await abrirReq(pc1, r045.reqNum);
        await botaoItem(pc1, r045.reqNum, '004.102', 'Cancelar item').click();
        await pc1.fill(`#nota-cs-${itemDisco(r045.reqNum, '004.102').idItem}`, 'Código errado');
        await pc1.click('button:has-text("Confirmar cancelamento")');
        await aguardar(() => itemDisco(r045.reqNum, '004.102').status === 'CANCELADO_SOLICITANTE', 'solicitante cancelou o item');

        await tela(pc2, 'MMT');
        await abrirReq(pc2, r044.reqNum);
        await botaoItem(pc2, r044.reqNum, '004.100', 'Enviar PCM').click();
        await aguardar(() => itemDisco(r044.reqNum, '004.100').status === 'AGUARDANDO_PCM', 'item 1 ao PCM');
        await botaoItem(pc2, r044.reqNum, '004.101', 'Enviar WH').click();
        await aguardar(() => itemDisco(r044.reqNum, '004.101').status === 'AGUARDANDO_WH', 'item 2 ao WH');

        await conectar(pc3); await login(pc3, '3001', 'pcm1234'); await tela(pc3, 'PCM');
        await abrirReq(pc3, r044.reqNum);
        await pc3.fill(`#nota-pcm-${itemDisco(r044.reqNum, '004.100').idItem}`, 'Sem saldo no SAP, NF em trânsito');
        await pc3.click('.pcm-card button:has-text("Item indisponível")');
        await aguardar(() => itemDisco(r044.reqNum, '004.100').status === 'CANCELADO_PCM', 'PCM declarou indisponível');

        await conectar(pc4); await login(pc4, '4001', 'Wh@12345'); await tela(pc4, 'WAREHOUSE');
        await abrirReq(pc4, r044.reqNum);
        await botaoItem(pc4, r044.reqNum, '004.101', 'Não localizado').click();
        await pc4.fill(`#nota-nl-${itemDisco(r044.reqNum, '004.101').idItem}`, 'Posição vazia, divergência de inventário');
        await pc4.click('button:has-text("Confirmar não localizado")');
        await aguardar(() => itemDisco(r044.reqNum, '004.101').status === 'PENDENTE_MMT', 'não localizado voltou para o MMT');
        const nl = itemDisco(r044.reqNum, '004.101');
        ok(nl.naoLocalizado && nl.naoLocalizado.voltouPara === 'PENDENTE_MMT' && !nl.timestamps.AGUARDANDO_WH, 'registro de não localizado e SLA reiniciado');

        await abrirReq(pc2, r044.reqNum);
        ok(await pc2.locator('.master-list-item:has-text("WH NÃO LOCALIZOU")').count() >= 1, 'MMT vê o selo "WH não localizou"');
        await foto(pc2, '12-mmt-notas');
        await pc2.click('button:has-text("CIENTE")');
        await aguardar(() => itemDisco(r044.reqNum, '004.100').cienteMMT === true, 'MMT deu ciente da indisponibilidade');

        await tela(pc1, 'PRODUCAO');
        await sync(pc1);
        await pc1.waitForSelector('#tpv-toast-container :text("Item indisponível")', { timeout: 10000 }).then(() => ok(true, 'solicitante recebeu aviso (toast) do item indisponível')).catch(() => ok(false, 'solicitante recebeu aviso (toast) do item indisponível'));
        await pc1.click('#producao-alertas button:has-text("CIENTE")');
        await aguardar(() => itemDisco(r044.reqNum, '004.100').cienteRequisitante === true, 'solicitante deu ciente');
    });

    await passo('11. Bypass: PCM fora do expediente → WH separa com nota obrigatória → PCM dá ciente', async () => {
        const cfg = lerJ('pasta/sistema/config.json');
        cfg.pcmHorario = { inicio: '03:00', fim: '03:01', sabado: false, domingo: false };
        if (new Date().getHours() === 3 && new Date().getMinutes() === 0) cfg.pcmHorario = { inicio: '05:00', fim: '05:01', sabado: false, domingo: false };
        fsOps.write('pasta/sistema/config.json', JSON.stringify(cfg));
        await abrirReq(pc2, r044.reqNum);
        ok(await botaoItem(pc2, r044.reqNum, '004.101', 'Enviar PCM').count() === 0, 'fora do expediente não há "Enviar PCM"');
        await botaoItem(pc2, r044.reqNum, '004.101', 'Solicitar WH').click();
        await aguardar(() => !!itemDisco(r044.reqNum, '004.101').timestamps.BYPASS_PCM, 'bypass registrado');
        await abrirReq(pc4, r044.reqNum);
        await pc4.fill(`#doc313-${reqDisco(r044.reqNum).id}`, '4900077777');
        await pc4.click('button:has-text("Separar marcados")');
        ok(/OBRIGATÓRIO/.test(ultimoAlerta(pc4)), 'bypass exige nota do WH');
        await pc4.fill(`#obs-wh-${reqDisco(r044.reqNum).id}`, 'Retirado da conta da OP 555');
        await pc4.click('button:has-text("Separar marcados")');
        await aguardar(() => itemDisco(r044.reqNum, '004.101').status === 'SEPARADO_WH', 'separado com nota');
        await sync(pc3); await tela(pc3, 'PCM');
        await pc3.click('summary:has-text("Revisão de Bypass")');
        await foto(pc3, '12b-pcm-bypass');
        await pc3.click('button:has-text("ESTOU CIENTE")');
        await aguardar(() => !!itemDisco(r044.reqNum, '004.101').timestamps.CIENTE_PCM, 'PCM deu ciente do bypass');
    });

    await passo('12. Conflito: o mesmo item alterado em 2 PCs ao mesmo tempo', async () => {
        const cfg = lerJ('pasta/sistema/config.json');
        cfg.pcmHorario = { inicio: '00:00', fim: '23:59', sabado: true, domingo: true };
        fsOps.write('pasta/sistema/config.json', JSON.stringify(cfg));
        r046 = await criarRA(pc1, [{ cod: '004.100', qty: 1, pos: 'U5' }], { op: 'OP946' });
        const pc5 = await novoPC(browser, 'PC5');
        await conectar(pc5); await login(pc5, '2001', 'mmt1234'); await tela(pc5, 'MMT');
        await abrirReq(pc5, r046.reqNum);
        await abrirReq(pc2, r046.reqNum);
        await Promise.all([
            botaoItem(pc2, r046.reqNum, '004.100', 'Enviar WH').click(),
            botaoItem(pc5, r046.reqNum, '004.100', 'Enviar PCM').click()
        ]);
        await esperar(2500);
        await sync(pc2); await sync(pc5);   // a sincronização também detecta quem perdeu
        await esperar(300);
        const st = itemDisco(r046.reqNum, '004.100').status;
        ok(['AGUARDANDO_WH', 'AGUARDANDO_PCM'].includes(st), 'item ficou com UMA das decisões: ' + st);
        const aviso = async p => (await p.locator('#tpv-modal:visible #tpv-modal-header:has-text("outro PC")').count()) > 0;
        const a2 = await aviso(pc2), a5 = await aviso(pc5);
        ok(a2 !== a5, `só quem perdeu recebeu o aviso de conflito (PC2=${a2}, PC5=${a5})`);
        const perdedor = a2 ? pc2 : pc5;
        await foto(perdedor, '15-conflito');
        await perdedor.click('.tpv-modal-btn-close').catch(() => {});
        await sync(perdedor);
        const tela2 = await perdedor.evaluate(n => window.requisicoes.find(r => r.reqNum === n).itens[0].status, r046.reqNum);
        ok(tela2 === st, 'tela de quem perdeu foi atualizada com a decisão que valeu');
        await pc5.context().close();
    });

    await passo('13. Duas R.A criadas ao mesmo tempo em PCs diferentes', async () => {
        await logout(pc3); await login(pc3, '6001', 'qual1234');
        const antes = ativas().length;
        await Promise.all([criarRA(pc1, [{ cod: '004.101', qty: 1, pos: 'A1' }], { op: 'OPX1' }), criarRA(pc3, [{ cod: '004.102', qty: 1, pos: 'B1' }], { op: 'OPX2' })]);
        await aguardar(() => ativas().length === antes + 2, 'as duas requisições gravadas');
        const novas = ativas().filter(r => ['OPX1', 'OPX2'].includes(r.op));
        ok(novas.length === 2 && novas[0].id !== novas[1].id, 'IDs diferentes');
        ok(novas[0].reqNum !== novas[1].reqNum, `números de Req diferentes (${novas.map(r => r.reqNum).join(' e ')})`);
        const nums = novas.map(r => parseInt(r.reqNum)).sort((a, b) => a - b);
        ok(nums[1] - nums[0] === 1, 'números consecutivos, sem pular');
    });

    await passo('14. Screenshots extras (modo escuro, chat, painel)', async () => {
        await tela(pc2, 'CHAT');
        await pc2.fill('#chat-input', 'Teste <b>sem HTML</b> @PCM');
        await pc2.click('button:has-text("Enviar")');
        await aguardar(() => arquivos('pasta/chat/' + diaISO(Date.now())).length >= 1, 'mensagem gravada no arquivo do dia');
        ok(await pc2.locator('#chat-messages b').count() === 0, 'HTML digitado no chat é exibido como texto');
        await foto(pc2, '13-chat');
        await pc2.evaluate(() => window.TPVTheme.toggle());
        await tela(pc2, 'MMT');
        await abrirReq(pc2, r044.reqNum);
        await foto(pc2, '14-mmt-escuro');
        await pc2.evaluate(() => window.TPVTheme.toggle());

        pc2.manterPopup = true;
        const [painel] = await Promise.all([pc2.waitForEvent('popup'), pc2.evaluate(() => window.abrirPainelPublico())]);
        await painel.waitForSelector('text=Status em Tempo Real');
        ok(await painel.locator('tbody tr').count() >= 1, 'Painel Público (TV) lista os itens em andamento');
        await painel.setViewportSize({ width: 1500, height: 900 });
        await painel.screenshot({ path: path.join(SHOTS, '16-painel-publico.png') });
        await painel.close();
        pc2.manterPopup = false;

        await tela(pc1, 'MEUS_PEDIDOS');
        await sync(pc1);
        await foto(pc1, '17-meus-pedidos');
        await tela(pc1, 'PRODUCAO');
        await foto(pc1, '18-ra-com-alertas');
    });

    await browser.close();
    const errosRelevantes = errosJs.filter(e => !/Failed to fetch|net::ERR|Não foi possível carregar/.test(e));
    console.log('\n──────────────────────────────────────────');
    if (errosRelevantes.length) { console.log('Erros de JavaScript nas páginas:'); errosRelevantes.forEach(e => console.log('  ' + e)); }
    if (falhas.length || errosRelevantes.length) {
        console.log(`FALHOU: ${falhas.length} verificação(ões), ${errosRelevantes.length} erro(s) de JS`);
        falhas.forEach(f => console.log('  - ' + f));
        process.exit(1);
    }
    console.log('TODOS OS TESTES PASSARAM. Screenshots em ' + SHOTS);
})();
