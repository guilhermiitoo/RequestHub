// Pasta de rede simulada para os testes E2E.
// Substitui showDirectoryPicker/showOpenFilePicker por handles que guardam os arquivos
// num armazenamento do lado do Node (window.__fs, exposto pelo Playwright). Como o
// armazenamento é único, duas abas = dois PCs gravando na mesma pasta.
(() => {
    const erro = (nome) => new DOMException(nome, nome);
    const fs = (...args) => window.__fs(...args);

    class FakeFileHandle {
        constructor(path, name) { this.kind = 'file'; this.name = name; this._path = path; }
        async getFile() {
            const r = await fs('read', this._path);
            if (!r) throw erro('NotFoundError');
            return new File([r.content], this.name, { lastModified: r.lastModified, type: 'application/json' });
        }
        async createWritable() {
            const path = this._path;
            let buf = '';
            return {
                async write(d) { buf += typeof d === 'string' ? d : await new Blob([d]).text(); },
                async close() { await fs('write', path, buf); },   // grava tudo no close (igual ao swap atômico do Chrome)
                async abort() { buf = ''; }
            };
        }
        async queryPermission() { return 'granted'; }
        async requestPermission() { return 'granted'; }
    }

    class FakeDirHandle {
        constructor(path, name) { this.kind = 'directory'; this.name = name; this._path = path; }
        async getDirectoryHandle(name, opts) {
            const p = this._path + '/' + name;
            const st = await fs('stat', p);
            if (!st) {
                if (!(opts && opts.create)) throw erro('NotFoundError');
                await fs('mkdir', p);
            } else if (st !== 'directory') throw erro('TypeMismatchError');
            return new FakeDirHandle(p, name);
        }
        async getFileHandle(name, opts) {
            const p = this._path + '/' + name;
            const st = await fs('stat', p);
            if (!st) {
                if (!(opts && opts.create)) throw erro('NotFoundError');
                await fs('write', p, '');
            } else if (st !== 'file') throw erro('TypeMismatchError');
            return new FakeFileHandle(p, name);
        }
        async removeEntry(name, opts) {
            const r = await fs('remove', this._path + '/' + name, !!(opts && opts.recursive));
            if (r) throw erro(r);
        }
        async *entries() {
            for (const e of await fs('list', this._path)) {
                const p = this._path + '/' + e.name;
                yield [e.name, e.kind === 'directory' ? new FakeDirHandle(p, e.name) : new FakeFileHandle(p, e.name)];
            }
        }
        async queryPermission() { return 'granted'; }
        async requestPermission() { return 'granted'; }
    }

    window.showDirectoryPicker = async () => new FakeDirHandle('raiz', 'SPARE_PARTS');
    window.showOpenFilePicker = async () => [new FakeFileHandle('legado/banco_antigo.json', 'banco_antigo.json')];
})();
