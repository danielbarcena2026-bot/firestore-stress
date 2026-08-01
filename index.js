const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// Credenciales (API Key para registro y Firestore)
const API_KEY = 'AIzaSyBx9Np7t_-loUBFX-m-bfFAvjn4dvlkk-s';
const PROJECT_ID = 'magiccal1';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ========== REGISTRAR USUARIO ==========
async function registrarUsuario() {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
  const email = `test_${Date.now()}@example.com`;
  const password = 'test123456';

  try {
    const response = await axios.post(url, {
      email,
      password,
      returnSecureToken: true
    });
    return {
      success: true,
      idToken: response.data.idToken,
      localId: response.data.localId,
      email: response.data.email
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

// ========== CREAR VENTA CON AUTENTICACIÓN ==========
async function crearVentaConAuth(index, idToken) {
  const ahora = new Date().toISOString();
  const venta = {
    fields: {
      userId: { stringValue: `test_user_${Math.floor(Math.random() * 100)}` },
      fecha: { timestampValue: ahora },
      totalBs: { doubleValue: Math.random() * 1000 },
      totalUsd: { doubleValue: Math.random() * 25 },
      metodosPagoVenta: {
        arrayValue: {
          values: [
            {
              mapValue: {
                fields: {
                  metodo: { stringValue: 'Efectivo' },
                  monto: { doubleValue: 100 }
                }
              }
            }
          ]
        }
      },
      productos: {
        arrayValue: {
          values: [
            {
              mapValue: {
                fields: {
                  nombre: { stringValue: 'Producto Test' },
                  cantidad: { integerValue: 1 },
                  precioUsd: { doubleValue: 1 }
                }
              }
            }
          ]
        }
      },
      nota: { stringValue: `Prueba con auth #${index} - ${ahora}` }
    }
  };

  const url = `${FIRESTORE_URL}/ventas`; // Sin ?key, usamos header

  try {
    const response = await axios.post(url, venta, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      }
    });
    return { success: true, id: response.data.name };
  } catch (error) {
    const mensaje = error.response?.data?.error?.message || error.message;
    return { success: false, error: mensaje };
  }
}

// ========== PRUEBA DE ESTRÉS CON AUTENTICACIÓN ==========
app.get('/stress-auth/:cantidad', async (req, res) => {
  const cantidad = parseInt(req.params.cantidad);
  if (isNaN(cantidad) || cantidad < 1) {
    return res.status(400).json({ error: 'Cantidad positiva' });
  }
  if (cantidad > 5000) {
    return res.status(400).json({ error: 'Máximo 5000' });
  }

  // 1. Registrar usuario para obtener token
  const registro = await registrarUsuario();
  if (!registro.success) {
    return res.status(500).json({ error: 'Fallo al registrar usuario', detalle: registro.error });
  }
  const { idToken } = registro;

  // 2. Ejecutar bombardeo con ese token
  console.log(`🚀 Iniciando bombardeo autenticado de ${cantidad} transacciones...`);
  const startTime = Date.now();
  let exitosas = 0, fallidas = 0;
  const errores = [];

  // Lotes de 20 para no saturar (ajustable)
  const concurrencia = 20;
  for (let i = 0; i < cantidad; i += concurrencia) {
    const lote = [];
    const fin = Math.min(i + concurrencia, cantidad);
    for (let j = i; j < fin; j++) {
      lote.push(crearVentaConAuth(j, idToken));
    }
    const resultados = await Promise.allSettled(lote);
    for (const r of resultados) {
      if (r.status === 'fulfilled' && r.value.success) exitosas++;
      else {
        fallidas++;
        errores.push(r.value?.error || r.reason?.message || 'Error');
      }
    }
    if (i + concurrencia < cantidad) await new Promise(resolve => setTimeout(resolve, 100));
  }

  const elapsed = (Date.now() - startTime) / 1000;
  res.json({
    total: cantidad,
    exitosas,
    fallidas,
    errores: errores.slice(0, 10),
    tiempoSegundos: elapsed
  });
});

app.get('/health', (req, res) => res.send('OK'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 Auth stress en puerto ${PORT}`));
