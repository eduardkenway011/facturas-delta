'use strict';

/* ============================================================
   1. CONFIGURACIÓN
   ============================================================ */
const API = {
  clientes: 'api/clientes.php',
  facturas: 'api/facturas.php',
};

// Formato de moneda dominicano: 786.5 -> "RD$786.50"
const dinero = new Intl.NumberFormat('es-DO', {
  style: 'currency',
  currency: 'DOP',
  minimumFractionDigits: 2,
});

// Formato de fecha: "2026-11-25" -> "25 nov de 2026"
const formatoFecha = new Intl.DateTimeFormat('es-DO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/* ============================================================
   2. ESTADO EN MEMORIA
   ============================================================ */
const estado = {
  facturas: [],
  clientes: [],
  borrar: null,   // { tipo: 'factura' | 'cliente', id, conFacturas }
  enviando: null, // factura que se está enviando
};

/* ============================================================
   3. UTILIDADES
   ============================================================ */
const $  = (selector, raiz = document) => raiz.querySelector(selector);
const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

/** Escapa texto antes de meterlo en innerHTML (evita XSS). */
function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

/** Convierte "786.50" (string de PostgreSQL) a número 786.5 */
function aNumero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** Formatea "2026-11-25" sin sustos de zona horaria. */
function formatearFecha(iso) {
  if (!iso) return '—';
  const [anio, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return formatoFecha.format(new Date(anio, mes - 1, dia));
}

/* ============================================================
   4. LLAMADAS A LA API
   ============================================================ */
async function pedir(url, opciones = {}) {
  const respuesta = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });

  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    throw new Error('El servidor no devolvió una respuesta válida');
  }

  if (!respuesta.ok || datos.ok === false) {
    const mensaje = datos.errores?.join(' · ') || datos.error || `Error ${respuesta.status}`;
    throw new Error(mensaje);
  }

  return datos;
}

/* ============================================================
   5. AVISOS FLOTANTES (toasts)
   ============================================================ */
function avisar(mensaje, tipo = 'ok') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${tipo}`;
  toast.innerHTML = `
    <span>${tipo === 'ok' ? '✅' : '⚠️'}</span>
    <span>${escapar(mensaje)}</span>
  `;

  $('#toasts').append(toast);

  setTimeout(() => {
    toast.classList.add('saliendo');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 3200);
}

/* ============================================================
   6. TEMA CLARO / OSCURO
   ============================================================ */
const CLAVE_TEMA = 'facturas-delta-tema';

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  $('#btn-tema').textContent = tema === 'oscuro' ? '☀️' : '🌙';
  localStorage.setItem(CLAVE_TEMA, tema);
}

function iniciarTema() {
  const guardado = localStorage.getItem(CLAVE_TEMA);
  aplicarTema(guardado ?? 'oscuro');

  $('#btn-tema').addEventListener('click', () => {
    const actual = document.documentElement.dataset.tema;
    aplicarTema(actual === 'oscuro' ? 'claro' : 'oscuro');
  });
}

/* ============================================================
   7. PESTAÑAS (Facturas / Clientes)
   ============================================================ */
function iniciarPestanas() {
  $$('.nav-btn').forEach((boton) => {
    boton.addEventListener('click', () => {
      $$('.nav-btn').forEach((b) => b.classList.toggle('activo', b === boton));

      const vista = `vista-${boton.dataset.vista}`;
      $$('.vista').forEach((v) => v.classList.toggle('activa', v.id === vista));
    });
  });
}

/* ============================================================
   8. MODALES (abrir, cerrar, Esc, clic fuera)
   ============================================================ */
function abrirModal(id) {
  const modal = $(`#${id}`);
  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  const primerCampo = modal.querySelector('input:not([type="hidden"]), select, button');
  primerCampo?.focus();
}

function cerrarModal(modal) {
  modal.hidden = true;

  if ($$('.modal:not([hidden])').length === 0) {
    document.body.style.overflow = '';
  }
}

function iniciarModales() {
  $$('.modal').forEach((modal) => {
    // Clic en el fondo oscuro
    modal.addEventListener('mousedown', (evento) => {
      if (evento.target === modal) cerrarModal(modal);
    });

    // Botones con data-cerrar
    $$('[data-cerrar]', modal).forEach((boton) => {
      boton.addEventListener('click', () => cerrarModal(modal));
    });
  });

  // Tecla Escape
  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    const abierto = $('.modal:not([hidden])');
    if (abierto) cerrarModal(abierto);
  });
}

/* ============================================================
   9. CARGA DE DATOS DESDE LA API
   ============================================================ */
async function cargarClientes() {
  const { datos } = await pedir(API.clientes);
  estado.clientes = datos;
  pintarClientes();
  pintarOpcionesClientes();
}

async function cargarFacturas() {
  const { datos } = await pedir(API.facturas);
  estado.facturas = datos;
  pintarFacturas();
}

async function cargarTodo() {
  try {
    await Promise.all([cargarClientes(), cargarFacturas()]);
    pintarEstadisticas();
  } catch (error) {
    avisar(error.message, 'error');
  }
}

/* ============================================================
   10. TARJETAS DE RESUMEN
   ============================================================ */
/** Anima un número desde su valor anterior hasta el nuevo. */
function animarNumero(elemento, valorFinal, formateador) {
  const inicio = Number(elemento.dataset.valor ?? 0);
  const duracion = 650;
  const t0 = performance.now();

  elemento.dataset.valor = String(valorFinal);

  function paso(ahora) {
    const avance = Math.min((ahora - t0) / duracion, 1);
    const suave = 1 - Math.pow(1 - avance, 3); // ease-out

    elemento.textContent = formateador.format(inicio + (valorFinal - inicio) * suave);

    if (avance < 1) {
      requestAnimationFrame(paso);
    } else {
      elemento.textContent = formateador.format(valorFinal);
    }
  }

  requestAnimationFrame(paso);
}

function pintarEstadisticas() {
  $('#stat-clientes').textContent = String(estado.clientes.length);
  $('#stat-facturas').textContent = String(estado.facturas.length);

  // Facturado: se excluyen las anuladas
  const total = estado.facturas
    .filter((f) => f.estado !== 'anulada')
    .reduce((suma, f) => suma + aNumero(f.total), 0);

  // Pendiente de cobro
  const pendiente = estado.facturas
    .filter((f) => f.estado === 'pendiente')
    .reduce((suma, f) => suma + aNumero(f.total), 0);

  animarNumero($('#stat-total'), total, dinero);
  animarNumero($('#stat-pendiente'), pendiente, dinero);
}

/* ============================================================
   11. FILTROS (búsqueda instantánea)
   ============================================================ */
function facturasFiltradas() {
  const texto = $('#buscar-facturas').value.trim().toLowerCase();
  const filtro = $('#filtro-estado').value;

  return estado.facturas.filter((f) => {
    const coincideTexto = !texto
      || [f.numero, f.concepto, f.cliente_nombre]
           .some((campo) => String(campo ?? '').toLowerCase().includes(texto));

    const coincideEstado = !filtro || f.estado === filtro;

    return coincideTexto && coincideEstado;
  });
}

function clientesFiltrados() {
  const texto = $('#buscar-clientes').value.trim().toLowerCase();

  return estado.clientes.filter((c) => !texto
    || [c.nombre, c.email, c.telefono, c.direccion]
         .some((campo) => String(campo ?? '').toLowerCase().includes(texto)));
}

function iniciarFiltros() {
  $('#buscar-facturas').addEventListener('input', pintarFacturas);
  $('#filtro-estado').addEventListener('change', pintarFacturas);
  $('#buscar-clientes').addEventListener('input', pintarClientes);
}

/* ============================================================
   12. PINTAR LA TABLA DE FACTURAS
   ============================================================ */
function pintarFacturas() {
  const cuerpo = $('#cuerpo-facturas');
  const vacio = $('#vacio-facturas');
  const lista = facturasFiltradas();

  if (lista.length === 0) {
    cuerpo.innerHTML = '';
    vacio.hidden = false;
    return;
  }

  vacio.hidden = true;

  cuerpo.innerHTML = lista.map((f, indice) => `
    <tr style="animation-delay: ${Math.min(indice * 35, 350)}ms">
      <td data-label="Número"><strong>${escapar(f.numero)}</strong></td>
      <td data-label="Cliente">${escapar(f.cliente_nombre)}</td>
      <td data-label="Fecha">${formatearFecha(f.fecha)}</td>
      <td data-label="Concepto">${escapar(f.concepto)}</td>
      <td class="der" data-label="Subtotal">${dinero.format(aNumero(f.subtotal))}</td>
      <td class="der" data-label="IVA">${aNumero(f.iva)} %</td>
      <td class="der" data-label="Total"><strong>${dinero.format(aNumero(f.total))}</strong></td>
      <td data-label="Estado">
        <span class="badge badge--${escapar(f.estado)}">${escapar(f.estado)}</span>
      </td>
      <td data-label="Acciones">
        <div class="acciones">
          <button class="btn-accion btn-accion--editar" data-editar-factura="${f.id}"
                  title="Editar" aria-label="Editar factura ${escapar(f.numero)}">✏️</button>
          <button class="btn-accion" data-enviar-factura="${f.id}"
                  title="Enviar por correo" aria-label="Enviar factura ${escapar(f.numero)}">✉️</button>
          <button class="btn-accion" data-imprimir-factura="${f.id}"
                  title="Imprimir" aria-label="Imprimir factura ${escapar(f.numero)}">🖨️</button>
          <button class="btn-accion btn-accion--borrar" data-borrar-factura="${f.id}"
                  title="Borrar" aria-label="Borrar factura ${escapar(f.numero)}">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

/* ============================================================
   13. PINTAR LA TABLA DE CLIENTES
   ============================================================ */
function pintarClientes() {
  const cuerpo = $('#cuerpo-clientes');
  const vacio = $('#vacio-clientes');
  const lista = clientesFiltrados();

  if (lista.length === 0) {
    cuerpo.innerHTML = '';
    vacio.hidden = false;
    return;
  }

  vacio.hidden = true;

  cuerpo.innerHTML = lista.map((c, indice) => {
    const email = c.email
      ? `<a href="mailto:${escapar(c.email)}">${escapar(c.email)}</a>`
      : '—';
    const telefono = c.telefono ? escapar(c.telefono) : '—';
    const direccion = c.direccion ? escapar(c.direccion) : '—';

    return `
      <tr style="animation-delay: ${Math.min(indice * 35, 350)}ms">
        <td data-label="Nombre"><strong>${escapar(c.nombre)}</strong></td>
        <td data-label="Email">${email}</td>
        <td data-label="Teléfono">${telefono}</td>
        <td data-label="Dirección">${direccion}</td>
        <td data-label="Acciones">
          <div class="acciones">
            <button class="btn-accion btn-accion--editar" data-editar-cliente="${c.id}"
                    title="Editar" aria-label="Editar cliente ${escapar(c.nombre)}">✏️</button>
            <button class="btn-accion" data-imprimir-cliente="${c.id}"
                    title="Imprimir ficha" aria-label="Imprimir ficha de ${escapar(c.nombre)}">🖨️</button>
            <button class="btn-accion btn-accion--borrar" data-borrar-cliente="${c.id}"
                    title="Borrar" aria-label="Borrar cliente ${escapar(c.nombre)}">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/* ============================================================
   14. OPCIONES DEL SELECT DE CLIENTES
   ============================================================ */
function pintarOpcionesClientes() {
  const select = $('#factura-cliente');
  const actual = select.value;

  select.innerHTML = '<option value="">— Selecciona un cliente —</option>'
    + estado.clientes
        .map((c) => `<option value="${c.id}">${escapar(c.nombre)}</option>`)
        .join('');

  if (actual) select.value = actual;
}

/* ============================================================
   15. FORMULARIO DE FACTURA
   ============================================================ */
function hoyISO() {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

function abrirFormularioFactura(factura = null) {
  if (!factura && estado.clientes.length === 0) {
    avisar('Primero crea al menos un cliente', 'error');
    return;
  }

  const formulario = $('#form-factura');
  formulario.reset();

  $('#error-factura').hidden = true;
  $('#factura-id').value = '';
  $('#factura-iva').value = '21';
  $('#factura-fecha').value = hoyISO();
  formulario.querySelector('button[type="submit"]').textContent =
    factura ? 'Guardar cambios' : 'Guardar factura';

  if (factura) {
    $('#titulo-modal-factura').textContent = `Editar ${factura.numero}`;
    $('#factura-id').value = factura.id;
    $('#factura-numero').value = factura.numero;
    $('#factura-cliente').value = String(factura.cliente_id);
    $('#factura-fecha').value = factura.fecha.slice(0, 10);
    $('#factura-concepto').value = factura.concepto;
    $('#factura-subtotal').value = aNumero(factura.subtotal);
    $('#factura-iva').value = aNumero(factura.iva);
    $('#factura-estado').value = factura.estado;
  } else {
    $('#titulo-modal-factura').textContent = 'Nueva factura';
  }

  actualizarTotalPreview();
  abrirModal('modal-factura');
}

/** Vista previa del total mientras se escribe. */
function actualizarTotalPreview() {
  const subtotal = aNumero($('#factura-subtotal').value);
  const iva = aNumero($('#factura-iva').value);
  const total = subtotal * (1 + iva / 100);
  $('#factura-total-preview').textContent = dinero.format(total);
}

function marcarInvalido(campo, mal) {
  campo.classList.toggle('invalido', mal);
}

function mostrarError(selector, mensajes) {
  const caja = $(selector);
  caja.hidden = false;
  caja.innerHTML = mensajes.map((m) => `<div>${escapar(m)}</div>`).join('');
}

/** Validación en el navegador (la del servidor sigue siendo la definitiva). */
function validarFormularioFactura() {
  const cliente = $('#factura-cliente').value;
  const concepto = $('#factura-concepto').value.trim();
  const subtotal = $('#factura-subtotal').value;
  const iva = $('#factura-iva').value;

  const errores = [];

  if (!cliente) {
    errores.push('Selecciona un cliente');
    marcarInvalido($('#factura-cliente'), true);
  }

  if (concepto === '') {
    errores.push('El concepto es obligatorio');
    marcarInvalido($('#factura-concepto'), true);
  }

  if (subtotal === '' || aNumero(subtotal) < 0) {
    errores.push('El subtotal debe ser 0 o más');
    marcarInvalido($('#factura-subtotal'), true);
  }

  if (iva === '' || aNumero(iva) < 0 || aNumero(iva) > 100) {
    errores.push('El IVA debe estar entre 0 y 100');
    marcarInvalido($('#factura-iva'), true);
  }

  return errores;
}

async function guardarFactura(evento) {
  evento.preventDefault();

  const errores = validarFormularioFactura();
  if (errores.length > 0) {
    mostrarError('#error-factura', errores);
    return;
  }

  const id = $('#factura-id').value;
  const cuerpo = {
    numero:     $('#factura-numero').value.trim(),
    cliente_id: Number($('#factura-cliente').value),
    fecha:      $('#factura-fecha').value,
    concepto:   $('#factura-concepto').value.trim(),
    subtotal:   aNumero($('#factura-subtotal').value),
    iva:        aNumero($('#factura-iva').value),
    estado:     $('#factura-estado').value,
  };

  if (id) cuerpo.id = Number(id);

  const boton = $('#form-factura button[type="submit"]');
  boton.disabled = true;

  try {
    await pedir(API.facturas, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(cuerpo),
    });

    cerrarModal($('#modal-factura'));
    avisar(id ? 'Factura actualizada' : 'Factura creada');
    await cargarTodo();
  } catch (error) {
    mostrarError('#error-factura', [error.message]);
  } finally {
    boton.disabled = false;
  }
}

/* ============================================================
   16. FORMULARIO DE CLIENTE
   ============================================================ */
function abrirFormularioCliente(cliente = null) {
  const formulario = $('#form-cliente');
  formulario.reset();

  $('#error-cliente').hidden = true;
  $('#cliente-id').value = '';
  formulario.querySelector('button[type="submit"]').textContent =
    cliente ? 'Guardar cambios' : 'Guardar cliente';

  if (cliente) {
    $('#titulo-modal-cliente').textContent = 'Editar cliente';
    $('#cliente-id').value = cliente.id;
    $('#cliente-nombre').value = cliente.nombre;
    $('#cliente-email').value = cliente.email ?? '';
    $('#cliente-telefono').value = cliente.telefono ?? '';
    $('#cliente-direccion').value = cliente.direccion ?? '';
  } else {
    $('#titulo-modal-cliente').textContent = 'Nuevo cliente';
  }

  abrirModal('modal-cliente');
}

function validarFormularioCliente() {
  const nombre = $('#cliente-nombre').value.trim();
  const email = $('#cliente-email').value.trim();

  const errores = [];

  if (nombre === '') {
    errores.push('El nombre es obligatorio');
    marcarInvalido($('#cliente-nombre'), true);
  }

  if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errores.push('El email no es válido');
    marcarInvalido($('#cliente-email'), true);
  }

  return errores;
}

async function guardarCliente(evento) {
  evento.preventDefault();

  const errores = validarFormularioCliente();
  if (errores.length > 0) {
    mostrarError('#error-cliente', errores);
    return;
  }

  const id = $('#cliente-id').value;
  const cuerpo = {
    nombre:    $('#cliente-nombre').value.trim(),
    email:     $('#cliente-email').value.trim(),
    telefono:  $('#cliente-telefono').value.trim(),
    direccion: $('#cliente-direccion').value.trim(),
  };

  if (id) cuerpo.id = Number(id);

  const boton = $('#form-cliente button[type="submit"]');
  boton.disabled = true;

  try {
    await pedir(API.clientes, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(cuerpo),
    });

    cerrarModal($('#modal-cliente'));
    avisar(id ? 'Cliente actualizado' : 'Cliente creado');
    await cargarTodo();
  } catch (error) {
    mostrarError('#error-cliente', [error.message]);
  } finally {
    boton.disabled = false;
  }
}

/* ============================================================
   17. BORRAR CON CONFIRMACIÓN
   ============================================================ */
function pedirConfirmacion(tipo, id, texto, conFacturas = false) {
  estado.borrar = { tipo, id, conFacturas };
  $('#confirmar-texto').textContent = texto;
  abrirModal('modal-confirmar');
}

async function confirmarBorrado() {
  if (!estado.borrar) return;

  const { tipo, id, conFacturas } = estado.borrar;
  estado.borrar = null;

  const url = tipo === 'factura'
    ? `${API.facturas}?id=${id}`
    : `${API.clientes}?id=${id}${conFacturas ? '&facturas=1' : ''}`;

  const boton = $('#btn-confirmar-si');
  boton.disabled = true;

  try {
    await pedir(url, { method: 'DELETE' });
    cerrarModal($('#modal-confirmar'));

    if (tipo === 'factura') {
      avisar('Factura eliminada');
    } else {
      avisar(conFacturas ? 'Cliente y facturas eliminados' : 'Cliente eliminado');
    }

    await cargarTodo();
  } catch (error) {
    cerrarModal($('#modal-confirmar'));
    avisar(error.message, 'error');
  } finally {
    boton.disabled = false;
  }
}

/* ============================================================
   18. IMPRESIÓN
   ============================================================ */
/** Inyecta el documento en la zona de impresión y abre el diálogo. */
function imprimirDocumento(html) {
  const zona = $('#zona-impresion');
  zona.innerHTML = html;

  window.addEventListener(
    'afterprint',
    () => { zona.innerHTML = ''; },
    { once: true },
  );

  window.print();
}

function imprimirFactura(id) {
  const factura = estado.facturas.find((f) => f.id === Number(id));
  if (!factura) return;

  const cliente = estado.clientes.find((c) => c.id === Number(factura.cliente_id)) ?? {};
  const subtotal = aNumero(factura.subtotal);
  const total = aNumero(factura.total);
  const impuesto = total - subtotal;

  imprimirDocumento(`
    <article class="doc">
      <header class="doc-cabecera">
        <div>
          <p class="doc-marca">FACTURAS <strong>DELTA</strong></p>
          <p class="doc-sub">Sistema de facturación</p>
        </div>
        <div class="doc-numero">
          <p>FACTURA</p>
          <h1>${escapar(factura.numero)}</h1>
        </div>
      </header>

      <section class="doc-fila">
        <div class="doc-bloque">
          <h2>Cliente</h2>
          <p><strong>${escapar(factura.cliente_nombre)}</strong></p>
          <p>${cliente.email ? escapar(cliente.email) : '—'}</p>
          <p>${cliente.direccion ? escapar(cliente.direccion) : '—'}</p>
          <p>${cliente.telefono ? escapar(cliente.telefono) : ''}</p>
        </div>

        <div class="doc-bloque doc-bloque--meta">
          <h2>Datos</h2>
          <p><span>Fecha:</span> ${formatearFecha(factura.fecha)}</p>
          <p><span>Estado:</span> ${escapar(factura.estado)}</p>
          <p><span>Cliente n.º:</span> ${escapar(factura.cliente_id)}</p>
        </div>
      </section>

      <table class="doc-tabla">
        <thead>
          <tr>
            <th>Concepto</th>
            <th class="der">Subtotal</th>
            <th class="der">Impuesto</th>
            <th class="der">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapar(factura.concepto)}</td>
            <td class="der">${dinero.format(subtotal)}</td>
            <td class="der">${aNumero(factura.iva)} %</td>
            <td class="der">${dinero.format(total)}</td>
          </tr>
        </tbody>
      </table>

      <div class="doc-totales">
        <p><span>Subtotal</span><strong>${dinero.format(subtotal)}</strong></p>
        <p><span>Impuesto (${aNumero(factura.iva)} %)</span><strong>${dinero.format(impuesto)}</strong></p>
        <p class="doc-total-final"><span>Total</span><strong>${dinero.format(total)}</strong></p>
      </div>

      <footer class="doc-pie">
        <p>Gracias por su preferencia.</p>
        <p>Documento generado el ${formatearFecha(hoyISO())} · Facturas DELTA</p>
      </footer>
    </article>
  `);
}

function imprimirCliente(id) {
  const cliente = estado.clientes.find((c) => c.id === Number(id));
  if (!cliente) return;

  const facturas = estado.facturas.filter((f) => Number(f.cliente_id) === cliente.id);

  const total = facturas.reduce((suma, f) => suma + aNumero(f.total), 0);

  const filas = facturas.length > 0
    ? facturas.map((f) => `
        <tr>
          <td>${escapar(f.numero)}</td>
          <td>${formatearFecha(f.fecha)}</td>
          <td>${escapar(f.concepto)}</td>
          <td>${escapar(f.estado)}</td>
          <td class="der">${dinero.format(aNumero(f.total))}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="5">Sin facturas registradas</td></tr>';

  imprimirDocumento(`
    <article class="doc">
      <header class="doc-cabecera">
        <div>
          <p class="doc-marca">FACTURAS <strong>DELTA</strong></p>
          <p class="doc-sub">Ficha de cliente</p>
        </div>
        <div class="doc-numero">
          <p>CLIENTE</p>
          <h1>#${escapar(cliente.id)}</h1>
        </div>
      </header>

      <section class="doc-bloque">
        <h2>Datos del cliente</h2>
        <p><strong>${escapar(cliente.nombre)}</strong></p>
        <p>${cliente.email ? escapar(cliente.email) : '—'}</p>
        <p>${cliente.direccion ? escapar(cliente.direccion) : '—'}</p>
        <p>${cliente.telefono ? escapar(cliente.telefono) : ''}</p>
      </section>

      <table class="doc-tabla" style="margin-top: 22px;">
        <thead>
          <tr>
            <th>Número</th>
            <th>Fecha</th>
            <th>Concepto</th>
            <th>Estado</th>
            <th class="der">Total</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>

      <div class="doc-totales">
        <p class="doc-total-final"><span>Total facturado</span><strong>${dinero.format(total)}</strong></p>
      </div>

      <footer class="doc-pie">
        <p>Documento generado el ${formatearFecha(hoyISO())} · Facturas DELTA</p>
      </footer>
    </article>
  `);
}

/* ============================================================
   19. ENVÍO DE LA FACTURA POR CORREO
   ============================================================ */
function resumenFactura(factura, cliente) {
  const subtotal = aNumero(factura.subtotal);
  const total = aNumero(factura.total);

  return [
    `Factura: ${factura.numero}`,
    `Fecha: ${formatearFecha(factura.fecha)}`,
    `Cliente: ${factura.cliente_nombre}`,
    cliente.email ? `Email: ${cliente.email}` : null,
    cliente.direccion ? `Dirección: ${cliente.direccion}` : null,
    '',
    `Concepto: ${factura.concepto}`,
    `Subtotal: ${dinero.format(subtotal)}`,
    `Impuesto (${aNumero(factura.iva)} %): ${dinero.format(total - subtotal)}`,
    `TOTAL: ${dinero.format(total)}`,
    `Estado: ${factura.estado}`,
  ].filter((linea) => linea !== null).join('\n');
}

function abrirEnvio(id) {
  const factura = estado.facturas.find((f) => f.id === Number(id));
  if (!factura) return;

  const cliente = estado.clientes.find((c) => c.id === Number(factura.cliente_id)) ?? {};

  estado.enviando = factura;

  $('#error-envio').hidden = true;
  $('#envio-para').classList.remove('invalido');
  $('#envio-para').value = cliente.email ?? '';
  $('#envio-asunto').value = `Factura ${factura.numero} · Facturas DELTA`;
  $('#envio-mensaje').value =
    `Hola ${cliente.nombre ?? ''}:\n\n`
    + `Le enviamos los datos de la factura ${factura.numero} `
    + `por un total de ${dinero.format(aNumero(factura.total))}.\n\n`
    + 'Gracias por su preferencia.';
  $('#envio-resumen').textContent = resumenFactura(factura, cliente);

  abrirModal('modal-envio');

  if (!cliente.email) {
    avisar('Este cliente no tiene email registrado', 'error');
  }
}

function enviarFactura(evento) {
  evento.preventDefault();

  const factura = estado.enviando;
  if (!factura) return;

  const para = $('#envio-para').value.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) {
    mostrarError('#error-envio', ['Escribe un email válido']);
    $('#envio-para').classList.add('invalido');
    return;
  }

  const cliente = estado.clientes.find((c) => c.id === Number(factura.cliente_id)) ?? {};
  const asunto = $('#envio-asunto').value.trim() || `Factura ${factura.numero}`;
  const cuerpo = `${$('#envio-mensaje').value}\n\n${resumenFactura(factura, cliente)}`;

  const enlace = `mailto:${encodeURIComponent(para)}`
    + `?subject=${encodeURIComponent(asunto)}`
    + `&body=${encodeURIComponent(cuerpo)}`;

  window.location.href = enlace;

  cerrarModal($('#modal-envio'));
  avisar('Abriendo tu gestor de correo con la factura lista');
}

async function copiarResumen() {
  const factura = estado.enviando;
  if (!factura) return;

  const cliente = estado.clientes.find((c) => c.id === Number(factura.cliente_id)) ?? {};
  const texto = `${$('#envio-asunto').value}\n\n`
    + `${$('#envio-mensaje').value}\n\n`
    + resumenFactura(factura, cliente);

  try {
    await navigator.clipboard.writeText(texto);
    avisar('Resumen copiado al portapapeles');
  } catch {
    avisar('No se pudo copiar; selecciona el texto a mano', 'error');
  }
}

/* ============================================================
   20. CONECTAR TODO (delegación de eventos)
   ============================================================ */
function iniciarFormularios() {
  $('#form-factura').addEventListener('submit', guardarFactura);
  $('#form-cliente').addEventListener('submit', guardarCliente);

  // Total en vivo
  $('#factura-subtotal').addEventListener('input', actualizarTotalPreview);
  $('#factura-iva').addEventListener('input', actualizarTotalPreview);

  // Envío por correo
  $('#form-envio').addEventListener('submit', enviarFactura);
  $('#btn-copiar-resumen').addEventListener('click', copiarResumen);

  // Botones de alta
  $('#btn-nueva-factura').addEventListener('click', () => abrirFormularioFactura());
  $('#btn-nuevo-cliente').addEventListener('click', () => abrirFormularioCliente());

  // Confirmación de borrado
  $('#btn-confirmar-si').addEventListener('click', confirmarBorrado);

  // Al escribir, quitar el aviso rojo del campo
  $$('#form-factura input, #form-factura select, #form-cliente input, #form-envio input').forEach((campo) => {
    campo.addEventListener('input', () => campo.classList.remove('invalido'));
  });

  // Delegación: UN listener sirve para todas las filas presentes y futuras
  document.addEventListener('click', (evento) => {
    const fEditar = evento.target.closest('[data-editar-factura]');
    const fBorrar = evento.target.closest('[data-borrar-factura]');
    const fImprimir = evento.target.closest('[data-imprimir-factura]');
    const fEnviar = evento.target.closest('[data-enviar-factura]');
    const cEditar = evento.target.closest('[data-editar-cliente]');
    const cBorrar = evento.target.closest('[data-borrar-cliente]');
    const cImprimir = evento.target.closest('[data-imprimir-cliente]');

    if (fEnviar) {
      abrirEnvio(fEnviar.dataset.enviarFactura);
    }

    if (fImprimir) {
      imprimirFactura(fImprimir.dataset.imprimirFactura);
    }

    if (cImprimir) {
      imprimirCliente(cImprimir.dataset.imprimirCliente);
    }

    if (fEditar) {
      const factura = estado.facturas.find((f) => f.id === Number(fEditar.dataset.editarFactura));
      if (factura) abrirFormularioFactura(factura);
    }

    if (fBorrar) {
      const factura = estado.facturas.find((f) => f.id === Number(fBorrar.dataset.borrarFactura));
      if (factura) {
        pedirConfirmacion(
          'factura',
          factura.id,
          `¿Borrar la factura ${factura.numero} de ${factura.cliente_nombre}? Esta acción no se puede deshacer.`,
        );
      }
    }

    if (cEditar) {
      const cliente = estado.clientes.find((c) => c.id === Number(cEditar.dataset.editarCliente));
      if (cliente) abrirFormularioCliente(cliente);
    }

    if (cBorrar) {
      const cliente = estado.clientes.find((c) => c.id === Number(cBorrar.dataset.borrarCliente));

      if (cliente) {
        const n = estado.facturas
          .filter((f) => Number(f.cliente_id) === cliente.id)
          .length;

        const texto = n > 0
          ? `¿Borrar a ${cliente.nombre} y sus ${n} factura(s)? También se eliminarán sus facturas. Esta acción no se puede deshacer.`
          : `¿Borrar al cliente ${cliente.nombre}? Esta acción no se puede deshacer.`;

        pedirConfirmacion('cliente', cliente.id, texto, n > 0);
      }
    }
  });
}

/* ============================================================
   21. ARRANQUE
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  iniciarTema();
  iniciarPestanas();
  iniciarModales();
  iniciarFiltros();
  iniciarFormularios();
  cargarTodo();
});
