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

// ========== LOGIN DIRIGIDO A UNA CUENTA ESPECÍFICA (por si hay límite por cuenta) ==========
async function intentarLoginTarget(email, password, index, resultados) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  try {
    await axios.post(url, { email, password, returnSecureToken: false });
    resultados.exitosas++;
  } catch (error) {
    resultados.fallidas++;
    resultados.errores.push(error.response?.data?.error?.message || error.message);
  }
}
app.get('/stress-login-target/:cantidad/:email', async (req, res) => {
  const cantidad = parseInt(req.params.cantidad);
  const email = req.params.email;
  if (isNaN(cantidad) || cantidad < 1) return res.status(400).json({ error: 'Cantidad positiva' });
  if (cantidad > 5000) return res.status(400).json({ error: 'Máximo 5000' });
  if (!email) return res.status(400).json({ error: 'Email requerido' });

  const resultados = { exitosas: 0, fallidas: 0, errores: [] };
  const start = Date.now();
  const concurrencia = 10; // más lento para simular fuerza bruta realista
  const password = 'probando123';
  for (let i = 0; i < cantidad; i += concurrencia) {
    const lote = [];
    const fin = Math.min(i + concurrencia, cantidad);
    for (let j = i; j < fin; j++) lote.push(intentarLoginTarget(email, password, j, resultados));
    await Promise.allSettled(lote);
    if (i + concurrencia < cantidad) await new Promise(r => setTimeout(r, 100));
  }

  const elapsed = (Date.now() - start) / 1000;
  res.json({
    email,
    total: cantidad,
    exitosas: resultados.exitosas,
    fallidas: resultados.fallidas,
    errores: resultados.errores.slice(0, 10),
    tiempoSegundos: elapsed
  });
});

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 Stress server corriendo en puerto ${PORT}`));
