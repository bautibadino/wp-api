const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware básico
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS simple
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Estado global
let client = null;
let isReady = false;
let qrCodeData = null;
let lastQrTime = null;
let isInitializing = false;

function log(message, type = 'INFO') {
    console.log(`[${new Date().toISOString()}] [${type}] ${message}`);
}

// Configuración MÍNIMA para servicios gratuitos
async function initWhatsApp() {
    if (isInitializing) {
        log('⚠️ Ya inicializando, saltando...');
        return;
    }
    
    isInitializing = true;
    log('🚀 Iniciando WhatsApp (modo ligero)...');
    
    try {
        // Limpiar cliente anterior
        if (client) {
            try {
                await client.destroy();
                client = null;
            } catch (e) {
                log(`Warning destruyendo cliente: ${e.message}`, 'WARNING');
            }
        }
        
        // Cliente con configuración MÍNIMA
        client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './whatsapp-session'
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--single-process',
                    '--no-zygote',
                    '--memory-pressure-off',
                    '--max_old_space_size=256', // MUY limitado
                    '--disable-features=VizDisplayCompositor',
                    '--disable-extensions',
                    '--disable-default-apps',
                    '--disable-background-timer-throttling'
                ],
                timeout: 45000
            }
        });

        // Eventos básicos
        client.on('qr', (qr) => {
            log('📱 QR generado!');
            qrCodeData = qr;
            lastQrTime = new Date();
            qrcode.generate(qr, { small: true });
            isInitializing = false;
        });

        client.on('ready', () => {
            log('✅ WhatsApp listo!');
            isReady = true;
            qrCodeData = null;
            isInitializing = false;
        });

        client.on('auth_failure', (msg) => {
            log(`❌ Auth falla: ${msg}`, 'ERROR');
            isReady = false;
            isInitializing = false;
        });

        client.on('disconnected', (reason) => {
            log(`⚠️ Desconectado: ${reason}`, 'WARNING');
            isReady = false;
            isInitializing = false;
            
            // NO auto-reconectar para evitar loops
        });

        // Inicializar UNA sola vez
        await client.initialize();
        
    } catch (error) {
        log(`❌ Error: ${error.message}`, 'ERROR');
        isInitializing = false;
        client = null;
        
        // NO reintentar automáticamente
    }
}

// RUTAS BÁSICAS

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        ready: isReady,
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.json({
        message: '🚀 WhatsApp API Ligera',
        status: isReady ? 'ready' : 'not_ready',
        endpoints: {
            status: 'GET /api/status',
            qr: 'GET /api/qr',
            send: 'POST /api/send-message',
            restart: 'POST /api/restart'
        }
    });
});

app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        ready: isReady,
        hasQR: !!qrCodeData,
        initializing: isInitializing,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/qr', (req, res) => {
    if (qrCodeData) {
        res.json({
            success: true,
            qrCode: qrCodeData,
            message: 'Escanea con WhatsApp'
        });
    } else if (isReady) {
        res.json({
            success: true,
            message: 'Ya conectado',
            status: 'ready'
        });
    } else {
        res.json({
            success: false,
            message: 'No hay QR disponible',
            tip: 'Usa /api/restart para generar'
        });
    }
});

app.post('/api/send-message', async (req, res) => {
    try {
        if (!isReady || !client) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp no conectado'
            });
        }

        const { number, message } = req.body;
        if (!number || !message) {
            return res.status(400).json({
                success: false,
                message: 'Faltan number y message'
            });
        }

        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
        
        // Timeout de 15 segundos
        const sentMessage = await Promise.race([
            client.sendMessage(chatId, message),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 15000)
            )
        ]);

        res.json({
            success: true,
            message: 'Enviado',
            messageId: sentMessage.id.id
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.post('/api/restart', async (req, res) => {
    try {
        log('🔄 Reinicio manual...');
        
        if (client) {
            await client.destroy();
            client = null;
        }
        
        isReady = false;
        qrCodeData = null;
        isInitializing = false;
        
        // Inicializar después de 3 segundos
        setTimeout(() => {
            initWhatsApp();
        }, 3000);

        res.json({
            success: true,
            message: 'Reiniciando...'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 404
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        endpoints: ['/', '/api/status', '/api/qr', '/api/send-message', '/api/restart']
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    log(`🚀 Servidor en puerto ${PORT}`);
    log(`📱 Para conectar WhatsApp: /api/restart`);
});

// Manejo limpio de señales
process.on('SIGTERM', async () => {
    log('👋 SIGTERM recibido');
    if (client) {
        try {
            await client.destroy();
        } catch (e) {}
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    log('👋 SIGINT recibido');
    if (client) {
        try {
            await client.destroy();
        } catch (e) {}
    }
    process.exit(0);
});