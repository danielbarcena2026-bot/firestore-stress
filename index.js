const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ========== CONFIGURACIÓN ==========
// La API Key la tomamos de las variables de entorno (más seguro)
const API_KEY = process.env.FIRESTORE_API_KEY || 'AIzaSyBx9Np7t_-loUBFX-m-bfFAvjn4dvlkk-s';
const PROJECT_ID = 'magiccal1';
const COLLECTION = 'ventas';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

console.log(`🔑 API Key usada: ${API_KEY.substring(0, 10)}... (oculta por seguridad)`);

// ========== FUNCIÓN PARA CREAR VENTA FALSA ==========
async function crearVenta(index) {
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
      nota: { stringValue: `Prueba de estrés REST #${index} - ${ahora}` }
    }
  };

  const url = `${BASE_URL}/${COLLECTION}?key=${API_KEY}`;

  try {
    const response = await axios.post(url, venta, {
      headers: { 'Content-Type': 'application/json' }
    });
    return { success: true, id: response.data.name };
  } catch (error) {
    const mensaje = error.response?.data?.error?.message || error.message;
    return { success: false, error: mensaje };
  }
}

// ========== FUNCIÓN DE PRUEBA DE ESTRÉS ==========
async function pruebaDeEstres(cantidad, concurrencia = 50) {
  console.log(`🚀 Iniciando bombardeo de ${cantidad} transacciones (REST API)...`);
  const startTime = Date.now();

  let exitosas = 0, fallidas = 0;
  const errores = [];

  for (let i = 0; i < cantidad; i += concurrencia) {
    const lote = [];
    const finLote = Math.min(i + concurrencia, cantidad);

    for (let j = i; j < finLote; j++) {
      lote.push(crearVenta(j));
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
  console.log(`✅ Exitosas: ${exitosas}, ❌ Fallidas: ${fallidas} en ${elapsed}s`);

  return {
    total: cantidad,
    exitosas,
    fallidas,
    errores: errores.slice(0, 10),
    tiempoSegundos: elapsed
  };
}

// ========== ENDPOINTS ==========
app.get('/stress/:cantidad', async (req, res) => {
  const cantidad = parseInt(req.params.cantidad);
  if (isNaN(cantidad) || cantidad < 1) {
    return res.status(400).json({ error: 'La cantidad debe ser un número positivo' });
  }
  if (cantidad > 10000) {
    return res.status(400).json({ error: 'Máximo permitido: 10,000' });
  }

  try {
    const resultado = await pruebaDeEstres(cantidad);
    res.status(200).json(resultado);
  } catch (error) {
    console.error('Error en prueba:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Servidor de estrés (REST) escuchando en puerto ${PORT}`);
  console.log(`📌 Ejemplo de uso: GET https://tu-servicio.onrender.com/stress/500`);
});