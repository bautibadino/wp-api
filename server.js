const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
const PORT = process.env.PORT || 10000; // Render usa puerto 10000

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS habilitado
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Estado del cliente
let client;
let isReady = false;
let qrCodeData = null;
let lastQrTime = null;

function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] ${message}`);
}

// Configuración optimizada para servicios gratuitos
function initializeWhatsApp() {
    log('🚀 Inicializando WhatsApp en servicio gratuito...');
    
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
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // Importante para servicios gratuitos
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-images', // Ahorra memoria
                '--disable-default-apps',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--memory-pressure-off',
                '--max_old_space_size=512', // Reducido para servicios gratuitos
                '--disable-ipc-flooding-protection'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable'
        }
    });

    // Eventos del cliente
    client.on('loading_screen', (percent, message) => {
        log(`⏳ Cargando... ${percent}% - ${message}`);
    });

    client.on('qr', (qr) => {
        log('📱 QR Code generado - Escanéalo con WhatsApp');
        qrCodeData = qr;
        lastQrTime = new Date();
        qrcode.generate(qr, { small: true });
        log(`🔗 QR disponible en: /api/qr`);
    });

    client.on('ready', () => {
        log('✅ WhatsApp conectado y listo!');
        isReady = true;
        qrCodeData = null;
        lastQrTime = null;
    });

    client.on('authenticated', () => {
        log('🔐 Autenticación exitosa');
    });

    client.on('auth_failure', (msg) => {
        log(`❌ Error de autenticación: ${msg}`, 'ERROR');
        isReady = false;
        setTimeout(() => {
            log('🔄 Reintentando autenticación...');
            initializeWhatsApp();
        }, 30000);
    });

    client.on('disconnected', (reason) => {
        log(`⚠️ Desconectado: ${reason}`, 'WARNING');
        isReady = false;
        qrCodeData = null;
        setTimeout(() => {
            log('🔄 Reconectando...');
            initializeWhatsApp();
        }, 10000);
    });

    client.on('message', async (message) => {
        // Log de mensajes recibidos (opcional)
        if (message.body && !message.isStatus) {
            log(`📨 Mensaje de ${message.from}: ${message.body.substring(0, 50)}...`);
        }
    });

    // Inicializar
    client.initialize().catch(err => {
        log(`❌ Error inicializando: ${err.message}`, 'ERROR');
        setTimeout(() => {
            initializeWhatsApp();
        }, 15000);
    });
}

// RUTAS DE LA API

// Health check (requerido por Render)
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        service: 'whatsapp-api',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        ready: isReady
    });
});

// Página principal con documentación
app.get('/', (req, res) => {
    res.json({
        message: '🚀 WhatsApp API funcionando en servicio GRATUITO!',
        status: isReady ? 'ready' : 'initializing',
        version: '1.0.0',
        platform: 'render-free',
        endpoints: {
            '📊 Estado': 'GET /api/status',
            '📱 QR Code': 'GET /api/qr',
            '💬 Enviar mensaje': 'POST /api/send-message',
            '🔍 Verificar número': 'GET /api/number-info/:number',
            '💬 Listar chats': 'GET /api/chats',
            '🔄 Reiniciar': 'POST /api/restart'
        },
        usage: {
            sendMessage: {
                url: 'POST /api/send-message',
                body: {
                    number: '5491234567890',
                    message: 'Hola desde la API!'
                }
            }
        }
    });
});

// Estado del servicio
app.get('/api/status', (req, res) => {
    const qrExpired = lastQrTime && (new Date() - lastQrTime) > 120000;
    
    res.json({
        success: true,
        status: isReady ? 'ready' : (qrCodeData && !qrExpired ? 'waiting_for_qr' : 'initializing'),
        ready: isReady,
        hasQR: !!qrCodeData && !qrExpired,
        platform: 'free-hosting',
        timestamp: new Date().toISOString(),
        lastQrTime: lastQrTime,
        uptime: Math.floor(process.uptime())
    });
});

// Obtener QR Code
app.get('/api/qr', (req, res) => {
    const qrExpired = lastQrTime && (new Date() - lastQrTime) > 120000;
    
    if (qrCodeData && !qrExpired) {
        res.json({
            success: true,
            qrCode: qrCodeData,
            message: '📱 Escanea este código QR con WhatsApp',
            instructions: '1. Abre WhatsApp en tu teléfono\n2. Ve a Configuración > Dispositivos vinculados\n3. Toca "Vincular un dispositivo"\n4. Escanea este código QR',
            expiresAt: new Date(lastQrTime.getTime() + 120000).toISOString()
        });
    } else if (isReady) {
        res.json({
            success: true,
            message: '✅ WhatsApp ya está conectado y funcionando',
            status: 'ready'
        });
    } else {
        res.json({
            success: false,
            message: qrExpired ? '⏰ QR Code expirado, generando uno nuevo...' : '⏳ Generando QR Code, espera unos segundos...',
            status: 'waiting',
            tip: 'Recarga esta página en unos segundos'
        });
        
        if (qrExpired) {
            qrCodeData = null;
            lastQrTime = null;
            setTimeout(() => {
                if (client) {
                    client.destroy().then(() => initializeWhatsApp());
                } else {
                    initializeWhatsApp();
                }
            }, 2000);
        }
    }
});

// Enviar mensaje
app.post('/api/send-message', async (req, res) => {
    try {
        if (!isReady) {
            return res.status(503).json({
                success: false,
                message: '❌ WhatsApp no está conectado',
                tip: 'Ve a /api/qr para conectar WhatsApp primero',
                status: 'not_ready'
            });
        }

        const { number, message } = req.body;

        if (!number || !message) {
            return res.status(400).json({
                success: false,
                message: '📝 Número y mensaje son requeridos',
                example: {
                    number: "5491234567890",
                    message: "¡Hola desde la API gratuita!"
                }
            });
        }

        // Formatear número
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
        
        log(`📤 Enviando mensaje a ${number}: ${message.substring(0, 50)}...`);

        // Enviar mensaje
        const sentMessage = await client.sendMessage(chatId, message);

        log(`✅ Mensaje enviado exitosamente a ${number}`);

        res.json({
            success: true,
            message: '✅ Mensaje enviado correctamente',
            to: number,
            messageId: sentMessage.id.id,
            timestamp: new Date().toISOString(),
            platform: 'free-hosting'
        });

    } catch (error) {
        log(`❌ Error enviando mensaje: ${error.message}`, 'ERROR');
        
        let errorMessage = 'Error enviando mensaje';
        if (error.message.includes('Chat not found')) {
            errorMessage = '❌ Número no válido o no tiene WhatsApp';
        } else if (error.message.includes('Rate limit')) {
            errorMessage = '⏰ Demasiados mensajes, espera un momento';
        }
        
        res.status(500).json({
            success: false,
            message: errorMessage,
            error: error.message,
            tip: 'Verifica que el número sea correcto y tenga WhatsApp'
        });
    }
});

// Verificar número
app.get('/api/number-info/:number', async (req, res) => {
    try {
        if (!isReady) {
            return res.status(503).json({
                success: false,
                message: '❌ WhatsApp no está conectado'
            });
        }

        const { number } = req.params;
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;

        const numberDetails = await client.getNumberId(chatId);
        
        res.json({
            success: true,
            exists: !!numberDetails,
            numberInfo: numberDetails || null,
            checked: number,
            message: numberDetails ? '✅ Número válido' : '❌ Número no tiene WhatsApp'
        });

    } catch (error) {
        log(`❌ Error verificando número: ${error.message}`, 'ERROR');
        res.status(500).json({
            success: false,
            message: 'Error verificando número',
            error: error.message
        });
    }
});

// Obtener chats
app.get('/api/chats', async (req, res) => {
    try {
        if (!isReady) {
            return res.status(503).json({
                success: false,
                message: '❌ WhatsApp no está conectado'
            });
        }

        const { limit = 20 } = req.query; // Reducido para servicios gratuitos
        const chats = await client.getChats();
        
        const chatList = chats.slice(0, parseInt(limit)).map(chat => ({
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            unreadCount: chat.unreadCount,
            lastMessage: chat.lastMessage ? {
                body: chat.lastMessage.body?.substring(0, 100) + (chat.lastMessage.body?.length > 100 ? '...' : ''),
                timestamp: chat.lastMessage.timestamp,
                from: chat.lastMessage.from
            } : null
        }));

        res.json({
            success: true,
            chats: chatList,
            total: chats.length,
            showing: chatList.length,
            platform: 'free-hosting'
        });

    } catch (error) {
        log(`❌ Error obteniendo chats: ${error.message}`, 'ERROR');
        res.status(500).json({
            success: false,
            message: 'Error obteniendo chats',
            error: error.message
        });
    }
});

// Reiniciar cliente
app.post('/api/restart', async (req, res) => {
    try {
        log('🔄 Reiniciando cliente WhatsApp...');
        
        if (client) {
            await client.destroy();
        }
        
        isReady = false;
        qrCodeData = null;
        lastQrTime = null;
        
        setTimeout(() => {
            initializeWhatsApp();
        }, 3000);

        res.json({
            success: true,
            message: '🔄 Cliente reiniciado',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        log(`❌ Error reiniciando: ${error.message}`, 'ERROR');
        res.status(500).json({
            success: false,
            message: 'Error reiniciando cliente',
            error: error.message
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: '🔍 Endpoint no encontrado',
        availableEndpoints: [
            'GET /',
            'GET /api/status',
            'GET /api/qr',
            'POST /api/send-message',
            'GET /api/number-info/:number',
            'GET /api/chats',
            'POST /api/restart'
        ]
    });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    log(`🚀 Servidor iniciado en puerto ${PORT}`);
    log(`🌐 Servicio gratuito activo`);
    log(`📱 Inicializando WhatsApp...`);
    
    // Esperar un poco antes de inicializar WhatsApp
    setTimeout(() => {
        initializeWhatsApp();
    }, 3000);
});

// Manejo de cierre limpio
process.on('SIGINT', async () => {
    log('👋 Cerrando aplicación...');
    if (client) {
        try {
            await client.destroy();
        } catch (error) {
            log(`Error cerrando cliente: ${error.message}`, 'ERROR');
        }
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    log('👋 Señal SIGTERM recibida...');
    if (client) {
        try {
            await client.destroy();
        } catch (error) {
            log(`Error cerrando cliente: ${error.message}`, 'ERROR');
        }
    }
    process.exit(0);
});