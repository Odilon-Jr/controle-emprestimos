// ============================================================
// CONTROLE DE EMPRÉSTIMOS — App principal
// ============================================================

const DEFAULT_DB = {
  version: '1.0',
  devedores: [],
  emprestimos: [],
  _seq: { devedores: 0, emprestimos: 0 }
};

const App = (() => {
  let db;

  function init() {
    const stored = localStorage.getItem('emprestimos_db');
    db = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(DEFAULT_DB));

    if (!db._seq) db._seq = { devedores: 0, emprestimos: 0 };
    if (!db.devedores) db.devedores = [];
    if (!db.emprestimos) db.emprestimos = [];

    setupNav();
    navigateTo('dashboard');
  }

  function save() {
    localStorage.setItem('emprestimos_db', JSON.stringify(db));
  }

  function nextId(entity) {
    db._seq[entity] = (db._seq[entity] || 0) + 1;
    return db._seq[entity];
  }

  function fmtBRL(v) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function fmtDate(d) {
    if (!d) return '—';
    const parts = d.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
  }

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function monthStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  function monthLabel(m) {
    const [y, mo] = m.split('-');
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return months[parseInt(mo, 10) - 1] + '/' + y;
  }

  function addMonthsToMonth(month, offset) {
    const [y, mo] = month.split('-').map(Number);
    const d = new Date(y, (mo - 1) + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
  }

  function dueDateForMonth(month, day) {
    const [y, mo] = month.split('-');
    const d = String(day).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }

  function getDevedor(id) {
    return db.devedores.find(d => d.id === id);
  }

  function getEmprestimo(id) {
    return db.emprestimos.find(e => e.id === id);
  }

  function getParcelasAbertas(emprestimo) {
    return (emprestimo.parcelas || []).filter(p => !p.pago);
  }

  function getVencimentoEmTexto(parcela) {
    if (!parcela.due_date) return '—';
    const [y, m, d] = parcela.due_date.split('-');
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${parseInt(d,10)} ${months[parseInt(m,10)-1]}/${y}`;
  }

  function getStatusEmprestimo(emprestimo) {
    const parcelas = emprestimo.parcelas || [];
    if (!parcelas.length) return 'Sem parcelas';
    const todasPagas = parcelas.every(p => p.pago);
    if (todasPagas) return 'Quitado';
    const temVencida = parcelas.some(p => !p.pago && p.due_date < todayStr());
    if (temVencida) return 'Atrasado';
    return 'Em aberto';
  }

  function getDevedorBalance(devedorId) {
    const emprestimos = db.emprestimos.filter(e => e.devedor_id === devedorId);
    let emprestado = 0;
    let recebido = 0;
    emprestimos.forEach(e => {
      emprestado += e.total || 0;
      (e.parcelas || []).forEach(p => {
        if (p.pago) recebido += (p.amount || 0);
      });
    });
    return { emprestado, recebido, aberto: emprestado - recebido };
  }

  // Mensagens para cobrança (modelo)
  function getCobrancasMensagem(parcela, emprestimoId) {
    const emprestimo = getEmprestimo(emprestimoId);
    const devedor = emprestimo ? getDevedor(emprestimo.devedor_id) : null;    // fmtBRL usa espaço não separável (NBSP) depois do "R$"; normalizar evita
    // coisas como "Parcela de R$ R$ 100,00" no texto enviado.
    const descricao = `Parcela de ${fmtBRL(parcela.amount).replace(/\u00a0/g, ' ')}`;
    const data = getVencimentoEmTexto(parcela);
    return {
      whats: `Oi ${devedor ? devedor.nome : ''}, tudo bem? Lembrete: ${descricao}, vencimento ${data}. Pode pagar quando quiser. Obrigado!`,
      email: {
        subject: `Lembrete de pagamento — ${descricao}`,
        body: `Olá ${devedor ? devedor.nome : ''}!\n\nLembrete: ${descricao}, vencimento ${data}.\n\nPode pagar quando puder. Qualquer dúvida é só chamar.\n\nObrigado!`
      }
    };
  }

  // ============================================================
  // Navegação e renderização
  // ============================================================

  function setupNav() {
    document.querySelectorAll('[data-page]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        navigateTo(link.getAttribute('data-page'));
      });
    });
  }

  function navigateTo(page) {
    document.querySelectorAll('.page-content').forEach(el => {
      el.classList.toggle('active', el.id === 'page-' + page);
    });
    document.querySelectorAll('[data-page]').forEach(l => l.classList.toggle('active', l.getAttribute('data-page') === page));

    switch (page) {
      case 'dashboard': renderDashboard(); break;
      case 'devedores': renderDevedores(); break;
      case 'emprestimos': renderEmprestimos(); break;
      case 'cobrancas': renderCobrancas(); break;
      case 'backup': renderBackup(); break;
    }
  }

  // ============================================================
  // Dashboard
  // ============================================================

  function renderDashboard() {
    const el = document.getElementById('page-dashboard');
    if (!el) return;

    const totalEmprestado = db.emprestimos.reduce((s, e) => s + (e.total || 0), 0);
    const totalRecebido = db.emprestimos.reduce((s, e) => s + (e.parcelas || []).filter(p => p.pago).reduce((a, p) => a + (p.amount || 0), 0), 0);
    const totalAberto = totalEmprestado - totalRecebido;

    const vencidas = db.emprestimos.reduce((s, e) => {
      return s + (e.parcelas || []).filter(p => !p.pago && (p.due_date < todayStr())).length;
    }, 0);

    const proximosVencimentos = db.emprestimos.reduce((s, e) => {
      return s + (e.parcelas || []).filter(p => !p.pago && p.due_date === todayStr()).length;
    }, 0);

    const vencimentoSemana = db.emprestimos.reduce((s, e) => {
      const semanaLimite = new Date();
      semanaLimite.setDate(semanaLimite.getDate() + 7);
      return s + (e.parcelas || []).filter(p => !p.pago && p.due_date >= todayStr() && p.due_date <= semanaLimite.toISOString().slice(0,10)).length;
    }, 0);

    el.innerHTML = `
      <h2 class="dashboard-title">Dashboard</h2>
      <div class="row g-3">
        <div class="col-md-4">
          <div class="stat-card stat-info">
            <div class="stat-label">Total Emprestado</div>
            <div class="stat-value">${fmtBRL(totalEmprestado)}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="stat-card stat-success">
            <div class="stat-label">Total Recebido</div>
            <div class="stat-value">${fmtBRL(totalRecebido)}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="stat-card ${totalAberto > 0 ? 'stat-danger' : 'stat-success'}">
            <div class="stat-label">Total Aberto</div>
            <div class="stat-value">${fmtBRL(totalAberto)}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="stat-card stat-warning">
            <div class="stat-label">Vencidas</div>
            <div class="stat-value">${vencidas}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="stat-card stat-danger">
            <div class="stat-label">Hoje</div>
            <div class="stat-value">${proximosVencimentos}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="stat-card stat-warning">
            <div class="stat-label">Esta semana</div>
            <div class="stat-value">${vencimentoSemana}</div>
          </div>
        </div>
      </div>
      <div class="mt-4">
        <h4 class="mb-3">Próximos vencimentos</h4>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Devedor</th>
                <th>Empréstimo</th>
                <th>Parcela</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${getProximosVencimentos().slice(0, 10).map(p => {
                const devedor = getDevedor(p.devedor_id);
                const emprestimo = getEmprestimo(p.emprestimo_id);
                const statusClass = p.due_date === todayStr() ? 'badge-atrasado' : (p.due_date < todayStr() ? 'badge-pendente' : 'badge-pago');
                const statusText = p.due_date === todayStr() ? 'Hoje' : (p.due_date < todayStr() ? 'Atrasado' : 'A vencer');
                return `
                  <tr>
                    <td>${devedor ? devedor.nome : '—'}</td>
                    <td>${emprestimo ? emprestimo.descricao : '—'}</td>
                    <td>${p.numero}ª</td>
                    <td class="text-success">${fmtBRL(p.amount)}</td>
                    <td>${getVencimentoEmTexto(p)}</td>
                    <td><span class="badge ${statusClass}">${statusText}</span></td>
                    <td>
                      <button class="btn btn-sm btn-outline" onclick="App.registrarPagamento(${p.emprestimo_id}, ${p.numero})" title="Registrar pagamento">
                        <i class="bi bi-check-lg me-1"></i>Pago
                      </button>
                      <button class="btn btn-sm btn-outline" onclick="App.abrirCobranca(${p.emprestimo_id}, ${p.numero})" title="Lembrete">
                        <i class="bi bi-chat-dots-fill me-1"></i>Lembrete
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function getProximosVencimentos() {
    const today = todayStr();
    const result = [];
    db.emprestimos.forEach(e => {
      (e.parcelas || []).forEach(p => {
        if (!p.pago && p.due_date >= today) {
          result.push({
            emprestimo_id: e.id,
            devedor_id: e.devedor_id,
            numero: p.numero,
            amount: p.amount,
            due_date: p.due_date,
            sortKey: p.due_date
          });
        }
      });
    });
    result.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return result;
  }

  // ============================================================
  // Devedores
  // ============================================================

  function renderDevedores() {
    const el = document.getElementById('page-devedores');
    if (!el) return;

    const filtro = (el.querySelector('#filtroNome')?.value || '').toLowerCase().trim();

    const lista = db.devedores.filter(d => !filtro || (d.nome || '').toLowerCase().includes(filtro));

    const rows = lista.map(d => {
      const balance = getDevedorBalance(d.id);
      return `
        <tr>
          <td><strong>${d.nome || '—'}</strong></td>
          <td>${d.telefone || '—'}</td>
          <td>${d.whatsapp || '—'}</td>
          <td>${d.email || '—'}</td>
          <td>
            <span class="badge ${balance.aberto > 0 ? 'badge-atrasado' : 'badge-pago'}">${balance.aberto > 0 ? 'Devendo' : 'Quitado'}</span>
          </td>
          <td>${fmtBRL(balance.aberto)}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="App.abrirEmprestimo(${d.id})" title="Novo empréstimo">
              <i class="bi bi-plus-lg me-1"></i>Empréstimo
            </button>
            <button class="btn btn-sm btn-outline" onclick="App.visualizarDevedor(${d.id})" title="Visualizar">
              <i class="bi bi-eye me-1"></i>
            </button>
            <button class="btn btn-sm btn-outline" onclick="App.editarDevedor(${d.id})" title="Editar">
              <i class="bi bi-pencil me-1"></i>
            </button>
            <button class="btn btn-sm btn-outline" onclick="App.excluirDevedor(${d.id})" title="Excluir">
              <i class="bi bi-trash me-1"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    el.innerHTML = `
      <h2 class="mb-3">Devedores</h2>
      <div class="table-container">
        <div class="busca">
          <input type="text" id="filtroNome" class="form-control" placeholder="Buscar por nome..." oninput="App.renderDevedores()">
        </div>
        <table class="table mt-3">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>WhatsApp</th>
              <th>Email</th>
              <th>Situação</th>
              <th>Total Devendo</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="7" class="text-center">Nenhum devedor cadastrado.</td></tr>'}
          </tbody>
        </table>
        <button class="btn btn-primary mt-2" onclick="App.abrirDevedor()">
          <i class="bi bi-plus-lg me-1"></i>Novo Devedor
        </button>
      </div>
    `;
  }

  function abrirDevedor() {
    const body = `
      <form id="formDevedor">
        <div class="form-group">
          <label for="devedorNome">Nome *</label>
          <input type="text" id="devedorNome" class="form-control" required>
        </div>
        <div class="form-group">
          <label for="devedorTelefone">Telefone</label>
          <input type="text" id="devedorTelefone" class="form-control">
        </div>
        <div class="form-group">
          <label for="devedorWhatsapp">WhatsApp</label>
          <input type="text" id="devedorWhatsapp" class="form-control">
        </div>
        <div class="form-group">
          <label for="devedorEmail">Email</label>
          <input type="email" id="devedorEmail" class="form-control">
        </div>
      </form>
    `;
    const buttons = [
      { label: 'Salvar', class: 'btn-primary', onclick: 'App.salvarDevedor(null)' },
      { label: 'Cancelar', class: 'btn-outline', onclick: 'App.closeModal()' }
    ];
    showModal('Novo Devedor', body, buttons);
  }

  function visualizarDevedor(id) {
    const d = getDevedor(id);
    if (!d) return;

    const balance = getDevedorBalance(id);
    const emprestimos = db.emprestimos.filter(e => e.devedor_id === id);

    const body = `
      <dl class="row mb-0">
        <dt class="col-sm-4">Nome</dt>
        <dd class="col-sm-8">${d.nome}</dd>
        <dt class="col-sm-4">Telefone</dt>
        <dd class="col-sm-8">${d.telefone || '—'}</dd>
        <dt class="col-sm-4">WhatsApp</dt>
        <dd class="col-sm-8">${d.whatsapp || '—'}</dd>
        <dt class="col-sm-4">Email</dt>
        <dd class="col-sm-8">${d.email || '—'}</dd>
        <dt class="col-sm-4">Total emprestado</dt>
        <dd class="col-sm-8">${fmtBRL(balance.emprestado)}</dd>
        <dt class="col-sm-4">Total recebido</dt>
        <dd class="col-sm-8">${fmtBRL(balance.recebido)}</dd>
        <dt class="col-sm-4">Total aberto</dt>
        <dd class="col-sm-8">${fmtBRL(balance.aberto)}</dd>
      </dl>
      <h5 class="mt-4">Empréstimos</h5>
      <table class="table mt-2">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Data</th>
            <th>Total</th>
            <th>Situação</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${emprestimos.map(e => `
            <tr>
              <td>${e.descricao || '—'}</td>
              <td>${fmtDate(e.data)}</td>
              <td>${fmtBRL(e.total)}</td>
              <td><span class="badge ${getStatusEmprestimo(e) === 'Quitado' ? 'badge-pago' : (getStatusEmprestimo(e) === 'Atrasado' ? 'badge-atrasado' : 'badge-pendente')}">${getStatusEmprestimo(e)}</span></td>
              <td>
                <button class="btn btn-sm btn-outline" onclick="App.abrirEmprestimo(${e.devedor_id}, ${e.id})" title="Ver parcelas">
                  <i class="bi bi-eye me-1"></i>Parcelas
                </button>
              </td>
            </tr>
          `).join('') || '<tr><td colspan="5" class="text-center">Nenhum empréstimo</td></tr>'}
        </tbody>
      </table>
    `;
    showModal(`Devedor: ${d.nome}`, body, [{ label: 'Fechar', class: 'btn-outline', onclick: 'App.closeModal()' }]);
  }

  function editarDevedor(id) {
    const d = getDevedor(id);
    if (!d) return;

    const body = `
      <form id="formDevedor">
        <div class="form-group">
          <label for="devedorNome">Nome *</label>
          <input type="text" id="devedorNome" class="form-control" value="${d.nome}" required>
        </div>
        <div class="form-group">
          <label for="devedorTelefone">Telefone</label>
          <input type="text" id="devedorTelefone" class="form-control" value="${d.telefone || ''}">
        </div>
        <div class="form-group">
          <label for="devedorWhatsapp">WhatsApp</label>
          <input type="text" id="devedorWhatsapp" class="form-control" value="${d.whatsapp || ''}">
        </div>
        <div class="form-group">
          <label for="devedorEmail">Email</label>
          <input type="email" id="devedorEmail" class="form-control" value="${d.email || ''}">
        </div>
      </form>
    `;
    const buttons = [
      { label: 'Salvar', class: 'btn-primary', onclick: `App.salvarDevedor(${id})` },
      { label: 'Cancelar', class: 'btn-outline', onclick: 'App.closeModal()' }
    ];
    showModal('Editar Devedor', body, buttons);
  }

  function salvarDevedor(id) {
    const nome = document.getElementById('devedorNome').value.trim();
    const telefone = document.getElementById('devedorTelefone').value.trim();
    const whatsapp = document.getElementById('devedorWhatsapp').value.trim();
    const email = document.getElementById('devedorEmail').value.trim();

    if (!nome) {
      toast('Nome é obrigatório.', 'danger');
      return;
    }

    if (id) {
      const d = getDevedor(id);
      if (d) {
        d.nome = nome;
        d.telefone = telefone;
        d.whatsapp = whatsapp;
        d.email = email;
      }
    } else {
      db.devedores.push({
        id: nextId('devedores'),
        nome,
        telefone,
        whatsapp,
        email
      });
    }

    save();
    closeModal();
    toast('Devedor salvo!', 'success');
    navigateTo('devedores');
  }

  function excluirDevedor(id) {
    const d = getDevedor(id);
    if (!d) return;

    if (!confirm(`Excluir o devedor "${d.nome}"?\n\nIsso não apaga os empréstimos associados.`)) return;

    db.devedores = db.devedores.filter(x => x.id !== id);
    save();
    toast('Devedor excluído.', 'success');
    navigateTo('devedores');
  }

  // ============================================================
  // Empréstimos
  // ============================================================

  function renderEmprestimos() {
    const el = document.getElementById('page-emprestimos');
    if (!el) return;

    const filtroDevedor = (el.querySelector('#filtroDevedor')?.value || '').toString();
    const filtroStatus = (el.querySelector('#filtroStatus')?.value || '').toString();

    let lista = db.emprestimos.slice();

    if (filtroDevedor) {
      const devedorId = parseInt(filtroDevedor, 10);
      lista = lista.filter(e => e.devedor_id === devedorId);
    }

    if (filtroStatus) {
      lista = lista.filter(e => getStatusEmprestimo(e) === filtroStatus);
    }

    const rows = lista.map(e => {
      const devedor = getDevedor(e.devedor_id);
      const status = getStatusEmprestimo(e);
      const statusClass = status === 'Quitado' ? 'badge-pago' : (status === 'Atrasado' ? 'badge-atrasado' : 'badge-pendente');
      const parcelasAbertas = getParcelasAbertas(e).length;
      const totalParcelas = (e.parcelas || []).length;

      return `
        <tr>
          <td>${devedor ? devedor.nome : '—'}</td>
          <td>${e.descricao || '—'}</td>
          <td>${fmtDate(e.data)}</td>
          <td>${fmtBRL(e.total)}</td>
          <td>${totalParcelas}</td>
          <td><span class="badge ${statusClass}">${status}</span></td>
          <td>${parcelasAbertas}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="App.abrirEmprestimo(${e.devedor_id}, ${e.id})" title="Ver parcelas">
              <i class="bi bi-eye me-1"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const devedoresOptions = db.devedores.map(d => `<option value="${d.id}">${d.nome}</option>`).join('');

    el.innerHTML = `
      <h2 class="mb-3">Empréstimos</h2>
      <div class="table-container">
        <div class="row g-2 mb-3">
          <div class="col-md-4">
            <select id="filtroDevedor" class="form-select" onchange="App.renderEmprestimos()">
              <option value="">Todos os devedores</option>
              ${devedoresOptions}
            </select>
          </div>
          <div class="col-md-4">
            <select id="filtroStatus" class="form-select" onchange="App.renderEmprestimos()">
              <option value="">Todos os status</option>
              <option value="Em aberto" ${filtroStatus === 'Em aberto' ? 'selected' : ''}>Em aberto</option>
              <option value="Atrasado" ${filtroStatus === 'Atrasado' ? 'selected' : ''}>Atrasado</option>
              <option value="Quitado" ${filtroStatus === 'Quitado' ? 'selected' : ''}>Quitado</option>
            </select>
          </div>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Devedor</th>
              <th>Descrição</th>
              <th>Data</th>
              <th>Total</th>
              <th>Total Parcelas</th>
              <th>Situação</th>
              <th>Aberto</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="8" class="text-center">Nenhum empréstimo.</td></tr>'}
          </tbody>
        </table>
        <button class="btn btn-primary mt-2" onclick="App.abrirNovoEmprestimo()">
          <i class="bi bi-plus-lg me-1"></i>Novo Empréstimo
        </button>
      </div>
    `;
  }

  function abrirNovoEmprestimo(devedorId) {
    const devedoresOptions = db.devedores.map(d => `<option value="${d.id}"${d.id === devedorId ? ' selected' : ''}>${d.nome}</option>`).join('');
    const body = `
      <form id="formEmprestimo">
        <div class="form-group">
          <label for="emprestimoDevedor">Devedor *</label>
          <select id="emprestimoDevedor" class="form-select" required>
            <option value="">Selecione</option>
            ${devedoresOptions}
          </select>
        </div>
        <div class="form-group">
          <label for="emprestimoDescricao">Descrição</label>
          <input type="text" id="emprestimoDescricao" class="form-control" placeholder="Ex: Empréstimo para X">
        </div>
        <div class="form-group">
          <label for="emprestimoTotal">Valor total (R$) *</label>
          <input type="number" id="emprestimoTotal" class="form-control" step="0.01" min="0.01" required>
        </div>
        <div class="form-group">
          <label for="emprestimoData">Data do empréstimo *</label>
          <input type="date" id="emprestimoData" class="form-control" required>
        </div>
        <div class="form-group">
          <label for="emprestimoParcelas">Número de parcelas *</label>
          <input type="number" id="emprestimoParcelas" class="form-control" min="1" value="1" required>
        </div>
      </form>
    `;
    const buttons = [
      { label: 'Salvar', class: 'btn-primary', onclick: 'App.salvarEmprestimo(null)' },
      { label: 'Cancelar', class: 'btn-outline', onclick: 'App.closeModal()' }
    ];
    showModal('Novo Empréstimo', body, buttons);
  }

  function abrirEmprestimo(devedorId, emprestimoId) {
    // Chamado com apenas o devedor (botão "+Empréstimo" em Devedores)
    if (emprestimoId === undefined) {
      return abrirNovoEmprestimo(devedorId);
    }

    const e = getEmprestimo(emprestimoId);
    if (!e) return;

    const devedor = getDevedor(e.devedor_id);
    const parcelasPagas = (e.parcelas || []).filter(p => p.pago);
    const parcelasAbertas = (e.parcelas || []).filter(p => !p.pago);

    const body = `
      <p><strong>Devedor:</strong> ${devedor ? devedor.nome : '—'}</p>
      <p><strong>Descrição:</strong> ${e.descricao || '—'}</p>
      <p><strong>Data:</strong> ${fmtDate(e.data)}</p>
      <p><strong>Total:</strong> ${fmtBRL(e.total)}</p>
      <h5 class="mt-4">Parcela paga: ${parcelasPagas.length} / ${parcelasPagas.length + parcelasAbertas.length}</h5>
      <table class="table mt-2">
        <thead>
          <tr>
            <th>Nº</th>
            <th>Valor</th>
            <th>Vencimento</th>
            <th>Pago</th>
            <th>Data pagto</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${(e.parcelas || []).map(p => `
            <tr>
              <td>${p.numero}ª</td>
              <td>${fmtBRL(p.amount)}</td>
              <td>${getVencimentoEmTexto(p)}</td>
              <td>${p.pago ? '<span class="badge badge-pago">Sim</span>' : '<span class="badge badge-pendente">Não</span>'}</td>
              <td>${p.pago ? fmtDate(p.paid_date) : '—'}</td>
              <td>
                ${!p.pago ? `
                  <button class="btn btn-sm btn-outline" onclick="App.registrarPagamento(${e.id}, ${p.numero})" title="Registrar pagamento">
                    <i class="bi bi-check-lg me-1"></i>Pago
                  </button>
                  <button class="btn btn-sm btn-outline" onclick="App.abrirCobranca(${e.id}, ${p.numero})" title="Lembrete">
                    <i class="bi bi-chat-dots-fill me-1"></i>Lembrete
                  </button>
                ` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    showModal(`Empréstimo: ${e.descricao || '—'}`, body, [{ label: 'Fechar', class: 'btn-outline', onclick: 'App.closeModal()' }]);
  }

  function salvarEmprestimo(id) {
    const devedorId = parseInt(document.getElementById('emprestimoDevedor').value, 10);
    const descricao = document.getElementById('emprestimoDescricao').value.trim();
    const total = parseFloat(document.getElementById('emprestimoTotal').value);
    const data = document.getElementById('emprestimoData').value;
    const parcelasCount = parseInt(document.getElementById('emprestimoParcelas').value, 10);

    if (!devedorId || !total || total <= 0 || !data || !parcelasCount || parcelasCount < 1) {
      toast('Preencha todos os campos obrigatórios.', 'danger');
      return;
    }

    const parcelaAmount = total / parcelasCount;
    const parcelas = [];
    let dataAtual = data;
    for (let i = 1; i <= parcelasCount; i++) {
      parcelas.push({
        numero: i,
        amount: arredondarUltimaParcela(total, parcelasCount, i, parcelaAmount),
        due_date: dataAtual,
        pago: false,
        paid_date: null
      });
      const nextMonth = addMonthsToMonth(dataAtual.slice(0,7), 1);
      dataAtual = dueDateForMonth(nextMonth, parseInt(data.split('-')[2], 10));
    }

    if (id) {
      const e = getEmprestimo(id);
      if (e) {
        e.descricao = descricao;
        e.total = total;
        e.data = data;
        e.parcelas = parcelas;
      }
    } else {
      db.emprestimos.push({
        id: nextId('emprestimos'),
        devedor_id: devedorId,
        descricao,
        total,
        data,
        parcelas
      });
    }

    save();
    closeModal();
    toast('Empréstimo salvo!', 'success');
    navigateTo('emprestimos');
  }

  function arredondarUltimaParcela(total, totalParcelas, atual, parcelaAmount) {
    if (atual === totalParcelas) {
      const somaAnterior = (totalParcelas - 1) * parcelaAmount;
      return Math.round((total - somaAnterior) * 100) / 100;
    }
    return Math.round(parcelaAmount * 100) / 100;
  }

  function excluirEmprestimo(id) {
    const e = getEmprestimo(id);
    if (!e) return;

    if (!confirm(`Excluir o empréstimo "${e.descricao || '—'}"?`)) return;

    db.emprestimos = db.emprestimos.filter(x => x.id !== id);
    save();
    toast('Empréstimo excluído.', 'success');
    navigateTo('emprestimos');
  }

  // ============================================================
  // Cobranças
  // ============================================================

  function renderCobrancas() {
    const el = document.getElementById('page-cobrancas');
    if (!el) return;

    const todasParcelasAbertas = [];
    db.emprestimos.forEach(e => {
      (e.parcelas || []).forEach(p => {
        if (!p.pago) {
          todasParcelasAbertas.push({
            emprestimo_id: e.id,
            devedor_id: e.devedor_id,
            numero: p.numero,
            amount: p.amount,
            due_date: p.due_date
          });
        }
      });
    });

    const ordenado = todasParcelasAbertas.sort((a, b) => a.due_date.localeCompare(b.due_date));

    const rows = ordenado.map(p => {
      const devedor = getDevedor(p.devedor_id);
      const emprestimo = getEmprestimo(p.emprestimo_id);
      const isHoje = p.due_date === todayStr();
      const isAtrasado = p.due_date < todayStr();
      const statusClass = isHoje ? 'badge-atrasado' : (isAtrasado ? 'badge-pendente' : 'badge-pago');
      const statusText = isHoje ? 'Hoje' : (isAtrasado ? 'Atrasado' : 'A vencer');

      return `
        <tr>
          <td>${devedor ? devedor.nome : '—'}</td>
          <td>${emprestimo ? emprestimo.descricao : '—'}</td>
          <td>${p.numero}ª</td>
          <td class="text-success">${fmtBRL(p.amount)}</td>
          <td>${getVencimentoEmTexto(p)}</td>
          <td><span class="badge ${statusClass}">${statusText}</span></td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="App.registrarPagamento(${p.emprestimo_id}, ${p.numero})" title="Registrar pagamento">
              <i class="bi bi-check-lg me-1"></i>Pago
            </button>
            <button class="btn btn-sm btn-outline" onclick="App.abrirCobranca(${p.emprestimo_id}, ${p.numero})" title="Lembrete">
              <i class="bi bi-chat-dots-fill me-1"></i>Lembrete
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const hoje = todayStr();
    const semana = new Date();
    semana.setDate(semana.getDate() + 7);
    const semanaStr = semana.toISOString().slice(0, 10);

    const nestaSemanana = ordenado.filter(p => p.due_date >= hoje && p.due_date <= semanaStr);
    const atrasados = ordenado.filter(p => p.due_date < hoje);

    el.innerHTML = `
      <h2 class="mb-3">Cobranças</h2>
      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <div class="stat-card stat-danger">
            <div class="stat-label">Atrasados</div>
            <div class="stat-value">${atrasados.length}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="stat-card stat-warning">
            <div class="stat-label">Nesta semana</div>
            <div class="stat-value">${nestaSemanana.length}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="stat-card stat-info">
            <div class="stat-label">Total a receber</div>
            <div class="stat-value">${fmtBRL(ordenado.reduce((s, p) => s + p.amount, 0))}</div>
          </div>
        </div>
      </div>
      <h4 class="mb-3">Atrasados</h4>
      <div class="table-container mb-4">
        <table class="table">
          <thead>
            <tr>
              <th>Devedor</th>
              <th>Empréstimo</th>
              <th>Parcela</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${atrasados.map(p => {
              const devedor = getDevedor(p.devedor_id);
              const emprestimo = getEmprestimo(p.emprestimo_id);
              return `
                <tr>
                  <td>${devedor ? devedor.nome : '—'}</td>
                  <td>${emprestimo ? emprestimo.descricao : '—'}</td>
                  <td>${p.numero}ª</td>
                  <td class="text-danger">${fmtBRL(p.amount)}</td>
                  <td>${getVencimentoEmTexto(p)}</td>
                  <td><span class="badge badge-atrasado">Atrasado</span></td>
                  <td>
                    <button class="btn btn-sm btn-outline" onclick="App.registrarPagamento(${p.emprestimo_id}, ${p.numero})" title="Registrar pagamento">
                      <i class="bi bi-check-lg me-1"></i>Pago
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="App.abrirCobranca(${p.emprestimo_id}, ${p.numero})" title="Lembrete">
                      <i class="bi bi-chat-dots-fill me-1"></i>Lembrete
                    </button>
                  </td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="7" class="text-center">Nenhum atrasado.</td></tr>'}
          </tbody>
        </table>
      </div>
      <h4 class="mb-3">Próximos vencimentos</h4>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Devedor</th>
              <th>Empréstimo</th>
              <th>Parcela</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${nestaSemanana.map(p => {
              const devedor = getDevedor(p.devedor_id);
              const emprestimo = getEmprestimo(p.emprestimo_id);
              const isHoje = p.due_date === hoje;
              const statusClass = isHoje ? 'badge-atrasado' : 'badge-pago';
              const statusText = isHoje ? 'Hoje' : 'A vencer';
              return `
                <tr>
                  <td>${devedor ? devedor.nome : '—'}</td>
                  <td>${emprestimo ? emprestimo.descricao : '—'}</td>
                  <td>${p.numero}ª</td>
                  <td class="text-success">${fmtBRL(p.amount)}</td>
                  <td>${getVencimentoEmTexto(p)}</td>
                  <td><span class="badge ${statusClass}">${statusText}</span></td>
                  <td>
                    <button class="btn btn-sm btn-outline" onclick="App.registrarPagamento(${p.emprestimo_id}, ${p.numero})" title="Registrar pagamento">
                      <i class="bi bi-check-lg me-1"></i>Pago
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="App.abrirCobranca(${p.emprestimo_id}, ${p.numero})" title="Lembrete">
                      <i class="bi bi-chat-dots-fill me-1"></i>Lembrete
                    </button>
                  </td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="7" class="text-center">Nada para esta semana.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  function abrirCobranca(emprestimoId, parcelaNumero) {
    const e = getEmprestimo(emprestimoId);
    if (!e) return;

    const p = (e.parcelas || []).find(p => p.numero === parcelaNumero);
    if (!p) return;

    const mensagem = getCobrancasMensagem(p, emprestimoId);
    const devedor = getDevedor(e.devedor_id);
    const numeroDevedor = normalizarTelefone(devedor && (devedor.whatsapp || devedor.telefone));

    const body = `
      <div class="mb-3">
        <strong>Devedor:</strong> ${devedor ? devedor.nome : '—'}
      </div>
      <div class="mb-3">
        <strong>Descrição:</strong> ${e.descricao || '—'}
      </div>
      <div class="mb-3">
        <strong>Parcela ${p.numero}ª:</strong> ${fmtBRL(p.amount)} — Vencimento: ${getVencimentoEmTexto(p)}
      </div>
      <h5 class="mt-4">Modelo de mensagem</h5>
      <div class="mb-2">
        <strong>WhatsApp:</strong>
        <div class="input-group mb-2">
          <input type="text" class="form-control" value="${mensagem.whats}" readonly>
          <button class="btn btn-outline" onclick="navigator.clipboard.writeText('${mensagem.whats.replace(/'/g, "\\'")}')" title="Copiar">
            <i class="bi bi-clipboard me-1"></i>Copiar
          </button>
        </div>
        <div class="small mb-2 ${numeroDevedor ? 'text-muted' : 'text-warning'}">
          ${numeroDevedor
            ? `Abrir no seu WhatsApp, na conversa de +${numeroDevedor}`
            : 'Devedor sem WhatsApp/telefone cadastrado: o WhatsApp vai pedir para você escolher o contato.'}
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-primary" onclick="App.abrirWhatsAppCobranca(${emprestimoId}, ${parcelaNumero})">
            <i class="bi bi-whatsapp me-1"></i>Abrir WhatsApp
          </button>
          <button class="btn btn-outline" onclick="App.enviarCobrancaTelegram(${emprestimoId}, ${parcelaNumero})">
            <i class="bi bi-telegram me-1"></i>Enviar pro meu Telegram
          </button>
        </div>
      </div>
      <div>
        <strong>Email:</strong>
        <div class="input-group mb-2">
          <input type="text" class="form-control" value="${mensagem.email.subject}" readonly>
          <button class="btn btn-outline" onclick="navigator.clipboard.writeText('${mensagem.email.subject.replace(/'/g, "\\'")}')" title="Copiar">
            <i class="bi bi-clipboard me-1"></i>Copiar
          </button>
        </div>
        <div class="input-group">
          <textarea class="form-control" rows="3" readonly>${mensagem.email.body}</textarea>
          <button class="btn btn-outline" onclick="navigator.clipboard.writeText('${mensagem.email.body.replace(/'/g, "\\'")}')" title="Copiar">
            <i class="bi bi-clipboard me-1"></i>Copiar
          </button>
        </div>
        <button class="btn btn-primary mt-2" onclick="App.abrirEmail('${mensagem.email.subject.replace(/'/g, "\\'")}', '${mensagem.email.body.replace(/'/g, "\\'")}', '${devedor ? devedor.email : ''}')">
          <i class="bi bi-envelope me-1"></i>Abrir Email
        </button>
      </div>
    `;
    showModal(`Cobrança: ${e.descricao || '—'}`, body, [
      { label: 'Registrar como pago', class: 'btn-success', onclick: `App.registrarPagamento(${emprestimoId}, ${parcelaNumero})` },
      { label: 'Fechar', class: 'btn-outline', onclick: 'App.closeModal()' }
    ]);
  }

  // Deixa o número no formato que o wa.me espera: só dígitos, com DDI.
  // "(11) 98765-4321" -> "5511987654321"; "+55 11 98765-4321" -> "5511987654321".
  function normalizarTelefone(numero) {
    if (!numero) return '';
    let digitos = String(numero).replace(/\D/g, '');
    digitos = digitos.replace(/^0+/, '');
    if (!digitos) return '';
    // 10 ou 11 dígitos = DDD + número, sem DDI: assume Brasil.
    if (digitos.length === 10 || digitos.length === 11) digitos = '55' + digitos;
    return digitos.length >= 12 ? digitos : '';
  }

  // Monta a cobrança de novo (em vez de passar o texto pelo HTML) e abre o WhatsApp.
  function abrirWhatsAppCobranca(emprestimoId, parcelaNumero) {
    const e = getEmprestimo(emprestimoId);
    if (!e) return;
    const p = (e.parcelas || []).find(p => p.numero === parcelaNumero);
    if (!p) return;

    const devedor = getDevedor(e.devedor_id);
    const numero = normalizarTelefone(devedor && (devedor.whatsapp || devedor.telefone));
    abrirWhatsApp(getCobrancasMensagem(p, emprestimoId).whats, numero);
  }

  // Abre o WhatsApp (o seu, logado neste navegador) na conversa do devedor
  // com a mensagem já escrita. Sem número, abre o seletor de contato do WhatsApp.
  function abrirWhatsApp(mensagem, numero) {
    const texto = encodeURIComponent(mensagem);
    const tel = normalizarTelefone(numero);
    const url = tel ? `https://wa.me/${tel}?text=${texto}` : `https://wa.me/?text=${texto}`;
    window.open(url, '_blank');
  }

  function abrirEmail(subject, body, to) {
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    const url = to ? `mailto:${to}?subject=${encodedSubject}&body=${encodedBody}` : `mailto:?subject=${encodedSubject}&body=${encodedBody}`;
    window.location.href = url;
  }

  // ============================================================
  // Telegram — o bot manda o lembrete pra você, que encaminha
  // ============================================================

  // Token e chat id ficam em chave própria (fora do db) para nunca
  // irem parar no backup exportado.
  const TELEGRAM_KEY = 'emprestimos_telegram';

  function getTelegramConfig() {
    try {
      return JSON.parse(localStorage.getItem(TELEGRAM_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveTelegramConfig(cfg) {
    localStorage.setItem(TELEGRAM_KEY, JSON.stringify(cfg));
  }

  function telegramApi(token, method, params) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetch(`https://api.telegram.org/bot${token}/${method}${query}`)
      .then(res => res.json())
      .then(data => {
        if (!data.ok) throw new Error(data.description || 'Falha na API do Telegram.');
        return data.result;
      });
  }

  function salvarTelegram() {
    const tokenEl = document.getElementById('tgToken');
    const chatEl = document.getElementById('tgChat');
    const token = tokenEl ? tokenEl.value.trim() : '';
    const chatId = chatEl ? chatEl.value.trim() : '';
    saveTelegramConfig({ token, chatId });
    toast(token && chatId ? 'Telegram configurado.' : 'Configuração salva (incompleta).', token && chatId ? 'success' : 'warning');
  }

  async function detectarChatId() {
    const tokenEl = document.getElementById('tgToken');
    const token = (tokenEl ? tokenEl.value : getTelegramConfig().token || '').trim();
    if (!token) {
      toast('Informe o token do bot primeiro.', 'danger');
      return;
    }
    try {
      const updates = await telegramApi(token, 'getUpdates');
      const comMensagem = (updates || []).filter(u => u.message && u.message.chat);
      const ultima = comMensagem[comMensagem.length - 1];
      if (!ultima) {
        toast('Nada encontrado. Abra o bot no Telegram e envie /start.', 'danger');
        return;
      }
      const chatId = String(ultima.message.chat.id);
      const chatEl = document.getElementById('tgChat');
      if (chatEl) chatEl.value = chatId;
      saveTelegramConfig({ token, chatId });
      toast(`Chat ID detectado: ${chatId}`, 'success');
    } catch (err) {
      toast('Erro no Telegram: ' + err.message, 'danger');
    }
  }

  // Diagnóstico: mostra, na tela, o que o Telegram está respondendo.
  // Serve para separar "token errado" de "mensagem não chegou no bot".
  async function diagnosticoTelegram() {
    const tokenEl = document.getElementById('tgToken');
    const token = (tokenEl ? tokenEl.value : getTelegramConfig().token || '').trim();
    const box = document.getElementById('tgDiag');
    const linhas = [];
    const escrever = () => {
      if (box) {
        box.classList.remove('d-none');
        box.textContent = linhas.join('\n');
      }
    };

    if (!token) {
      linhas.push('❌ Informe o token do bot no campo acima (ou clique em Salvar antes).');
      escrever();
      return;
    }

    linhas.push('Verificando...');
    escrever();
    linhas.length = 0;

    if (!/^\d+:[\w-]+$/.test(token)) {
      linhas.push('⚠️ O token não parece completo (formato esperado: 123456789:AA...). Se o Telegram responder "Unauthorized", recopie o token do @BotFather.');
    }

    const acrescentar = Date.now();

    // 1) Token válido? Qual é o bot?
    try {
      const me = await telegramApi(token, 'getMe', { _: acrescentar });
      linhas.push(`✅ Token válido. Bot: @${me.username} (${me.first_name})`);
    } catch (err) {
      linhas.push(`❌ Token recusado pelo Telegram: ${err.message}`);
      linhas.push('   Recopie o token do @BotFather (/mybots → API Token).');
      escrever();
      return;
    }

    // 2) Existe webhook desviando as mensagens?
    try {
      const info = await telegramApi(token, 'getWebhookInfo', { _: acrescentar });
      if (info.url) {
        linhas.push(`⚠️ Há um webhook configurado: ${info.url}`);
        linhas.push(`   As mensagens vão para esse endereço. Abra https://api.telegram.org/bot<SEU_TOKEN>/deleteWebhook para limpar.`);
      } else {
        linhas.push('✅ Sem webhook: as mensagens ficam na fila do bot.');
      }
    } catch (err) {
      linhas.push(`⚠️ Não foi possível checar o webhook: ${err.message}`);
    }

    // 3) Chegou alguma mensagem na fila?
    try {
      const updates = await telegramApi(token, 'getUpdates', { limit: 10, _: acrescentar }) || [];
      const comChat = updates.filter(u => u.message && u.message.chat);
      if (!comChat.length) {
        linhas.push('❌ Nenhuma mensagem na fila do bot.');
        linhas.push('   Abra o seu bot no Telegram (o @username mostrado acima) e mande /start.');
        linhas.push('   Confira se o bot aberto é realmente esse e não outro de nome parecido.');
      } else {
        linhas.push(`✅ ${comChat.length} mensagem(ns) na fila:`);
        const vistos = new Set();
        comChat.forEach(u => {
          const c = u.message.chat;
          if (vistos.has(c.id)) return;
          vistos.add(c.id);
          const nome = c.username ? '@' + c.username : [c.first_name, c.last_name].filter(Boolean).join(' ');
          const texto = (u.message.text || '').replace(/\s+/g, ' ').slice(0, 40);
          const descricao = texto || (u.message.sticker ? '[figurinha]' : u.message.photo ? '[foto]' : '[mensagem sem texto]');
          linhas.push(`   • chat ID ${c.id} — ${nome} — ${descricao}`);
        });
        const chatAtual = (document.getElementById('tgChat') || {}).value;
        if (chatAtual && !vistos.has(Number(chatAtual))) {
          linhas.push(`⚠️ O chat ID salvo (${chatAtual}) não é nenhum dos acima. Use "Detectar chat ID" ou corrija o campo.`);
        }
      }
    } catch (err) {
      linhas.push(`❌ Falha ao ler as mensagens: ${err.message}`);
    }

    escrever();
  }

  async function enviarTelegram(texto) {
    const cfg = getTelegramConfig();
    if (!cfg.token || !cfg.chatId) {
      throw new Error('Configure o bot do Telegram em Backup.');
    }
    await telegramApi(cfg.token, 'sendMessage', {
      chat_id: cfg.chatId,
      text: texto,
      disable_web_page_preview: 'true'
    });
  }

  async function enviarTesteTelegram() {
    try {
      await enviarTelegram('Teste do Controle de Empréstimos ✅');
      toast('Mensagem de teste enviada.', 'success');
    } catch (err) {
      toast('Falha no Telegram: ' + err.message, 'danger');
    }
  }

  async function enviarCobrancaTelegram(emprestimoId, parcelaNumero) {
    const e = getEmprestimo(emprestimoId);
    if (!e) return;
    const p = (e.parcelas || []).find(p => p.numero === parcelaNumero);
    if (!p) return;

    const mensagem = getCobrancasMensagem(p, emprestimoId);
    try {
      await enviarTelegram(mensagem.whats);
      toast('Lembrete enviado pro seu Telegram.', 'success');
    } catch (err) {
      toast('Falha no Telegram: ' + err.message, 'danger');
    }
  }

  function registrarPagamento(emprestimoId, parcelaNumero) {
    const e = getEmprestimo(emprestimoId);
    if (!e) return;

    const p = (e.parcelas || []).find(p => p.numero === parcelaNumero);
    if (!p) return;

    if (p.pago) {
      toast('Esta parcela já está paga.', 'warning');
      return;
    }

    p.pago = true;
    p.paid_date = todayStr();

    save();
    toast('Pagamento registrado!', 'success');
    navigateTo('dashboard');
  }

  // ============================================================
  // Backup
  // ============================================================

  function renderBackup() {
    const el = document.getElementById('page-backup');
    if (!el) return;

    const tg = getTelegramConfig();

    el.innerHTML = `
      <h2 class="mb-3">Backup</h2>
      <div class="table-container">
        <p class="mb-3">Baixe este arquivo para salvar uma cópia dos seus dados. Para restaurar, use o botão "Restaurar backup".</p>
        <div class="mb-3">
          <button class="btn btn-primary" onclick="App.downloadBackup()">
            <i class="bi bi-download me-1"></i>Baixar backup
          </button>
        </div>
        <div>
          <label class="btn btn-outline">
            <i class="bi bi-upload me-1"></i>Restaurar backup
            <input type="file" accept=".json" class="d-none" onchange="App.restoreBackup(event)">
          </label>
        </div>
      </div>

      <div class="table-container mt-3">
        <h4 class="mb-3"><i class="bi bi-telegram me-2"></i>Lembretes no Telegram</h4>          <p class="mb-3">
          O bot manda o lembrete de cobrança para <strong>você</strong>, e você repassa ao devedor.
          Crie um bot falando com o <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a>,
          envie <code>/start</code> para ele e clique em "Detectar chat ID".
          O token fica apenas neste navegador e não entra no backup.
        </p>
        <div class="form-group">
          <label for="tgToken">Token do bot</label>
          <input type="password" id="tgToken" class="form-control" placeholder="123456789:AA..." value="${tg.token || ''}">
        </div>
        <div class="form-group">
          <label for="tgChat">Seu chat ID</label>
          <input type="text" id="tgChat" class="form-control" placeholder="Detectado automaticamente" value="${tg.chatId || ''}">
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-primary" onclick="App.salvarTelegram()">
            <i class="bi bi-check-lg me-1"></i>Salvar
          </button>
          <button class="btn btn-outline" onclick="App.detectarChatId()">
            <i class="bi bi-search me-1"></i>Detectar chat ID
          </button>
          <button class="btn btn-outline" onclick="App.enviarTesteTelegram()">
            <i class="bi bi-send me-1"></i>Enviar teste
          </button>
          <button class="btn btn-outline" onclick="App.diagnosticoTelegram()">
            <i class="bi bi-clipboard-pulse me-1"></i>Diagnóstico
          </button>
        </div>
        <pre id="tgDiag" class="d-none mt-3" style="white-space:pre-wrap; font-size:.85rem; line-height:1.5; background:rgba(255,255,255,.04); padding:.75rem; border-radius:.5rem; margin:0;"></pre>
      </div>
    `;
  }

  function downloadBackup() {
    const data = JSON.stringify(db, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emprestimos_backup_${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Backup baixado.', 'success');
  }

  function restoreBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || typeof data !== 'object') throw new Error('Formato inválido.');
        db = data;
        if (!db._seq) db._seq = { devedores: 0, emprestimos: 0 };
        if (!db.devedores) db.devedores = [];
        if (!db.emprestimos) db.emprestimos = [];
        save();
        toast('Backup restaurado!', 'success');
        navigateTo('dashboard');
      } catch (err) {
        toast('Erro ao restaurar: arquivo inválido.', 'danger');
      }
    };
    reader.readAsText(file);

    event.target.value = '';
  }

  // ============================================================
  // UI Helpers
  // ============================================================

  function showModal(title, bodyHtml, buttons = []) {
    const modalEl = document.getElementById('appModal');
    if (!modalEl) return;

    const titleEl = document.getElementById('appModalLabel');
    const bodyEl = document.getElementById('appModalBody');
    const footerEl = document.getElementById('appModalFooter');

    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = bodyHtml;

    const btnHtml = Array.isArray(buttons)
      ? buttons.map(b => `<button type="button" class="btn ${b.class || 'btn-secondary'}" onclick="${b.onclick}">${b.label}</button>`).join(' ')
      : (buttons || '<button type="button" class="btn btn-secondary" onclick="App.closeModal()">Fechar</button>');

    if (footerEl) footerEl.innerHTML = btnHtml;

    const closeBtn = modalEl.querySelector('.btn-close');
    if (closeBtn) closeBtn.onclick = () => closeModal();

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  function closeModal() {
    const modalEl = document.getElementById('appModal');
    if (!modalEl) return;
    const instance = bootstrap.Modal.getInstance(modalEl);
    if (instance) instance.hide();
  }

  function toast(msg, type = 'success') {
    const toastEl = document.getElementById('appToast');
    if (!toastEl) return;

    const body = toastEl.querySelector('.toast-body');
    const icon = toastEl.querySelector('#toastIcon');

    if (body) body.textContent = msg;
    if (icon) {
      icon.className = `bi bi-${type === 'success' ? 'check-circle-fill' : type === 'danger' ? 'exclamation-triangle-fill' : 'info-circle-fill'} me-2`;
    }

    bootstrap.Toast.getOrCreateInstance(toastEl, { autohide: true, delay: 3000 }).show();
  }

  return {
    init,
    navigateTo,
    renderDevedores,
    renderEmprestimos,
    renderCobrancas,
    renderBackup,
    abrirDevedor,
    visualizarDevedor,
    editarDevedor,
    salvarDevedor,
    excluirDevedor,
    abrirNovoEmprestimo,
    abrirEmprestimo,
    salvarEmprestimo,
    excluirEmprestimo,
    abrirCobranca,
    abrirWhatsApp,
    abrirWhatsAppCobranca,
    normalizarTelefone,
    abrirEmail,
    salvarTelegram,
    detectarChatId,
    enviarTesteTelegram,
    diagnosticoTelegram,
    enviarCobrancaTelegram,
    registrarPagamento,
    downloadBackup,
    restoreBackup,
    showModal,
    closeModal,
    toast
  };
})();

// Exportar para o escopo global para que os onclick do HTML funcionem
if (typeof window !== 'undefined') {
  window.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
  } else {
    App.init();
  }
}
