const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS
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
let initializationInProgress = false;

function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] ${message}`);
}

// Configuración OPTIMIZADA para Render
function initializeWhatsApp() {
    if (initializationInProgress) {
        log('⚠️ Inicialización ya en progreso, saltando...');
        return;
    }
    
    initializationInProgress = true;
    log('🚀 Inicializando WhatsApp para Render...');
    
    // Limpiar cliente anterior si existe
    if (client) {
        try {
            client.removeAllListeners();
            client.destroy();
        } catch (error) {
            log(`Error limpiando cliente anterior: ${error.message}`, 'WARNING');
        }
    }
    
    try {
        client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './whatsapp-session',
                clientId: "client-render"
            }),
            puppeteer: {
                headless: true,
                args: [
                    // Configuración básica para contenedores
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    
                    // Configuración de memoria optimizada
                    '--memory-pressure-off',
                    '--max_old_space_size=512',
                    
                    // Deshabilitar funciones innecesarias
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-web-security',
                    '--disable-features=TranslateUI',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-images',
                    '--disable-javascript', // Esto puede ayudar
                    '--disable-default-apps',
                    '--disable-sync',
                    '--disable-background-networking',
                    '--disable-component-update',
                    
                    // Configuración de red optimizada
                    '--aggressive-cache-discard',
                    '--disable-background-mode',
                    '--disable-hang-monitor',
                    '--disable-prompt-on-repost',
                    '--disable-client-side-phishing-detection',
                    '--disable-component-extensions-with-background-pages',
                    '--disable-default-apps',
                    '--disable-extensions-file-access-check',
                    '--disable-extensions-http-throttling',
                    
                    // User agent y viewport
                    '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    '--window-size=1366,768'
                ],
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
                timeout: 60000, // Timeout más largo
                protocolTimeout: 60000,
                // Configuración adicional para estabilidad
                ignoreDefaultArgs: ['--disable-extensions'],
                handleSIGINT: false,
                handleSIGTERM: false,
                handleSIGHUP: false
            },
            // Configuración adicional del cliente
            takeoverOnConflict: true,
            takeoverTimeoutMs: 60000
        });

        // Eventos del cliente
        client.on('loading_screen', (percent, message) => {
            log(`⏳ Cargando WhatsApp Web... ${percent}% - ${message}`);
        });

        client.on('qr', (qr) => {
            log('📱 ¡QR Code generado! Escanéalo con WhatsApp');
            qrCodeData = qr;
            lastQrTime = new Date();
            qrcode.generate(qr, { small: true });
            log(`🔗 QR disponible en tu URL/api/qr`);
            initializationInProgress = false; // Permitir nuevos intentos si es necesario
        });

        client.on('ready', () => {
            log('✅ ¡WhatsApp conectado y listo!');
            isReady = true;
            qrCodeData = null;
            lastQrTime = null;
            initializationInProgress = false;
        });

        client.on('authenticated', () => {
            log('🔐 Autenticación exitosa');
        });

        client.on('auth_failure', (msg) => {
            log(`❌ Error de autenticación: ${msg}`, 'ERROR');
            isReady = false;
            initializationInProgress = false;
            
            // Reintentar después de un tiempo
            setTimeout(() => {
                log('🔄 Reintentando autenticación...');
                initializeWhatsApp();
            }, 30000);
        });

        client.on('disconnected', (reason) => {
            log(`⚠️ WhatsApp desconectado: ${reason}`, 'WARNING');
            isReady = false;
            qrCodeData = null;
            initializationInProgress = false;
            
            // Reconectar automáticamente
            setTimeout(() => {
                log('🔄 Reconectando WhatsApp...');
                initializeWhatsApp();
            }, 15000);
        });

        client.on('message', async (message) => {
            if (message.body && !message.isStatus) {
                log(`📨 Mensaje recibido de ${message.from}: ${message.body.substring(0, 50)}...`);
                
                // Auto-respuesta básica para pruebas
                if (message.body.toLowerCase() === 'ping') {
                    try {
                        await message.reply('pong - API funcionando en Render! 🚀');
                        log('✅ Auto-respuesta enviada');
                    } catch (error) {
                        log(`Error enviando auto-respuesta: ${error.message}`, 'ERROR');
                    }
                }
            }
        });

        // Manejar errores del cliente
        client.on('error', (error) => {
            log(`❌ Error del cliente WhatsApp: ${error.message}`, 'ERROR');
            initializationInProgress = false;
        });

        // Inicializar cliente con manejo de errores robusto
        log('🔧 Iniciando cliente WhatsApp...');
        client.initialize().catch(err => {
            log(`❌ Error durante inicialización: ${err.message}`, 'ERROR');
            initializationInProgress = false;
            
            // Reintentar después de un tiempo más largo
            setTimeout(() => {
                log('🔄 Reintentando inicialización...');
                initializeWhatsApp();
            }, 60000); // 1 minuto
        });

    } catch (error) {
        log(`❌ Error creando cliente WhatsApp: ${error.message}`, 'ERROR');
        initializationInProgress = false;
        
        // Reintentar
        setTimeout(() => {
            initializeWhatsApp();
        }, 30000);
    }
}

// RUTAS DE LA API

// Health check (requerido por Render)
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        service: 'whatsapp-api-render',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        ready: isReady,
        memory: process.memoryUsage(),
        version: '1.0.1'
    });
});

// Página principal
app.get('/', (req, res) => {
    res.json({
        message: '🚀 WhatsApp API funcionando en Render!',
        status: isReady ? 'ready' : (qrCodeData ? 'waiting_for_qr' : 'initializing'),
        version: '1.0.1',
        platform: 'render-free',
        uptime: Math.floor(process.uptime()),
        endpoints: {
            '📊 Estado': 'GET /api/status',
            '📱 QR Code': 'GET /api/qr',
            '💬 Enviar mensaje': 'POST /api/send-message',
            '🔍 Verificar número': 'GET /api/number-info/:number',
            '💬 Listar chats': 'GET /api/chats',
            '🔄 Reiniciar': 'POST /api/restart',
            '❤️ Health': 'GET /health'
        },
        usage_example: {
            send_message: {
                method: 'POST',
                url: '/api/send-message',
                body: {
                    number: '5491234567890',
                    message: 'Hola desde Render!'
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
        initializing: initializationInProgress,
        platform: 'render-free',
        timestamp: new Date().toISOString(),
        lastQrTime: lastQrTime,
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage()
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
            instructions: [
                '1. Abre WhatsApp en tu teléfono',
                '2. Ve a Configuración > Dispositivos vinculados',
                '3. Toca "Vincular un dispositivo"',
                '4. Escanea este código QR'
            ],
            expiresAt: new Date(lastQrTime.getTime() + 120000).toISOString(),
            timeLeft: Math.max(0, 120 - Math.floor((new Date() - lastQrTime) / 1000))
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
            initializing: initializationInProgress,
            tip: 'Recarga esta página en 10-30 segundos'
        });
        
        // Si el QR expiró o no hay inicialización en progreso, intentar reiniciar
        if ((qrExpired || !initializationInProgress) && !isReady) {
            qrCodeData = null;
            lastQrTime = null;
            setTimeout(() => {
                if (!initializationInProgress) {
                    initializeWhatsApp();
                }
            }, 3000);
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
                    message: "¡Hola desde Render!"
                }
            });
        }

        // Formatear número
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
        
        log(`📤 Enviando mensaje a ${number}: ${message.substring(0, 50)}...`);

        // Enviar mensaje con timeout
        const sentMessage = await Promise.race([
            client.sendMessage(chatId, message),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout sending message')), 30000)
            )
        ]);

        log(`✅ Mensaje enviado exitosamente a ${number}`);

        res.json({
            success: true,
            message: '✅ Mensaje enviado correctamente',
            to: number,
            messageId: sentMessage.id.id,
            timestamp: new Date().toISOString(),
            platform: 'render'
        });

    } catch (error) {
        log(`❌ Error enviando mensaje: ${error.message}`, 'ERROR');
        
        let errorMessage = 'Error enviando mensaje';
        if (error.message.includes('Chat not found')) {
            errorMessage = '❌ Número no válido o no tiene WhatsApp';
        } else if (error.message.includes('Rate limit')) {
            errorMessage = '⏰ Demasiados mensajes, espera un momento';
        } else if (error.message.includes('Timeout')) {
            errorMessage = '⏰ Timeout enviando mensaje, intenta de nuevo';
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

        const { limit = 20 } = req.query;
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
            platform: 'render'
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
            try {
                await client.destroy();
            } catch (e) {
                log(`Error destruyendo cliente: ${e.message}`, 'WARNING');
            }
        }
        
        isReady = false;
        qrCodeData = null;
        lastQrTime = null;
        initializationInProgress = false;
        
        setTimeout(() => {
            initializeWhatsApp();
        }, 5000);

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
            'POST /api/restart',
            'GET /health'
        ]
    });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    log(`🚀 Servidor WhatsApp API iniciado en puerto ${PORT}`);
    log(`🌐 Plataforma: Render (gratuito)`);
    log(`📱 Inicializando WhatsApp en 5 segundos...`);
    
    // Esperar un poco más antes de inicializar WhatsApp
    setTimeout(() => {
        initializeWhatsApp();
    }, 5000);
});

// Manejo de cierre limpio
process.on('SIGINT', async () => {
    log('👋 Cerrando aplicación (SIGINT)...');
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
    log('👋 Cerrando aplicación (SIGTERM)...');
    if (client) {
        try {
            await client.destroy();
        } catch (error) {
            log(`Error cerrando cliente: ${error.message}`, 'ERROR');
        }
    }
    process.exit(0);
});

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
    log(`❌ Unhandled Rejection: ${reason}`, 'ERROR');
});

process.on('uncaughtException', (error) => {
    log(`❌ Uncaught Exception: ${error.message}`, 'ERROR');
});