const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const API_KEY = 'AIzaSyBx9Np7t_-loUBFX-m-bfFAvjn4dvlkk-s'; // Puedes usar variable de entorno
const PROJECT_ID = 'magiccal1';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ========== 1. LECTURAS MASIVAS ==========
async function leerDocumento(coleccion, docId) {
  const url = `${BASE_URL}/${coleccion}/${docId}?key=${API_KEY}`;
  try {
    const response = await axios.get(url);
    return { success: true, data: response.data };
  } catch (error) {
    const mensaje = error.response?.data?.error?.message || error.message;
    return { success: false, error: mensaje };
  }
}

// Obtener lista de IDs de una colección (para luego leerlos)
async function listarDocumentos(coleccion, limit = 50) {
  const url = `${BASE_URL}/${coleccion}?pageSize=${limit}&key=${API_KEY}`;
  try {
    const response = await axios.get(url);
    const docs = response.data.documents || [];
    const ids = docs.map(doc => doc.name.split('/').pop());
    return { success: true, ids };
  } catch (error) {
    const mensaje = error.response?.data?.error?.message || error.message;
    return { success: false, error: mensaje };
  }
}

// Función de estrés de lectura
async function pruebaLectura(coleccion, cantidad, concurrencia = 50) {
  console.log(`📖 Iniciando bombardeo de ${cantidad} lecturas en "${coleccion}"...`);
  const startTime = Date.now();

  // Primero obtener algunos IDs reales (para no leer inexistentes)
  const listResult = await listarDocumentos(coleccion, Math.min(100, cantidad));
  if (!listResult.success) {
    console.error('❌ No se pudieron obtener IDs:', listResult.error);
    return { total: cantidad, exitosas: 0, fallidas: cantidad, errores: [listResult.error] };
  }
  const idsDisponibles = listResult.ids;
  if (idsDisponibles.length === 0) {
    console.warn('⚠️ La colección está vacía. No se pueden hacer lecturas.');
    return { total: cantidad, exitosas: 0, fallidas: cantidad, errores: ['Colección vacía'] };
  }

  let exitosas = 0, fallidas = 0;
  const errores = [];

  for (let i = 0; i < cantidad; i += concurrencia) {
    const lote = [];
    const finLote = Math.min(i + concurrencia, cantidad);
    for (let j = i; j < finLote; j++) {
      // Seleccionar un ID aleatorio de los disponibles
      const idAleatorio = idsDisponibles[Math.floor(Math.random() * idsDisponibles.length)];
      lote.push(leerDocumento(coleccion, idAleatorio));
    }
    const resultados = await Promise.allSettled(lote);
    for (const res of resultados) {
      if (res.status === 'fulfilled' && res.value.success) {
        exitosas++;
      } else {
        fallidas++;
        const errorMsg = res.value?.error || res.reason?.message || 'Error desconocido';
        errores.push(errorMsg);
      }
    }
    if (i + concurrencia < cantidad) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log(`📦 Lote ${Math.floor(i / concurrencia) + 1}: exitosas ${exitosas}, fallidas ${fallidas}`);
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`✅ Lecturas exitosas: ${exitosas}, ❌ Fallidas: ${fallidas} en ${elapsed}s`);
  return { total: cantidad, exitosas, fallidas, errores: errores.slice(0, 10), tiempoSegundos: elapsed };
}

// ========== 2. PRUEBA DE AUTENTICACIÓN ==========
async function probarAutenticacion() {
  // Intentar registrar un usuario (con email aleatorio) usando la API Key
  const email = `test_${Date.now()}@example.com`;
  const password = '12345678';
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
  try {
    const response = await axios.post(url, {
      email,
      password,
      returnSecureToken: true
    });
    return { success: true, data: response.data };
  } catch (error) {
    const mensaje = error.response?.data?.error?.message || error.message;
    return { success: false, error: mensaje };
  }
}

// ========== 3. LISTAR COLECCIONES ==========
async function listarColecciones() {
  const url = `${BASE_URL}?key=${API_KEY}`;
  try {
    const response = await axios.get(url);
    return { success: true, data: response.data };
  } catch (error) {
    const mensaje = error.response?.data?.error?.message || error.message;
    return { success: false, error: mensaje };
  }
}

// ========== ENDPOINTS ==========
app.get('/stress-read/:coleccion/:cantidad', async (req, res) => {
  const { coleccion, cantidad } = req.params;
  const num = parseInt(cantidad);
  if (isNaN(num) || num < 1) return res.status(400).json({ error: 'Cantidad inválida' });
  if (num > 5000) return res.status(400).json({ error: 'Máximo 5000 lecturas por prueba' });
  try {
    const resultado = await pruebaLectura(coleccion, num);
    res.status(200).json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/auth-test', async (req, res) => {
  const resultado = await probarAutenticacion();
  res.json(resultado);
});

app.get('/list-collections', async (req, res) => {
  const resultado = await listarColecciones();
  res.json(resultado);
});

app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Servidor de pruebas de debilidad en puerto ${PORT}`);
  console.log(`📌 GET /stress-read/productos/200`);
  console.log(`📌 GET /auth-test`);
  console.log(`📌 GET /list-collections`);
});
